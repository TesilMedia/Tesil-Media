import { spawn } from "node:child_process";
import { createReadStream, readFileSync, statSync, mkdirSync, writeFileSync } from "node:fs";
import { join, isAbsolute } from "node:path";

import { notFound } from "next/navigation";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VOD_ROOT = join(process.cwd(), "media", "vod");
// Persisted per-slug cache so Range requests from seeking can reuse the file.
const BEGINNING_CACHE = join(process.cwd(), "media", "beginning-cache");
try { mkdirSync(BEGINNING_CACHE, { recursive: true }); } catch { /* noop */ }

// Track which `slug:t` sessions have already triggered a remux. The page
// embeds `?t=Date.now()` in the src URL, giving each page load a unique key.
// The first request for a new `t` (even if it's Chrome's initial Range probe)
// remuxes; subsequent Range requests within the same load reuse the cached file.
const remuxedSessions = new Map<string, number>(); // `slug:t` → remux timestamp

function pruneOldSessions() {
  const cutoff = Date.now() - 30 * 60 * 1000;
  for (const [key, ts] of remuxedSessions) {
    if (ts < cutoff) remuxedSessions.delete(key);
  }
}

// Deduplicates concurrent remux calls for the same slug. Firefox (and
// sometimes Chrome) fires multiple parallel requests on video load (initial GET
// + Range probe). Without this, both see alreadyRemuxed=false, both spawn
// ffmpeg, and both write to the same output file simultaneously — corrupting it.
const activeRemux = new Map<string, Promise<void>>();

function remuxOnce(slug: string, segments: string[], mp4Path: string, listPath: string): Promise<void> {
  const running = activeRemux.get(slug);
  if (running) return running;
  const p = remux(segments, mp4Path, listPath).finally(() => activeRemux.delete(slug));
  activeRemux.set(slug, p);
  return p;
}

function parseSegments(slug: string): string[] {
  const segDir = join(VOD_ROOT, slug);
  const manifestPath = join(segDir, "index.m3u8");
  try {
    const content = readFileSync(manifestPath, "utf8");
    return content
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith("#"))
      .map((seg) => (isAbsolute(seg) ? seg : join(segDir, seg)));
  } catch {
    return [];
  }
}

function remux(segments: string[], mp4Path: string, listPath: string): Promise<void> {
  const listContent = segments
    .map((s) => `file '${s.replace(/\\/g, "/").replace(/'/g, "'\\''")}'`)
    .join("\n");
  writeFileSync(listPath, listContent, "utf8");

  return new Promise((resolve, reject) => {
    const child = spawn(
      "ffmpeg",
      [
        "-hide_banner",
        "-loglevel", "warning",
        "-f", "concat",
        "-safe", "0",
        "-i", listPath,
        "-c", "copy",
        "-movflags", "+faststart",
        "-y",
        mp4Path,
      ],
      { stdio: ["ignore", "inherit", "inherit"], windowsHide: true },
    );
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with code ${code}`));
    });
    child.on("error", reject);
  });
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  const channel = await prisma.channel.findUnique({
    where: { slug },
    include: { stream: true },
  });
  if (!channel?.stream?.isLive) return notFound();

  const mp4Path = join(BEGINNING_CACHE, `${slug}.mp4`);
  const rangeHeader = req.headers.get("range");

  // Use the `t` param as a session key. The page sets `?t=Date.now()` on each
  // load, so each page refresh gets a unique key. The first request for a new
  // key (including Chrome's initial `Range: bytes=0-` probe) triggers a remux;
  // subsequent Range requests within the same page load reuse the cached file.
  const tParam = new URL(req.url).searchParams.get("t") ?? "";
  const sessionKey = `${slug}:${tParam}`;
  const alreadyRemuxed = tParam !== "" && remuxedSessions.has(sessionKey);

  if (!alreadyRemuxed) {
    pruneOldSessions();
    const segments = parseSegments(slug);
    if (segments.length === 0) {
      return NextResponse.json({ error: "No segments available yet." }, { status: 503 });
    }

    const listPath = join(BEGINNING_CACHE, `${slug}.txt`);
    try {
      await remuxOnce(slug, segments, mp4Path, listPath);
      remuxedSessions.set(sessionKey, Date.now());
    } catch (err) {
      console.error("[beginning] remux failed:", err);
      return NextResponse.json({ error: "Failed to generate video." }, { status: 500 });
    }
  }

  let size: number;
  try {
    size = statSync(mp4Path).size;
  } catch {
    return NextResponse.json({ error: "Video not yet generated." }, { status: 503 });
  }

  // Range request — Chrome sends these when seeking.
  if (rangeHeader?.startsWith("bytes=")) {
    const [, rangeSpec] = rangeHeader.split("=");
    const [startStr, endStr] = rangeSpec.split("-");
    const start = parseInt(startStr, 10) || 0;
    const end = endStr ? Math.min(parseInt(endStr, 10), size - 1) : size - 1;

    if (start >= size) {
      return new Response(null, {
        status: 416,
        headers: { "Content-Range": `bytes */${size}` },
      });
    }

    const chunkSize = end - start + 1;
    const fileStream = createReadStream(mp4Path, { start, end });
    const body = new ReadableStream({
      start(controller) {
        fileStream.on("data", (chunk) => controller.enqueue(chunk));
        fileStream.on("end", () => controller.close());
        fileStream.on("error", (err) => controller.error(err));
      },
      cancel() { fileStream.destroy(); },
    });

    return new Response(body, {
      status: 206,
      headers: {
        "Content-Type": "video/mp4",
        "Content-Range": `bytes ${start}-${end}/${size}`,
        "Content-Length": String(chunkSize),
        "Accept-Ranges": "bytes",
        "Cache-Control": "no-store",
      },
    });
  }

  // Full file — includes Content-Length and Accept-Ranges so Chrome knows it
  // can make range requests for seeking.
  const fileStream = createReadStream(mp4Path);
  const body = new ReadableStream({
    start(controller) {
      fileStream.on("data", (chunk) => controller.enqueue(chunk));
      fileStream.on("end", () => controller.close());
      fileStream.on("error", (err) => controller.error(err));
    },
    cancel() { fileStream.destroy(); },
  });

  return new Response(body, {
    headers: {
      "Content-Type": "video/mp4",
      "Content-Length": String(size),
      "Accept-Ranges": "bytes",
      "Cache-Control": "no-store",
    },
  });
}
