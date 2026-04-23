import { after, NextResponse } from "next/server";

import path from "node:path";

import { randomUUID } from "node:crypto";

import { Readable } from "node:stream";

import { pipeline } from "node:stream/promises";

import { createWriteStream } from "node:fs";

import { mkdir, stat, unlink } from "node:fs/promises";



import Busboy from "@fastify/busboy";



import { auth } from "@/lib/auth";

import { prisma } from "@/lib/prisma";

import { ensureChannelForUser } from "@/lib/slug";
import {
  buildInitialQualityLadder,
  encodeEachRemainingRung,
  expectedTranscodedRungCount,
  parseQualityVariantsJson,
  type VideoQualityRendition,
  unlinkRungFilesForVideoId,
} from "@/lib/videoQualities";

import {

  ContentRating,

  DEFAULT_VIDEO_RATING,

  isContentRating,

} from "@/lib/ratings";

import {

  VideoCategory,

  isVideoCategory,

} from "@/lib/categories";



// Use Node runtime (we touch the filesystem) and allow long request times for

// bigger uploads on local dev.

export const runtime = "nodejs";

export const dynamic = "force-dynamic";

export const maxDuration = 300;



const ALLOWED_VIDEO_EXTS = new Set([

  "mp4",

  "webm",

  "mkv",

  "mov",

  "m4v",

  "ogv",

  "ogg",

]);

const ALLOWED_IMAGE_EXTS = new Set(["jpg", "jpeg", "png", "webp", "gif"]);



const UPLOAD_ROOT = path.join(process.cwd(), "public", "uploads");

const VIDEO_DIR = path.join(UPLOAD_ROOT, "videos");

const THUMB_DIR = path.join(UPLOAD_ROOT, "thumbnails");



function extFromName(name: string): string {

  const idx = name.lastIndexOf(".");

  if (idx < 0) return "";

  return name.slice(idx + 1).toLowerCase();

}



type ParseOk = {

  ok: true;

  title: string;

  description: string | null;

  category: VideoCategory;

  rating: ContentRating;

  videoFileName: string;

  thumbFileName: string | null;

  durationSec: number | null;

};



type ParseErr = { ok: false; error: string };



/**

 * Undici/Web `request.formData()` often fails on large multipart bodies with

 * "Failed to parse body as FormData". Streaming via busboy avoids that.

 */

async function parseMultipartUpload(

  req: Request,

  videoId: string,

): Promise<ParseOk | ParseErr> {

  const ct = req.headers.get("content-type");

  if (!ct || !ct.toLowerCase().includes("multipart/form-data")) {

    return { ok: false, error: "Expected multipart/form-data." };

  }



  const body = req.body;

  if (!body) {

    return { ok: false, error: "Missing request body." };

  }



  await mkdir(VIDEO_DIR, { recursive: true });

  await mkdir(THUMB_DIR, { recursive: true });



  const headers: Record<string, string> = {};

  req.headers.forEach((value, key) => {

    headers[key.toLowerCase()] = value;

  });

  headers["content-type"] = ct;



  let title = "";

  let description: string | null = null;

  let category: string | null = null;

  let ratingField: string | null = null;

  let durationSecField: string | null = null;



  let videoFileName: string | null = null;

  let thumbFileName: string | null = null;

  const writes: Promise<void>[] = [];



  let gotVideo = false;

  let gotThumb = false;



  const bb = Busboy({

    headers: headers as { "content-type": string },

    defCharset: "utf8",

    limits: {

      fieldSize: 8 * 1024,

    },

  });



  bb.on("field", (name, val) => {

    const v = val.trim();

    if (name === "title") title = v;

    else if (name === "description") description = v.length ? v : null;

    else if (name === "category") category = v.length ? v.toLowerCase() : null;

    else if (name === "rating") ratingField = v.toUpperCase();

    else if (name === "durationSec") durationSecField = v.length ? v : null;

  });



  bb.on("file", (fieldname, fileStream, filename) => {

    const safeName =

      typeof filename === "string" && filename.length > 0 ? filename : "blob";



    if (fieldname === "video") {

      if (gotVideo) {

        fileStream.resume();

        return;

      }

      const ext = extFromName(safeName);

      if (!ALLOWED_VIDEO_EXTS.has(ext)) {

        fileStream.resume();

        return;

      }

      gotVideo = true;

      const name = `${videoId}.${ext}`;

      videoFileName = name;

      const dest = path.join(VIDEO_DIR, name);

      writes.push(

        pipeline(fileStream, createWriteStream(dest)).then(() => undefined),

      );

      return;

    }



    if (fieldname === "thumbnail") {

      if (gotThumb) {

        fileStream.resume();

        return;

      }

      const ext = extFromName(safeName);

      if (!ALLOWED_IMAGE_EXTS.has(ext)) {

        fileStream.resume();

        return;

      }

      gotThumb = true;

      const name = `${videoId}.${ext}`;

      thumbFileName = name;

      const dest = path.join(THUMB_DIR, name);

      writes.push(

        pipeline(fileStream, createWriteStream(dest)).then(() => undefined),

      );

      return;

    }



    fileStream.resume();

  });



  const nodeIn = Readable.fromWeb(

    body as import("node:stream/web").ReadableStream<Uint8Array>,

  );



  try {

    await new Promise<void>((resolve, reject) => {

      bb.once("finish", resolve);

      bb.once("error", reject);

      nodeIn.once("error", reject);

      nodeIn.pipe(bb);

    });

  } catch (err) {

    console.error("Multipart parse / stream failed:", err);

    const msg =

      err instanceof Error

        ? err.message

        : "Multipart upload failed; the connection may have been reset or timed out.";

    return { ok: false, error: msg };

  }



  try {

    await Promise.all(writes);

  } catch (err) {

    console.error("Saving upload files failed:", err);

    return { ok: false, error: "Failed to save uploaded file(s)." };

  }



  if (!title || title.length > 200) {

    return { ok: false, error: "Title is required (max 200 chars)." };

  }

  const ratingNormalised = ratingField === "PG-13" ? "PG13" : ratingField;

  if (!ratingNormalised || !isContentRating(ratingNormalised)) {

    return {

      ok: false,

      error: "Please choose a content rating (PG, PG-13, R, or X).",

    };

  }

  const rating: ContentRating = ratingNormalised ?? DEFAULT_VIDEO_RATING;

  if (!category || !isVideoCategory(category)) {

    return {

      ok: false,

      error: "Please choose a category from the list.",

    };

  }

  const categoryValidated: VideoCategory = category;

  if (!videoFileName) {

    return {

      ok: false,

      error:

        "A supported video file is required (mp4, webm, mkv, mov, m4v, ogv, ogg).",

    };

  }



  const videoDisk = path.join(VIDEO_DIR, videoFileName);

  try {

    const st = await stat(videoDisk);

    if (st.size === 0) {

      await unlink(videoDisk).catch(() => {});

      return { ok: false, error: "Video file was empty." };

    }

  } catch {

    return { ok: false, error: "Video file was not saved correctly." };

  }



  let thumbOut: string | null = thumbFileName;

  if (thumbFileName) {

    const thumbDisk = path.join(THUMB_DIR, thumbFileName);

    try {

      const st = await stat(thumbDisk);

      if (st.size === 0) {

        await unlink(thumbDisk).catch(() => {});

        thumbOut = null;

      }

    } catch {

      thumbOut = null;

    }

  }



  const MAX_DURATION_SEC = 48 * 3600;

  let durationSec: number | null = null;

  if (durationSecField) {

    const parsedDur = Number.parseInt(durationSecField, 10);

    if (

      Number.isFinite(parsedDur) &&

      parsedDur >= 1 &&

      parsedDur <= MAX_DURATION_SEC

    ) {

      durationSec = parsedDur;

    }

  }



  return {

    ok: true,

    title,

    description,

    category: categoryValidated,

    rating,

    videoFileName,

    thumbFileName: thumbOut,

    durationSec,

  };

}



export async function POST(req: Request) {

  const session = await auth();

  if (!session?.user?.id) {

    return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  }

  const userId = session.user.id;



  const videoId = randomUUID();

  const parsed = await parseMultipartUpload(req, videoId);

  if (!parsed.ok) {

    return NextResponse.json({ error: parsed.error }, { status: 400 });

  }



  const channel = await ensureChannelForUser(userId);
  if (!channel) {
    return NextResponse.json(
      { error: "Your session is no longer valid. Please sign in again." },
      { status: 401 },
    );
  }

  const publicVideoUrl = `/uploads/videos/${parsed.videoFileName}`;

  const publicThumbUrl = parsed.thumbFileName

    ? `/uploads/thumbnails/${parsed.thumbFileName}`

    : null;

  const inputAbs = path.join(VIDEO_DIR, parsed.videoFileName);

  let ladder: VideoQualityRendition[];

  let sourceHeight: number;

  try {
    const built = await buildInitialQualityLadder(inputAbs, publicVideoUrl);
    ladder = built.ladder;
    sourceHeight = built.sourceHeight;
  } catch (err) {
    console.error("Probe failed:", err);
    await unlink(inputAbs).catch(() => {});
    if (parsed.thumbFileName) {
      await unlink(path.join(THUMB_DIR, parsed.thumbFileName)).catch(() => {});
    }
    await unlinkRungFilesForVideoId(videoId, VIDEO_DIR);
    return NextResponse.json(
      {
        error:
          "Video processing failed. Install ffmpeg and ffprobe, and use a valid video file.",
      },
      { status: 500 },
    );
  }

  const extraRungs = expectedTranscodedRungCount(sourceHeight);

  const video = await prisma.video.create({
    data: {
      id: videoId,
      title: parsed.title.slice(0, 200),
      description: parsed.description?.slice(0, 5000),
      category: parsed.category,
      rating: parsed.rating,
      sourceUrl: publicVideoUrl,
      thumbnail: publicThumbUrl,
      channelId: channel.id,
      durationSec: parsed.durationSec,
      qualityVariantsJson: JSON.stringify(ladder),
      transcodePending: extraRungs > 0,
    },
  });

  if (extraRungs > 0) {
    after(async () => {
      try {
        await encodeEachRemainingRung(
          video.id,
          inputAbs,
          VIDEO_DIR,
          sourceHeight,
          async (rung) => {
            const row = await prisma.video.findUnique({
              where: { id: video.id },
              select: { qualityVariantsJson: true },
            });
            if (!row) return;
            const existing =
              parseQualityVariantsJson(row.qualityVariantsJson) ?? [];
            existing.push(rung);
            await prisma.video.update({
              where: { id: video.id },
              data: {
                qualityVariantsJson: JSON.stringify(existing),
              },
            });
          },
        );
      } catch (e) {
        console.error("Background transcode:", e);
      } finally {
        await prisma.video
          .update({
            where: { id: video.id },
            data: { transcodePending: false },
          })
          .catch(() => {});
      }
    });
  }

  return NextResponse.json({
    ok: true,
    id: video.id,
    transcodePending: extraRungs > 0,
  });

}


