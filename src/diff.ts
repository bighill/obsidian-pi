export type DiffLine = {
  type: 'same' | 'remove' | 'add'
  text: string
}

const MAX_DIFF_CELLS = 2_000_000

/**
 * Compute a line-level diff of two strings.
 *
 * Returns `null` when the inputs are too large to diff cheaply or when
 * either input is missing. Callers should fall back to a raw text view in
 * those cases.
 */
export function computeLineDiff(oldText: string, newText: string): DiffLine[] | null {
  if (oldText == null || newText == null) return null

  const oldLines = splitLines(oldText)
  const newLines = splitLines(newText)

  if (oldLines.length * newLines.length > MAX_DIFF_CELLS) return null

  const dp = buildLcsTable(oldLines, newLines)
  const diff: DiffLine[] = []

  let i = oldLines.length
  let j = newLines.length

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      diff.unshift({ type: 'same', text: oldLines[i - 1] })
      i--
      j--
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      diff.unshift({ type: 'add', text: newLines[j - 1] })
      j--
    } else if (i > 0 && (j === 0 || dp[i][j - 1] < dp[i - 1][j])) {
      diff.unshift({ type: 'remove', text: oldLines[i - 1] })
      i--
    }
  }

  return diff
}

function splitLines(text: string): string[] {
  // Preserve the fact that the original ended with a newline by not dropping
  // the final empty string after a trailing separator.
  return text.split(/\r?\n/)
}

function buildLcsTable(a: string[], b: string[]): number[][] {
  const m = a.length
  const n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1])
      }
    }
  }

  return dp
}
