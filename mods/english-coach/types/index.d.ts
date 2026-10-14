export type Note = {
  original: string
  fixed: string
  why: string
  category: string
  isCorrect: boolean
  polish: string
}

declare module 'claude-code' {
  interface PluginState {
    'english-coach': { note: Note | null }
  }
}
