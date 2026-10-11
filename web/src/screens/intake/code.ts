import type { CodeLine } from './kit'

/** Lines of a source text; "#" and "//" lines read as comments. */
export const codeLines = (text: string): CodeLine[] =>
  text.split('\n').map((t) => ({ text: t, tone: /^\s*(#|\/\/)/.test(t) ? 'comment' : undefined }))
