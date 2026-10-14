import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { View } from '../types'

const PANE = 'pl-msg'
const MODEL = 'claude-haiku-5-5'
const MAX_CHARS = 24_000
const TIMEOUT_MS = 90_000

export const SYSTEM =
  'You translate a message written by an AI assistant into natural Polish for a Polish developer. ' +
  'Keep the meaning and the markdown structure (headings, lists, tables). ' +
  'Leave code blocks, inline code, commands, file paths, URLs and identifiers unchanged. ' +
  'Reply with the translation only, no preface.'

const view = atom({ plugin: 'pl-msg', key: 'view' } as const, { status: 'idle', text: '', chars: 0 } as View)

export const lastAssistantText = (messages: readonly { role: string; text: string }[]): string | null => {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]!
    if (m.role === 'assistant' && m.text.trim()) return m.text.trim()
  }
  return null
}

export const clip = (text: string): { text: string; isClipped: boolean } =>
  text.length > MAX_CHARS ? { text: text.slice(0, MAX_CHARS), isClipped: true } : { text, isClipped: false }

// Only the newest request may write its answer, so a slow older one cannot overwrite a newer one.
let ticket = 0

async function translate($: EngineInterface, source: string): Promise<void> {
  const mine = ++ticket
  const { text, isClipped } = clip(source)
  await update($, view, () => ({ status: 'busy', text: '', chars: source.length }))
  const r = await $.model
    .complete({ model: MODEL, system: SYSTEM, prompt: text, maxTokens: 8000, timeoutMs: TIMEOUT_MS })
    .catch((err: unknown) => ({ isAnswered: false as const, reason: `error: ${String(err).slice(0, 80)}` }))
  if (mine !== ticket) return
  const next: View = r.isAnswered
    ? { status: 'done', text: r.text.trim() + (isClipped ? `\n\n(… tłumaczenie skrócone: pierwsze ${MAX_CHARS} znaków)` : ''), chars: source.length }
    : { status: 'error', text: `Translation failed (${'reason' in r ? r.reason : 'unknown'})`, chars: source.length }
  await update($, view, () => next)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'pl-msg', description: 'Translate the last assistant message to Polish in a side pane' })
    return next(e)
  })

  on('command.run', { command: 'pl-msg' }, async $ => {
    const source = lastAssistantText(await $.session.messages())
    if (source === null) return { text: 'pl-msg: no assistant message to translate yet.' }
    await $.ui.open({ id: PANE, title: 'PL ← last message', columns: 72, closeOnEscape: true })
    void translate($, source)
    return { text: 'Translating the last message to Polish (Esc closes the pane).' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const v = await read($, view)
    return (
      <Box flexDirection="column">
        {v.status === 'busy' && <Text dimColor>Tłumaczę ({v.chars} znaków)…</Text>}
        {v.status === 'error' && <Text color="red">{v.text}</Text>}
        {v.status === 'done' && <Text>{v.text}</Text>}
      </Box>
    )
  })
}
