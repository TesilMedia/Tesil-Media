/**
 * One-shot, non-destructive migration that canonicalises existing Video and
 * LiveStream `category` values to the strict slugs defined in
 * `src/lib/categories.ts`.
 *
 * Run with:
 *   npx tsx prisma/migrate-categories.ts
 *
 * Safe to run multiple times. Rows whose category is already a valid slug
 * (or is empty) are left alone.
 */

import { PrismaClient } from "@prisma/client";

import {
  DEFAULT_VIDEO_CATEGORY,
  isVideoCategory,
  normaliseCategory,
} from "../src/lib/categories";

const prisma = new PrismaClient();

async function main() {
  let videosChanged = 0;
  let streamsChanged = 0;

  const videos = await prisma.video.findMany({
    select: { id: true, category: true },
  });
  for (const v of videos) {
    if (v.category && isVideoCategory(v.category)) continue;
    const next = normaliseCategory(v.category) ?? DEFAULT_VIDEO_CATEGORY;
    if (next === v.category) continue;
    await prisma.video.update({
      where: { id: v.id },
      data: { category: next },
    });
    videosChanged++;
    console.log(`video ${v.id}: ${JSON.stringify(v.category)} -> ${next}`);
  }

  const streams = await prisma.liveStream.findMany({
    select: { id: true, category: true },
  });
  for (const s of streams) {
    if (!s.category) continue;
    if (isVideoCategory(s.category)) continue;
    const next = normaliseCategory(s.category) ?? DEFAULT_VIDEO_CATEGORY;
    if (next === s.category) continue;
    await prisma.liveStream.update({
      where: { id: s.id },
      data: { category: next },
    });
    streamsChanged++;
    console.log(`stream ${s.id}: ${JSON.stringify(s.category)} -> ${next}`);
  }

  console.log(
    `Done. Updated ${videosChanged} video(s) and ${streamsChanged} stream(s).`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
