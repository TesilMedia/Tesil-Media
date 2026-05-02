/**
 * Strict video / live-stream categories.
 *
 * Categories are a fixed, finite set so that they can be searched, linked,
 * and aggregated reliably. `Video.category` / `Video.category2` and
 * `LiveStream.category` / `LiveStream.category2` store slugs (e.g. "gaming",
 * "film"), not display labels. At most two distinct categories per row.
 *
 * This file is the single source of truth: anything that reads or writes
 * a category should go through the helpers here.
 */

export const VIDEO_CATEGORIES = [
  "gaming",
  "music",
  "tech",
  "film",
  "sports",
  "news",
  "education",
  "comedy",
  "entertainment",
  "vlogs",
  "ambient",
  "art",
  "other",
] as const;

export type VideoCategory = (typeof VIDEO_CATEGORIES)[number];

/** Maximum categories stored on a video or live stream. */
export const MAX_VIDEO_CATEGORIES = 2;

export const DEFAULT_VIDEO_CATEGORY: VideoCategory = "other";

type CategoryMeta = {
  label: string;
  description: string;
};

/**
 * Shared Tailwind classes for every category icon badge.
 *
 * Categories no longer carry their own hue — the badge tracks the active
 * theme (dark ink on the light stone surface, light ink on the dark slate
 * surface) so the sidebar, pickers, and headers all feel like a single
 * family rather than a rainbow.
 */
export const CATEGORY_BADGE_CLASS =
  "bg-surface-2 text-text border border-border";

export const CATEGORY_META: Record<VideoCategory, CategoryMeta> = {
  gaming: {
    label: "Gaming",
    description: "Gameplay, speedruns, esports, and game dev.",
  },
  music: {
    label: "Music",
    description: "Performances, music videos, covers, and sets.",
  },
  tech: {
    label: "Tech",
    description: "Programming, hardware, reviews, and tutorials.",
  },
  film: {
    label: "Film & Animation",
    description: "Short films, animation, and cinematic work.",
  },
  sports: {
    label: "Sports",
    description: "Live sports, highlights, and training.",
  },
  news: {
    label: "News & Politics",
    description: "News coverage, commentary, and politics.",
  },
  education: {
    label: "Education",
    description: "Lectures, explainers, and how-to content.",
  },
  comedy: {
    label: "Comedy",
    description: "Sketches, stand-up, and funny clips.",
  },
  entertainment: {
    label: "Entertainment",
    description: "Variety, pop culture, and talk shows.",
  },
  vlogs: {
    label: "Vlogs",
    description: "Personal vlogs, travel, and lifestyle.",
  },
  ambient: {
    label: "Ambient",
    description: "Nature, ASMR, lofi, and background loops.",
  },
  art: {
    label: "Art & Design",
    description: "Illustration, 3D, pixel art, and design.",
  },
  other: {
    label: "Other",
    description: "Doesn't fit anywhere else — yet.",
  },
};

export function isVideoCategory(value: unknown): value is VideoCategory {
  return (
    typeof value === "string" &&
    (VIDEO_CATEGORIES as readonly string[]).includes(value)
  );
}

/**
 * Reads up to two canonical slugs from DB columns (deduped, order preserved).
 */
export function categoriesFromDb(
  primary: string | null | undefined,
  secondary: string | null | undefined,
): VideoCategory[] {
  const a = normaliseCategory(primary);
  const b = normaliseCategory(secondary);
  const out: VideoCategory[] = [];
  if (a) out.push(a);
  if (b && b !== a) out.push(b);
  return out.slice(0, MAX_VIDEO_CATEGORIES);
}

/**
 * Accepts anything we might have written in the past (legacy free-text
 * categories like "Tech", "Ambient", "Games") and maps it onto a canonical
 * slug. Returns `null` if the input is empty; unknown values map to `other`.
 */
export function normaliseCategory(
  raw: string | null | undefined,
): VideoCategory | null {
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();

  if (isVideoCategory(lower)) return lower;

  // Alias table for legacy / human-friendly inputs.
  const alias: Record<string, VideoCategory> = {
    game: "gaming",
    games: "gaming",
    esports: "gaming",
    "game dev": "gaming",
    gamedev: "gaming",

    songs: "music",
    song: "music",
    performance: "music",
    concert: "music",

    technology: "tech",
    coding: "tech",
    programming: "tech",
    software: "tech",
    hardware: "tech",

    movies: "film",
    movie: "film",
    cinema: "film",
    animation: "film",
    anim: "film",
    "film & animation": "film",

    sport: "sports",
    fitness: "sports",

    politics: "news",
    "news & politics": "news",

    edu: "education",
    tutorial: "education",
    tutorials: "education",
    howto: "education",
    "how-to": "education",
    lecture: "education",
    lectures: "education",
    learning: "education",

    funny: "comedy",
    humor: "comedy",
    humour: "comedy",
    standup: "comedy",
    "stand-up": "comedy",

    variety: "entertainment",
    pop: "entertainment",
    talk: "entertainment",
    reality: "entertainment",

    vlog: "vlogs",
    travel: "vlogs",
    lifestyle: "vlogs",
    daily: "vlogs",

    nature: "ambient",
    asmr: "ambient",
    lofi: "ambient",
    "lo-fi": "ambient",
    relax: "ambient",
    relaxing: "ambient",
    background: "ambient",
    chill: "ambient",

    design: "art",
    illustration: "art",
    "pixel art": "art",
    drawing: "art",
    painting: "art",
    "3d": "art",
    "art & design": "art",
  };

  return alias[lower] ?? "other";
}

export function categoryLabel(value: string | null | undefined): string | null {
  const slug = normaliseCategory(value);
  if (!slug) return null;
  return CATEGORY_META[slug].label;
}

export function categoryHref(slug: VideoCategory): string {
  return `/category/${slug}`;
}
