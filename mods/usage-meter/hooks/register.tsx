import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Meter } from '../types'

const meter = atom({ plugin: 'usage-meter', key: 'meter' } as const, null)

const LABELS: Record<string, string> = { five_hour: '5h', seven_day: 'week', spend_limit: 'spend' }

export const label = (kind: string) => LABELS[kind] ?? kind
export const fmt = (n: number) => Math.round(n).toString()

const hhmm = (iso: string): string => {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export const summarize = (m: Meter): string => {
  const parts = m.windows.map(w => `${label(w.kind)} - ${fmt(w.percentUsed)}%`)
  const next = m.windows.find(w => w.kind === 'five_hour' && w.resetsAt) ?? m.windows.find(w => w.resetsAt)
  const reset = next?.resetsAt ? hhmm(next.resetsAt) : ''
  if (reset) parts.push(`resets: ${reset}`)
  return parts.length ? `Usage: ${parts.join(', ')}` : ''
}

export const register: Register = on => {
  // Percent used per window when this session first saw it; the session's share is the growth since.
  const baselines = new Map<string, number>()

  on('session.measure', async ($, e, next) => {
    const windows = e.rateLimits.map(w => {
      if (!baselines.has(w.kind)) baselines.set(w.kind, w.percentUsed)
      return { kind: w.kind, percentUsed: w.percentUsed, baseline: baselines.get(w.kind) ?? 0, resetsAt: w.resetsAt }
    })
    const m: Meter = { windows, usd: e.cost?.usd ?? null }
    await update($, meter, () => m)

    const hot = windows.find(w => w.percentUsed >= 90)
    if (hot && (e.changed as string[]).includes('rateLimits')) {
      $.ui.toast(`${label(hot.kind)} limit at ${fmt(hot.percentUsed)}%`)
    }
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const rest = await next(e)
    const m = await read($, meter)
    if (e.props.hasSurvey || m === null) return rest
    const text = summarize(m)
    if (!text) return rest

    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="column">
        {rest}
        <Box justifyContent="flex-end">
          <Text dimColor>{text}</Text>
        </Box>
      </Box>
    )
  })
}
