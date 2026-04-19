import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding Tesil Media…");

  await prisma.liveStream.deleteMany();
  await prisma.video.deleteMany();
  await prisma.channel.deleteMany();
  await prisma.user.deleteMany();

  const demoPassword = await bcrypt.hash("password123", 10);

  const becknerd = await prisma.user.create({
    data: {
      email: "becknerd@tesil.media",
      name: "becknerd",
      hashedPassword: demoPassword,
    },
  });

  const beachVibes = await prisma.user.create({
    data: {
      email: "beach@tesil.media",
      name: "BeachVibes",
      hashedPassword: demoPassword,
    },
  });

  const pixelForge = await prisma.user.create({
    data: {
      email: "pixel@tesil.media",
      name: "PixelForge",
      hashedPassword: demoPassword,
    },
  });

  const tesilOfficial = await prisma.channel.create({
    data: {
      slug: "tesil",
      name: "Tesil Official",
      description:
        "Official Tesil Media channel — news, changelog streams, and demos of the Tesil Video Player.",
      avatarUrl:
        "https://api.dicebear.com/7.x/shapes/svg?seed=tesil&backgroundColor=8ab4f8",
      bannerUrl:
        "https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=1600&q=70",
      followers: 1284,
      ownerId: becknerd.id,
    },
  });

  const beachVibesChannel = await prisma.channel.create({
    data: {
      slug: "beachvibes",
      name: "BeachVibes",
      description: "Chill ambient beach footage, 24/7. Turn it on and relax.",
      avatarUrl:
        "https://api.dicebear.com/7.x/shapes/svg?seed=beach&backgroundColor=34d399",
      bannerUrl:
        "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1600&q=70",
      followers: 8421,
      ownerId: beachVibes.id,
    },
  });

  const pixelForgeChannel = await prisma.channel.create({
    data: {
      slug: "pixelforge",
      name: "PixelForge",
      description: "Indie game dev streams, pixel art, and retro tutorials.",
      avatarUrl:
        "https://api.dicebear.com/7.x/shapes/svg?seed=pixel&backgroundColor=f472b6",
      bannerUrl:
        "https://images.unsplash.com/photo-1542751371-adc38448a05e?w=1600&q=70",
      followers: 3210,
      ownerId: pixelForge.id,
    },
  });

  const sampleVideoUrl =
    "https://static.vecteezy.com/system/resources/previews/006/996/470/mp4/waves-on-the-beach-of-nai-harn-thailand-free-video.mp4";

  await prisma.video.createMany({
    data: [
      {
        channelId: tesilOfficial.id,
        title: "Tesil Video Player — Feature Tour",
        description:
          "A quick tour of the Tesil Video Player: frame-stepping, zoom, pan, scrub preview, and URL support for YouTube / Vimeo / Twitch.",
        sourceUrl: "https://www.youtube.com/watch?v=aqz-KE-bpKQ",
        thumbnail:
          "https://images.unsplash.com/photo-1536240478700-b869070f9279?w=800&q=70",
        durationSec: 634,
        views: 12_430,
        category: "tech",
        rating: "PG",
      },
      {
        channelId: tesilOfficial.id,
        title: "Building the Tesil Media streaming site (devlog #1)",
        description:
          "First devlog covering the architecture: Next.js App Router, Prisma + SQLite, and wrapping the Tesil Video Player as a reusable embed.",
        sourceUrl: sampleVideoUrl,
        thumbnail:
          "https://images.unsplash.com/photo-1498050108023-c5249f4df085?w=800&q=70",
        durationSec: 1820,
        views: 4_210,
        category: "tech",
        rating: "PG",
      },
      {
        channelId: beachVibesChannel.id,
        title: "Nai Harn beach — waves at golden hour",
        description: "4K ambient beach footage. No talking, just waves.",
        sourceUrl: sampleVideoUrl,
        thumbnail:
          "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800&q=70",
        durationSec: 3_600,
        views: 52_140,
        category: "ambient",
        rating: "PG",
      },
      {
        channelId: beachVibesChannel.id,
        title: "Rainy window ASMR — 1 hour",
        description: "Rain on glass. Perfect for study/sleep.",
        sourceUrl: sampleVideoUrl,
        thumbnail:
          "https://images.unsplash.com/photo-1501630834273-4b5604d2ee31?w=800&q=70",
        durationSec: 3_600,
        views: 18_903,
        category: "ambient",
        rating: "PG",
      },
      {
        channelId: pixelForgeChannel.id,
        title: "Pixel art tutorial — animated flame",
        description: "Step-by-step 32x32 pixel art tutorial in Aseprite.",
        sourceUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        thumbnail:
          "https://images.unsplash.com/photo-1511512578047-dfb367046420?w=800&q=70",
        durationSec: 912,
        views: 7_321,
        category: "gaming",
        rating: "PG13",
      },
      {
        channelId: pixelForgeChannel.id,
        title: "Making a tiny roguelike — part 1",
        description: "Starting a new 7-day roguelike in Godot 4.",
        sourceUrl: sampleVideoUrl,
        thumbnail:
          "https://images.unsplash.com/photo-1556438064-2d7646166914?w=800&q=70",
        durationSec: 2_340,
        views: 2_108,
        category: "gaming",
        rating: "PG13",
      },
      {
        channelId: pixelForgeChannel.id,
        title: "Boss fight dev-log — mature language warning",
        description:
          "Late-night debugging with strong language. Marked R so younger viewers can hide it in their profile.",
        sourceUrl: sampleVideoUrl,
        thumbnail:
          "https://images.unsplash.com/photo-1542751371-adc38448a05e?w=800&q=70",
        durationSec: 1_500,
        views: 612,
        category: "gaming",
        rating: "R",
      },
      {
        channelId: beachVibesChannel.id,
        title: "[Adults only demo] Sample X-rated entry",
        description:
          "Placeholder entry marked X so the content filter can be tested. Hidden by default for all viewers.",
        sourceUrl: sampleVideoUrl,
        thumbnail:
          "https://images.unsplash.com/photo-1501630834273-4b5604d2ee31?w=800&q=70",
        durationSec: 300,
        views: 42,
        category: "ambient",
        rating: "X",
      },
    ],
  });

  await prisma.liveStream.create({
    data: {
      channelId: beachVibesChannel.id,
      title: "LIVE — Phuket beach, 24/7 waves",
      category: "ambient",
      thumbnail:
        "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1200&q=70",
      streamUrl: sampleVideoUrl,
      isLive: true,
      viewers: 1_284,
      startedAt: new Date(Date.now() - 1000 * 60 * 60 * 5),
      rating: "PG",
    },
  });

  await prisma.liveStream.create({
    data: {
      channelId: pixelForgeChannel.id,
      title: "LIVE — building a boss fight in Godot 4",
      category: "gaming",
      thumbnail:
        "https://images.unsplash.com/photo-1556438064-2d7646166914?w=1200&q=70",
      streamUrl: "https://www.twitch.tv/pixelforge",
      isLive: true,
      viewers: 342,
      startedAt: new Date(Date.now() - 1000 * 60 * 42),
      rating: "PG13",
    },
  });

  await prisma.liveStream.create({
    data: {
      channelId: tesilOfficial.id,
      title: "Tesil — offline",
      category: "tech",
      streamUrl: sampleVideoUrl,
      isLive: false,
      viewers: 0,
      rating: "PG",
    },
  });

  console.log("Seed complete.");
  console.log("Demo login: becknerd@tesil.media / password123");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
