/**
 * Content rating / maturity system.
 *
 * Ratings are stored as strings on Video/LiveStream to keep the SQLite schema
 * simple. Keep this file as the single source of truth for which ratings
 * exist, what they look like in the UI, and how user preferences for hidden
 * ratings are serialised.
 */

export const CONTENT_RATINGS = ["PG", "PG13", "R", "X"] as const;

export type ContentRating = (typeof CONTENT_RATINGS)[number];

/** Ratings that are hidden by default for every viewer. */
export const DEFAULT_HIDDEN_RATINGS: readonly ContentRating[] = ["X"];

export const DEFAULT_VIDEO_RATING: ContentRating = "PG";

type RatingMeta = {
  label: string;
  description: string;
  /** Tailwind classes for a rating pill. */
  badgeClass: string;
};

export const RATING_META: Record<ContentRating, RatingMeta> = {
  PG: {
    label: "PG",
    description: "General audiences. Safe for all ages.",
    badgeClass: "bg-emerald-500/55 text-emerald-100 border border-emerald-400/60",
  },
  PG13: {
    label: "PG-13",
    description: "Some material may be unsuitable for younger children.",
    badgeClass: "bg-sky-500/55 text-sky-100 border border-sky-400/60",
  },
  R: {
    label: "R",
    description: "Mature content. Strong language, violence, or adult themes.",
    badgeClass: "bg-amber-500/55 text-amber-100 border border-amber-400/60",
  },
  X: {
    label: "X",
    description: "Explicit / adult only. Hidden by default.",
    badgeClass: "bg-red-600/55 text-red-100 border border-red-400/65",
  },
};

export function isContentRating(value: unknown): value is ContentRating {
  return (
    typeof value === "string" &&
    (CONTENT_RATINGS as readonly string[]).includes(value)
  );
}

/**
 * Hidden ratings are stored as a simple comma-separated string on User:
 *   ""           -> nothing hidden (user has opted in to X)
 *   "X"          -> default, hide X
 *   "R,X"        -> hide R and X
 * Whitespace and unknown values are silently ignored.
 */
export function parseHiddenRatings(raw: string | null | undefined): ContentRating[] {
  if (!raw) return [];
  const parts = raw
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  const out: ContentRating[] = [];
  for (const p of parts) {
    // Accept "PG-13" as a synonym for "PG13" when reading back.
    const normalised = p === "PG-13" ? "PG13" : p;
    if (isContentRating(normalised) && !out.includes(normalised)) {
      out.push(normalised);
    }
  }
  return out;
}

export function serializeHiddenRatings(values: readonly ContentRating[]): string {
  const unique: ContentRating[] = [];
  for (const r of values) {
    if (isContentRating(r) && !unique.includes(r)) unique.push(r);
  }
  // Preserve canonical order so string comparisons are stable.
  unique.sort(
    (a, b) => CONTENT_RATINGS.indexOf(a) - CONTENT_RATINGS.indexOf(b),
  );
  return unique.join(",");
}
