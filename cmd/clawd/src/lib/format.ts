/**
 * CLI output formatting utilities for clawd.
 */

/**
 * Render an ASCII table from headers and rows.
 */
export function table(headers: string[], rows: string[][]): string {
  if (rows.length === 0) {
    return headers.join("  ");
  }

  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => (r[i] || "").length)),
  );

  const hr = widths.map((w) => "-".repeat(w + 2)).join("+");
  const formatRow = (row: string[]) =>
    row.map((cell, i) => ` ${(cell || "").padEnd(widths[i])} `).join("|");

  return [formatRow(headers), hr, ...rows.map(formatRow)].join("\n");
}

/**
 * Format a uclaw amount as human-readable CLAW.
 */
export function formatClaw(uclaw: string): string {
  const n = BigInt(uclaw || "0");
  const whole = n / 1_000_000n;
  const frac = n % 1_000_000n;
  if (frac === 0n) return `${whole} CLAW`;
  return `${whole}.${frac.toString().padStart(6, "0").replace(/0+$/, "")} CLAW`;
}

/**
 * Shorten a bech32 address for display.
 */
export function shortAddr(addr: string): string {
  if (addr.length <= 15) return addr;
  return `${addr.slice(0, 10)}...${addr.slice(-5)}`;
}

/**
 * Format a unix timestamp (seconds or ms) to ISO string.
 */
export function formatTime(ts: number): string {
  if (ts === 0) return "-";
  // If less than 1e12 assume seconds, otherwise ms
  const ms = ts < 1e12 ? ts * 1000 : ts;
  return new Date(ms).toISOString();
}

/**
 * Truncate a string to maxLen, appending "..." if truncated.
 */
export function truncate(s: string, maxLen: number): string {
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen - 3) + "...";
}
