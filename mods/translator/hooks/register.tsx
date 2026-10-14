import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Translation } from '../types'

const PANE = 'translator'
const MODEL = 'claude-haiku-5-5'
const SYSTEM =
  'You are a Polish-to-English translator. Translate the user text into natural English. ' +
  'Reply with the translation only. If a single word has several meanings, give up to three ' +
  'short alternatives separated by " / ". No explanations unless the text is idiomatic, ' +
  'in which case add a brief note in parentheses.'

const history = atom({ plugin: 'translator', key: 'history' } as const, [])
const isBusy = atom({ plugin: 'translator', key: 'isBusy' } as const, false)

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'translator',
      description: 'Open a pane that translates Polish to English',
    })

    return next(e)
  })

  on('command.run', { command: 'translator' }, async $ => {
    await $.ui.open({
      id: PANE,
      title: 'PL → EN',
      focus: true,
      closeOnEscape: true,
    })

    return { text: 'Translator opened. Type Polish text and press Enter.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Input } = $.ui.resolve(e)
    const list = await read($, history)
    const busy = await read($, isBusy)
    const room = Math.max(1, Math.floor(((e.viewport?.rows ?? 24) - 6) / 3))

    const submit = async (value: string) => {
      const source = value.trim()
      if (source === '') return
      await update($, isBusy, () => true)
      const r = await $.model.complete({
        model: MODEL,
        system: SYSTEM,
        prompt: source,
        timeoutMs: 20000,
      })
      const entry: Translation = r.isAnswered
        ? { source, text: r.text.trim(), isError: false }
        : { source, text: `translation failed (${r.reason})`, isError: true }
      await update($, history, h => [...h, entry].slice(-50))
      await update($, isBusy, () => false)
    }

    return (
      <Box flexDirection="column">
        {list.length === 0 && <Text dimColor>Type Polish text below, Enter to translate.</Text>}
        {list.slice(-room).map(t => (
          <Box flexDirection="column" marginBottom={1}>
            <Text dimColor>{t.source}</Text>
            <Text color={t.isError ? 'red' : 'green'}>{t.text}</Text>
          </Box>
        ))}
        {busy && <Text dimColor>translating…</Text>}
        <Input
          key="src"
          label="PL"
          placeholder="wpisz tekst…"
          submitLabel="translate"
          autoFocus
          onSubmit={submit}
        />
      </Box>
    )
  })
}
