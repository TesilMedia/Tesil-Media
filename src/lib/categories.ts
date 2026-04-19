/**
 * Strict video / live-stream categories.
 *
 * Categories are a fixed, finite set so that they can be searched, linked,
 * and aggregated reliably. `Video.category` and `LiveStream.category` are
 * stored as the slug (e.g. "gaming", "film"), not the display label.
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

export const DEFAULT_VIDEO_CATEGORY: VideoCategory = "other";

type CategoryMeta = {
  label: string;
  description: string;
  /** Tailwind classes for a category pill. */
  badgeClass: string;
};

export const CATEGORY_META: Record<VideoCategory, CategoryMeta> = {
  gaming: {
    label: "Gaming",
    description: "Gameplay, speedruns, esports, and game dev.",
    badgeClass: "bg-violet-500/55 text-violet-100 border border-violet-400/60",
  },
  music: {
    label: "Music",
    description: "Performances, music videos, covers, and sets.",
    badgeClass: "bg-pink-500/55 text-pink-100 border border-pink-400/60",
  },
  tech: {
    label: "Tech",
    description: "Programming, hardware, reviews, and tutorials.",
    badgeClass: "bg-sky-500/55 text-sky-100 border border-sky-400/60",
  },
  film: {
    label: "Film & Animation",
    description: "Short films, animation, and cinematic work.",
    badgeClass: "bg-indigo-500/55 text-indigo-100 border border-indigo-400/60",
  },
  sports: {
    label: "Sports",
    description: "Live sports, highlights, and training.",
    badgeClass: "bg-orange-500/55 text-orange-100 border border-orange-400/60",
  },
  news: {
    label: "News & Politics",
    description: "News coverage, commentary, and politics.",
    badgeClass: "bg-red-500/55 text-red-100 border border-red-400/60",
  },
  education: {
    label: "Education",
    description: "Lectures, explainers, and how-to content.",
    badgeClass: "bg-emerald-500/55 text-emerald-100 border border-emerald-400/60",
  },
  comedy: {
    label: "Comedy",
    description: "Sketches, stand-up, and funny clips.",
    badgeClass: "bg-yellow-500/55 text-yellow-100 border border-yellow-400/60",
  },
  entertainment: {
    label: "Entertainment",
    description: "Variety, pop culture, and talk shows.",
    badgeClass: "bg-fuchsia-500/55 text-fuchsia-100 border border-fuchsia-400/60",
  },
  vlogs: {
    label: "Vlogs",
    description: "Personal vlogs, travel, and lifestyle.",
    badgeClass: "bg-rose-500/55 text-rose-100 border border-rose-400/60",
  },
  ambient: {
    label: "Ambient",
    description: "Nature, ASMR, lofi, and background loops.",
    badgeClass: "bg-teal-500/55 text-teal-100 border border-teal-400/60",
  },
  art: {
    label: "Art & Design",
    description: "Illustration, 3D, pixel art, and design.",
    badgeClass: "bg-lime-500/55 text-lime-100 border border-lime-400/60",
  },
  other: {
    label: "Other",
    description: "Doesn't fit anywhere else — yet.",
    badgeClass: "bg-zinc-500/55 text-zinc-100 border border-zinc-400/60",
  },
};

export function isVideoCategory(value: unknown): value is VideoCategory {
  return (
    typeof value === "string" &&
    (VIDEO_CATEGORIES as readonly string[]).includes(value)
  );
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
