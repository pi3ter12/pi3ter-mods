import { test, expect } from 'claude-code/testing'
import { summarize } from './register'

test('summarize formats windows and reset time', () => {
  const iso = new Date(2026, 9, 14, 14, 15).toISOString()
  const s = summarize({
    windows: [
      { kind: 'five_hour', percentUsed: 30.2, baseline: 0, resetsAt: iso },
      { kind: 'seven_day', percentUsed: 12, baseline: 0 },
    ],
    usd: null,
  })
  expect(s).toBe('Usage: 5h - 30%, week - 12%, resets: 14:15')
})
