/** Minuscules, sans accents, œ/æ développés : sert à l'indexation et aux requêtes. */
export function normalize(input: string): string {
  return input
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Échappe % et _ pour un LIKE ... ESCAPE '\'. */
export function escapeLike(input: string): string {
  return input.replace(/[\\%_]/g, (c) => `\\${c}`)
}
