import { humanizeMediaName } from './libraryPresentation'

export function buildSuggestedPairingTitle(moviePathOrName: string, reactorName?: string): string | undefined {
  const cleanReactor = reactorName
    ?.replace(/[\u0000-\u001f\u007f-\u009f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!cleanReactor) {
    return undefined
  }

  return `${humanizeMediaName(moviePathOrName)} — ${cleanReactor}`
}
