/** Standard iterative edit-distance, O(min(m,n)) memory. */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  const dp = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;

  for (let i = 1; i <= m; i++) {
    let prevDiag = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const temp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prevDiag : 1 + Math.min(prevDiag, dp[j], dp[j - 1]);
      prevDiag = temp;
    }
  }
  return dp[n];
}

/** Write mode's typo forgiveness (§3): one-character typos forgiven via
 * Levenshtein <= 1, but only on words longer than five characters — short
 * words are too easy to accidentally "forgive" into a different word. */
export function isCloseEnough(guess: string, target: string): boolean {
  const g = guess.trim().toLowerCase();
  const t = target.trim().toLowerCase();
  if (g === t) return true;
  if (t.length <= 5) return false;
  return levenshtein(g, t) <= 1;
}
