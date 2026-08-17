const distance = (a: string, b: string): number => {
  let row = Array.from({ length: b.length + 1 }, (_, index) => index)
  for (let i = 1; i <= a.length; i++) {
    const next = [i]
    for (let j = 1; j <= b.length; j++)
      next[j] = Math.min(
        (row[j] ?? 0) + 1,
        (next[j - 1] ?? 0) + 1,
        (row[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
    row = next
  }
  return row[b.length] ?? 0
}

/** Closest match to a typo. Under a third of the word may differ. */
export const suggest = (
  input: string,
  candidates: string[],
): string | undefined =>
  candidates
    .map((name) => ({ name, score: distance(input, name) }))
    .filter(
      ({ score, name }) => score <= Math.max(input.length, name.length) / 3,
    )
    .sort((left, right) => left.score - right.score)[0]?.name
