import { test, expect } from 'claude-code/testing'
import { clip, lastAssistantText } from './register'

test('picks the newest assistant message that has text', () => {
  expect(lastAssistantText([
    { role: 'assistant', text: 'first' },
    { role: 'user', text: 'q' },
    { role: 'assistant', text: '  ' },
  ])).toBe('first')
  expect(lastAssistantText([{ role: 'user', text: 'q' }])).toBeNull()
})

test('clips very long messages', () => {
  expect(clip('short').isClipped).toBe(false)
  expect(clip('x'.repeat(30_000))).toMatchObject({ isClipped: true })
})
