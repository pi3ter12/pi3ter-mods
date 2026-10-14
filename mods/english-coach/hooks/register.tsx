import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Note } from '../types'

const note = atom({ plugin: 'english-coach', key: 'note' } as const, null)

const MODEL = 'claude-haiku-5-5'
const TIMEOUT_MS = 6000
const CATEGORIES = ['articles', 'tenses', 'prepositions', 'word-order', 'vocabulary', 'spelling', 'punctuation', 'other']
const ACCEPT_KEYS = ['tab', 'y'] // Tab, or Ctrl+Y

export const SYSTEM = `You are an English writing coach for a Polish speaker. You get one chat message they wrote in English.
Reply with exactly four lines:
FIXED: <the whole message, corrected with minimal changes; if already correct, repeat it unchanged>
WHY: <max 15 words in Polish: what is wrong and the rule; "OK" if nothing is wrong>
CAT: <main mistake category, one of: ${CATEGORIES.join(', ')}>
PL: <natural Polish translation of FIXED>
Keep code, paths and commands unchanged. Output nothing else.`

const POLISH_WORDS = new Set([
  'się', 'nie', 'jest', 'czy', 'jak', 'że', 'żeby', 'proszę', 'zrób', 'dodaj', 'możesz', 'tak', 'ale', 'który',
  'tutaj', 'tylko', 'mam', 'teraz', 'jeszcze', 'bardzo', 'chcę', 'możemy', 'dlaczego', 'gdzie', 'to', 'na', 'co',
])
const STRONG = /[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/

// Local check, so a Polish message never waits for Haiku.
export const isPolish = (text: string): boolean => {
  if (STRONG.test(text)) return true
  const words = text.toLowerCase().split(/[^a-ząćęłńóśźż]+/).filter(Boolean)
  const hits = words.filter(w => POLISH_WORDS.has(w) && w !== 'to' && w !== 'na' && w !== 'co').length
  return hits >= 2
}

export const shouldCoach = (text: string): boolean => {
  const t = text.trim()
  return t.length >= 8 && !t.startsWith('/') && !isPolish(t)
}

export const parseReply = (reply: string, original: string): Note | null => {
  const fixed = /^FIXED:\s*(.+)$/m.exec(reply)?.[1]?.trim()
  if (!fixed) return null
  const why = /^WHY:\s*(.+)$/m.exec(reply)?.[1]?.trim() ?? ''
  const cat = /^CAT:\s*(.+)$/m.exec(reply)?.[1]?.trim().toLowerCase() ?? 'other'
  const polish = /^PL:\s*(.+)$/m.exec(reply)?.[1]?.trim() ?? ''
  const isCorrect = fixed === original.trim()
  return {
    original,
    fixed,
    why: isCorrect ? '' : why,
    category: CATEGORIES.includes(cat) ? cat : 'other',
    isCorrect,
    polish,
  }
}

export type Part = { text: string; kind: 'same' | 'del' | 'add' }

// Word-level diff (LCS): words only in `a` are deletions, only in `b` are additions.
export const diffWords = (a: string, b: string): Part[] => {
  const x = a.split(/\s+/).filter(Boolean)
  const y = b.split(/\s+/).filter(Boolean)
  const lcs: number[][] = Array.from({ length: x.length + 1 }, () => new Array<number>(y.length + 1).fill(0))
  for (let i = x.length - 1; i >= 0; i--)
    for (let j = y.length - 1; j >= 0; j--)
      lcs[i]![j] = x[i] === y[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!)
  const out: Part[] = []
  let i = 0
  let j = 0
  while (i < x.length && j < y.length) {
    if (x[i] === y[j]) out.push({ text: x[i++]!, kind: 'same' }), j++
    else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) out.push({ text: x[i++]!, kind: 'del' })
    else out.push({ text: y[j++]!, kind: 'add' })
  }
  while (i < x.length) out.push({ text: x[i++]!, kind: 'del' })
  while (j < y.length) out.push({ text: y[j++]!, kind: 'add' })
  return out
}

export const logLine = (date: string, n: Note): string =>
  `- ${date} | ${n.category} | ${n.original.replace(/\s+/g, ' ')} → ${n.fixed.replace(/\s+/g, ' ')} | ${n.why}`

export const statsText = (log: string, today: string, path: string): string => {
  const rows = log.split('\n').filter(l => l.startsWith('- '))
  if (!rows.length) return 'English coach: no mistakes logged yet.'
  const counts = new Map<string, number>()
  let week = 0
  const weekAgo = new Date(new Date(today).getTime() - 7 * 86_400_000).toISOString().slice(0, 10)
  for (const r of rows) {
    const [date = '', cat = 'other'] = r.slice(2).split(' | ')
    counts.set(cat, (counts.get(cat) ?? 0) + 1)
    if (date >= weekAgo) week++
  }
  const top = [...counts].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([c, k]) => `${c}: ${k}`)
  return `English coach: ${rows.length} mistakes logged (${week} in the last 7 days).\nMost common: ${top.join(', ')}\nLog: ${path}`
}

// The text held back last (pressing Enter again on it sends it as typed) and the correction shown for it.
let held: string | null = null
let current: Note | null = null

async function logPath($: EngineInterface): Promise<string> {
  return `${(await $.env.get('HOME')) ?? '.'}/english-mistakes.md`
}

async function isEnabled($: EngineInterface): Promise<boolean> {
  return (await $.store.get('enabled')) !== false
}

async function clear($: EngineInterface): Promise<void> {
  held = null
  current = null
  await update($, note, () => null)
}

async function send($: EngineInterface, text: string): Promise<void> {
  await clear($)
  await $.prompt.fill({ text: '', mode: 'replace' })
  await $.prompt.submit({ text, asUser: true })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'coach', description: 'English coach: /coach on | off | stats' })
    return next(e)
  })

  on('command.run', { command: 'coach' }, async ($, e) => {
    const arg = String((e as { args?: string }).args ?? '').trim().toLowerCase()
    if (arg === 'on' || arg === 'off') {
      await $.store.set('enabled', arg === 'on')
      return { text: `English coach: ${arg}` }
    }
    if (arg === 'stats') {
      const path = await logPath($)
      const log = await $.fs.read(path).catch(() => '')
      const today = new Date(await $.clock.now()).toISOString().slice(0, 10)
      return { text: statsText(typeof log === 'string' ? log : '', today, path) }
    }
    return { text: `English coach is ${(await isEnabled($)) ? 'on' : 'off'}. Use /coach on | off | stats.` }
  })

  // Shortcut: Tab or Ctrl+Y sends the corrected version while a correction is shown.
  on('prompt.edit', async ($, e, next) => {
    const k = e.key
    if (current && held !== null && e.text.trim() === held && k && ACCEPT_KEYS.includes(k.key) && (k.key === 'tab' || k.ctrl)) {
      const fixed = current.fixed
      void send($, fixed).catch(() => {})
      return { text: e.text, cursor: e.cursor }
    }
    return next(e)
  })

  // On Enter, Haiku checks the prompt (no history, so the conversation's context is untouched).
  // Correct: it is sent as typed. Otherwise it is held back and the person picks which version to send.
  on('prompt.submit', async ($, e, next) => {
    if (held !== null && e.text.trim() === held && e.origin?.kind !== 'plugin') {
      await clear($)
      return next(e)
    }
    await clear($)
    if (e.command || e.isMeta || e.origin?.kind === 'plugin' || !shouldCoach(e.text) || !(await isEnabled($))) return next(e)

    $.ui.status('English coach: checking…')
    const r = await $.model
      .complete({ model: MODEL, system: SYSTEM, prompt: e.text, maxTokens: 300, timeoutMs: TIMEOUT_MS })
      .catch((err: unknown) => ({ isAnswered: false as const, reason: `error: ${String(err).slice(0, 80)}` }))
    $.ui.status(undefined)

    if (!r.isAnswered) {
      const why = 'reason' in r ? `${r.reason}${'status' in r ? ` ${String(r.status)}` : ''}` : 'unknown'
      $.ui.toast(`English coach unavailable (${why}), sent as typed`, { timeoutMs: 600_000 })
      return next(e)
    }
    const parsed = parseReply(r.text, e.text)
    if (!parsed || parsed.isCorrect) return next(e)

    held = e.text.trim()
    current = parsed
    await update($, note, () => parsed)
    void (async () => {
      const date = new Date(await $.clock.now()).toISOString().slice(0, 10)
      const path = await logPath($)
      const old = await $.fs.read(path).catch(() => '# English mistakes\n\n')
      await $.fs.write(path, `${typeof old === 'string' ? old : ''}${logLine(date, parsed)}\n`)
      // The engine puts the draft back after a drop; set it once more, later, so it is there exactly once.
      await $.clock.sleep(200)
      await $.prompt.fill({ text: e.text, mode: 'replace' })
    })().catch(() => {})
    return { drop: 'English coach: pick a version below' }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const n = await read($, note)
    if (!n || e.props.hasSurvey) return next(e)
    const { Box, Text, Button } = $.ui.resolve(e)
    const parts = diffWords(n.original, n.fixed)
    return (
      <Box flexDirection="column" borderStyle="round" borderColor="yellow" paddingX={1}>
        <Text dimColor>English coach{n.why ? `: ${n.why}` : ''}</Text>
        <Text>
          {parts.map((p, i) => (
            <Text
              key={i}
              color={p.kind === 'del' ? 'red' : p.kind === 'add' ? 'green' : undefined}
              strikethrough={p.kind === 'del'}
            >
              {p.text}{' '}
            </Text>
          ))}
        </Text>
        {n.polish ? <Text dimColor italic>PL: {n.polish}</Text> : null}
        <Box>
          <Text dimColor>Enter: moje · Tab / Ctrl+Y: poprawione   </Text>
          <Button key="fixed" label="Poprawione" onPress={() => send($, n.fixed)} />
          <Text> </Text>
          <Button key="mine" label="Moje" onPress={() => send($, n.original)} />
          <Text> </Text>
          <Button key="edit" label="Edytuj" onPress={() => clear($)} />
        </Box>
      </Box>
    )
  })
}
