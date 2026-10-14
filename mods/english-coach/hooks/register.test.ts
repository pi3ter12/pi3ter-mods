import { test, expect } from 'claude-code/testing'
import { diffWords, isPolish, logLine, parseReply, shouldCoach, statsText } from './register'

test('skips commands, tiny drafts and Polish', () => {
  expect(shouldCoach('/reload-plugins')).toBe(false)
  expect(shouldCoach('ok')).toBe(false)
  expect(shouldCoach('I has a question')).toBe(true)
  expect(shouldCoach('Zrób to jeszcze raz')).toBe(false)
  expect(isPolish('nie wiem czy to działa')).toBe(true)
  expect(isPolish('please add a button to the page')).toBe(false)
})

test('diff marks removed and added words', () => {
  expect(diffWords('I has a dog', 'I have a dog')).toEqual([
    { text: 'I', kind: 'same' },
    { text: 'has', kind: 'del' },
    { text: 'have', kind: 'add' },
    { text: 'a', kind: 'same' },
    { text: 'dog', kind: 'same' },
  ])
})

test('parseReply reads the four lines', () => {
  const n = parseReply('FIXED: I have a dog\nWHY: have zamiast has\nCAT: tenses\nPL: Mam psa', 'I has a dog')
  expect(n?.fixed).toBe('I have a dog')
  expect(n?.category).toBe('tenses')
  expect(n?.polish).toBe('Mam psa')
  expect(parseReply('FIXED: I have a dog\nWHY: OK\nCAT: other\nPL: x', 'I have a dog')?.isCorrect).toBe(true)
  expect(parseReply('nonsense', 'I has a dog')).toBeNull()
})

test('log line and stats', () => {
  const n = parseReply('FIXED: I have a dog\nWHY: x\nCAT: tenses\nPL: y', 'I has a dog')!
  const line = logLine('2026-10-14', n)
  expect(line).toBe('- 2026-10-14 | tenses | I has a dog → I have a dog | x')
  expect(statsText(`# t\n\n${line}\n${line}\n`, '2026-10-15', '/x/log.md')).toContain('2 mistakes logged (2 in the last 7 days)')
})
