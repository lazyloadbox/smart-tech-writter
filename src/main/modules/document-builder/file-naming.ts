/**
 * File-name helpers for the section-split export (design doc §3.4 — S1-2).
 *
 * `{NN}_{SafeTitle}.{ext}` where:
 *  - `NN` is zero-padded, width = `max(2, String(count).length)`;
 *  - `SafeTitle` has Windows-illegal characters replaced, whitespace collapsed,
 *    is truncated to 80 code points, and is prefixed with `_` when it collides
 *    with a Windows reserved device name.
 *
 * Chinese characters are preserved as-is.
 */

/** Windows-invalid characters plus control characters. */
const ILLEGAL_CHARACTERS = /[<>:"/\\|?*\u0000-\u001F]/g;
/** Windows reserved device names (case-insensitive). */
const RESERVED_NAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
/** Maximum length of the title part, in code points. */
export const MAX_SAFE_TITLE_LENGTH = 80;

/** Truncate a string to a number of Unicode code points (never splits a surrogate pair). */
function truncateCodePoints(value: string, max: number): string {
  const codePoints = Array.from(value);
  return codePoints.length <= max ? value : codePoints.slice(0, max).join('');
}

/** Remove trailing dots and spaces, which Windows silently strips from file names. */
function stripTrailingDotsAndSpaces(value: string): string {
  return value.replace(/[. ]+$/, '');
}

/**
 * Convert a section title into a safe file-name segment.
 *
 * 1. Replace Windows-illegal characters and control characters with `-`.
 * 2. Collapse whitespace, trim, and strip trailing dots/spaces.
 * 3. Truncate to 80 code points.
 * 4. Prefix reserved device names with `_`.
 * 5. Fall back to `Section` when nothing usable remains.
 */
export function toSafeFileName(title: string): string {
  let safe = (title ?? '')
    .replace(ILLEGAL_CHARACTERS, '-')
    .replace(/\s+/g, ' ')
    .trim();

  safe = stripTrailingDotsAndSpaces(safe);
  safe = stripTrailingDotsAndSpaces(truncateCodePoints(safe, MAX_SAFE_TITLE_LENGTH));

  if (!safe) return 'Section';
  if (RESERVED_NAME.test(safe)) return `_${safe}`;
  return safe;
}

/**
 * Leading section number and its separator: `1.`, `2)`, `3、`, `4: `, `5 - `.
 * A dash/colon only counts when it is followed by whitespace, so titles such as
 * `5 kHz PWM` or `2:1 multiplexer` keep their leading number instead of losing
 * real content.
 */
const LEADING_SECTION_NUMBER = /^\s*\d+(?:\.\d+)*\s*(?:[.)、]\s*|[:：\-–—]\s+)/;

/**
 * Drop a leading section number such as `1. ` from a title.
 *
 * Exported files already carry an aligned `NN_` prefix, so keeping the source
 * numbering as well produced names like `01_2. Product-Feature Overview`, where
 * the two numbers disagreed. The section title inside the file is untouched.
 * Returns the original title when nothing would be left after stripping.
 */
export function stripLeadingSectionNumber(title: string): string {
  const raw = (title ?? '').trim();
  if (!raw) return raw;
  const stripped = raw.replace(LEADING_SECTION_NUMBER, '').trim();
  return stripped || raw;
}

/**
 * Zero-padding width for section sequence numbers: `max(2, String(total).length)`.
 * 9 → 2, 10 → 2, 100 → 3.
 */
export function computeIndexWidth(total: number): number {
  return Math.max(2, String(Math.max(total, 0)).length);
}

/** Format a 1-based sequence number with zero padding (default width 2). */
export function formatIndex(index: number, width: number = 2): string {
  return String(Math.max(index, 0)).padStart(width, '0');
}

/**
 * File name **without extension** for one section: `{NN}_{SafeTitle}`.
 *
 * @param index 1-based position among **exported** sections.
 * @param total Number of exported sections (controls the zero-padding width).
 * @param title Raw section title (a leading number is dropped, unsafe
 *              characters are sanitized).
 */
export function buildSectionBaseName(index: number, total: number, title: string): string {
  const width = computeIndexWidth(total);
  const safeTitle = toSafeFileName(stripLeadingSectionNumber(title));
  return `${formatIndex(index, width)}_${safeTitle}`;
}

/**
 * Build the exported file name for one section: `{NN}_{SafeTitle}.{ext}`.
 *
 * @param index 1-based position among **exported** sections.
 * @param total Number of exported sections (controls the zero-padding width).
 * @param title Raw section title (a leading number is dropped, unsafe
 *              characters are sanitized).
 * @param ext   File extension without a dot (default `dita`).
 */
export function buildSectionFileName(
  index: number,
  total: number,
  title: string,
  ext: string = 'dita',
): string {
  return `${buildSectionBaseName(index, total, title)}.${ext}`;
}
