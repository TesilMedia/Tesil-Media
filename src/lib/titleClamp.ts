/**
 * Tailwind class fragment for title overflow:
 * - Titles with whitespace: up to two lines, then ellipsis (`break-words` for long tokens).
 * - Single long token (no whitespace): one line with ellipsis. Uses `block max-w-full`
 *   so `<a>` titles respect width (inline anchors ignore `truncate` / `w-full`).
 */
export function titleOverflowClampClass(title: string): string {
  return /\s/.test(title)
    ? "min-w-0 line-clamp-2 break-words"
    : "block min-w-0 max-w-full truncate";
}
