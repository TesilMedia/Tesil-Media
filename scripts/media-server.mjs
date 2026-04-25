import { execFileSync, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  appendFileSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import NodeMediaServer from "node-media-server";

const APP_NAME = "live";
const RTMP_PORT = Number(process.env.RTMP_PORT ?? 1935);
const HTTP_PORT = Number(process.env.HLS_HTTP_PORT ?? 8000);
const NEXT_APP_URL = process.env.NEXT_APP_URL ?? "http://localhost:3000";
const STREAM_HOOK_SECRET = process.env.STREAM_HOOK_SECRET ?? "";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MEDIA_ROOT = path.join(REPO_ROOT, "media");
const HLS_ROOT = path.join(MEDIA_ROOT, APP_NAME);
const VOD_ROOT = path.join(MEDIA_ROOT, "vod");
const VIDEO_UPLOAD_DIR = path.join(REPO_ROOT, "public", "uploads", "videos");

/** Active `ffmpeg` subprocesses transcoding RTMP → HLS, keyed by stream slug. */
const transcoders = new Map();

/**
 * NMS fires `prePublish` and `postPublish` back-to-back in the same synchronous
 * call (see broadcast_server.postPublish). We record successful auths in
 * prePublish so that postPublish only spawns ffmpeg for authorized streams.
 */
const authorizedStreams = new Set();

/**
 * Tracks VOD HLS output state per active stream slug.
 * Consumed in `donePublish` to locate segments for remux.
 */
const vodState = new Map();

function ensureFfmpegOnPath() {
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
  } catch {
    throw new Error(
      "FFmpeg is required for OBS ingest. Install it and ensure `ffmpeg` is on PATH.",
    );
  }
}

/** node-media-server parses `streamName?key=…` into streamQuery (see rtmp.js onPublish). */
function keyFromStreamQuery(query) {
  if (!query || typeof query !== "object") return "";
  const k = query.key;
  if (Array.isArray(k)) return String(k[0] ?? "");
  return k != null ? String(k) : "";
}

/**
 * session.streamPath is `/app/name` (no query). Query params live on session.streamQuery.
 * If someone embedded `?key=` in the name segment only, we parse that too.
 */
function parseSlugFromPath(streamPath) {
  if (!streamPath || typeof streamPath !== "string") return null;
  const parts = streamPath.split("/").filter(Boolean);
  if (parts.length !== 2 || parts[0] !== APP_NAME) return null;
  const raw = parts[1];
  const qIndex = raw.indexOf("?");
  const slug = qIndex === -1 ? raw : raw.slice(0, qIndex);
  if (!/^[a-z0-9-]{1,80}$/i.test(slug)) return null;
  const keyFromPath =
    qIndex === -1
      ? ""
      : new URLSearchParams(raw.slice(qIndex + 1)).get("key") ?? "";
  return { slug, keyFromPath };
}

function publishAuthFromSession(session) {
  const parsed = parseSlugFromPath(session?.streamPath);
  const streamName = parsed?.slug ?? "";
  const key =
    keyFromStreamQuery(session?.streamQuery) || parsed?.keyFromPath || "";
  return { streamName, key };
}

/** Synchronous POST so the RTMP prePublish handler can reject before the publisher slot is taken (NMS emits sync). */
function postHookSync(payload) {
  const url = `${NEXT_APP_URL}/api/stream/hook`;
  const body = JSON.stringify(payload);
  try {
    execFileSync(
      "curl",
      [
        "-sS",
        "-f",
        "-X",
        "POST",
        url,
        "-H",
        "Content-Type: application/json",
        "-H",
        `x-stream-hook-secret: ${STREAM_HOOK_SECRET}`,
        "-d",
        body,
      ],
      { stdio: ["ignore", "pipe", "pipe"], maxBuffer: 1_000_000 },
    );
    return;
  } catch (e) {
    if (e.code !== "ENOENT" && e.errno !== "ENOENT") throw e;
  }

  const inline = `
    const body = ${JSON.stringify(body)};
    const r = await fetch(${JSON.stringify(url)}, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-stream-hook-secret": ${JSON.stringify(STREAM_HOOK_SECRET)},
      },
      body,
    });
    if (!r.ok) {
      console.error(await r.text());
      process.exit(1);
    }
  `;
  execFileSync(
    process.execPath,
    ["--input-type=module", "-e", inline],
    { stdio: ["ignore", "pipe", "inherit"], maxBuffer: 1_000_000 },
  );
}

async function postHookPayloadAsync(payload) {
  const response = await fetch(`${NEXT_APP_URL}/api/stream/hook`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-stream-hook-secret": STREAM_HOOK_SECRET,
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(`Hook rejected with HTTP ${response.status}`);
  }
}

/**
 * NMS v4 dropped the FFmpeg/HLS transcoder that shipped with v2/v3, so we spawn
 * `ffmpeg` ourselves and point it at our own RTMP server as a subscriber. The
 * resulting HLS lands under `media/live/<slug>/` which NMS serves via its
 * `static` route on port 8000 (same origin the Next `/hls/*` rewrite targets).
 */
function startHlsTranscoder(slug) {
  stopHlsTranscoder(slug);

  const hlsDir = path.join(HLS_ROOT, slug);
  mkdirSync(hlsDir, { recursive: true });

  const rtmpSubscribeUrl = `rtmp://127.0.0.1:${RTMP_PORT}/${APP_NAME}/${slug}`;
  const manifestPath = path.join(hlsDir, "index.m3u8");
  const segmentPath = path.join(hlsDir, "seg_%05d.ts");

  const args = [
    "-hide_banner",
    "-loglevel", "warning",
    "-fflags", "nobuffer+genpts",
    "-probesize", "32",
    "-analyzeduration", "0",
    "-rw_timeout", "15000000",
    "-i", rtmpSubscribeUrl,
    "-c:v", "copy",
    "-c:a", "aac",
    "-ar", "44100",
    "-b:a", "128k",
    "-f", "hls",
    // Shorter segments + a tight first segment cut latency down at the cost of
    // more playlist/segment HTTP traffic. Viewers stay closer to OBS; typical
    // glass-to-glass with plain HLS is still several seconds behind WebRTC.
    "-hls_time", "2",
    // Emit the first segment quickly (may still wait for a keyframe from OBS).
    "-hls_init_time", "1",
    "-hls_list_size", "8",
    // `program_date_time` emits EXT-X-PROGRAM-DATE-TIME on every segment so players
    // can show a real wall-clock timestamp aligned with OBS instead of relative
    // seconds into the live window (which drifts per-browser and per-reload).
    "-hls_flags", "delete_segments+append_list+independent_segments+omit_endlist+program_date_time",
    "-hls_segment_filename", segmentPath,
    "-y",
    manifestPath,
  ];

  const child = spawn("ffmpeg", args, {
    stdio: ["ignore", "inherit", "inherit"],
    windowsHide: true,
  });

  transcoders.set(slug, child);
  console.log(`[ffmpeg] started HLS transcoder for ${slug} (pid=${child.pid})`);

  child.on("exit", (code, signal) => {
    if (transcoders.get(slug) === child) transcoders.delete(slug);
    console.log(
      `[ffmpeg] exited for ${slug} (code=${code ?? "null"} signal=${signal ?? "null"})`,
    );
  });

  child.on("error", (err) => {
    console.error(`[ffmpeg] failed to spawn for ${slug}:`, err);
    if (transcoders.get(slug) === child) transcoders.delete(slug);
  });
}

function stopHlsTranscoder(slug) {
  const child = transcoders.get(slug);
  if (!child) return;
  transcoders.delete(slug);
  try {
    child.kill("SIGINT");
  } catch {
    /* noop */
  }
  // SIGINT lets ffmpeg flush a final segment and write the end tag; fall back after 3s.
  setTimeout(() => {
    if (!child.killed) {
      try {
        child.kill("SIGKILL");
      } catch {
        /* noop */
      }
    }
  }, 3000).unref();
}

function cleanupHlsDir(slug) {
  const hlsDir = path.join(HLS_ROOT, slug);
  try {
    rmSync(hlsDir, { recursive: true, force: true });
  } catch (err) {
    console.warn(`[nms] failed to clean HLS dir for ${slug}:`, err);
  }
}

async function main() {
  ensureFfmpegOnPath();
  if (!STREAM_HOOK_SECRET) {
    throw new Error("STREAM_HOOK_SECRET is required for media server hooks.");
  }

  mkdirSync(HLS_ROOT, { recursive: true });
  mkdirSync(VOD_ROOT, { recursive: true });
  mkdirSync(VIDEO_UPLOAD_DIR, { recursive: true });

  const nms = new NodeMediaServer({
    rtmp: {
      port: RTMP_PORT,
      chunk_size: 60000,
      gop_cache: false,
      ping: 30,
      ping_timeout: 60,
    },
    http: {
      port: HTTP_PORT,
    },
    // NMS v4 serves arbitrary static files here — we point `/live` at the HLS
    // directory so `http://<host>:8000/live/<slug>/index.m3u8` resolves directly.
    static: {
      router: "/",
      root: MEDIA_ROOT,
    },
  });

  nms.on("prePublish", (session) => {
    const { streamName, key } = publishAuthFromSession(session);
    if (!streamName || !key) {
      console.error(
        "[nms] prePublish: missing slug or key path=%s query=%j",
        session?.streamPath,
        session?.streamQuery,
      );
      session.close();
      return;
    }

    try {
      postHookSync({ event: "prePublish", streamName, key });
      authorizedStreams.add(streamName);
    } catch (err) {
      console.error("[nms] prePublish hook failed:", err);
      authorizedStreams.delete(streamName);
      session.close();
    }
  });

  nms.on("postPublish", (session) => {
    const { streamName } = publishAuthFromSession(session);
    if (!streamName || !authorizedStreams.has(streamName)) return;
    // The publisher's RTMP socket is already attached by the time this event
    // fires, so our ffmpeg subscriber can connect immediately and the first
    // HLS segment is typically written within ~hls_time seconds.
    startHlsTranscoder(streamName);
  });

  nms.on("donePublish", (session) => {
    const { streamName, key } = publishAuthFromSession(session);
    if (!streamName) return;
    authorizedStreams.delete(streamName);
    stopHlsTranscoder(streamName);
    cleanupHlsDir(streamName);
    // Always notify the app the stream ended — STREAM_HOOK_SECRET already
    // authenticates this call, so the key is only sent as a best-effort hint
    // (it may be empty if the media server was restarted mid-stream).
    void postHookPayloadAsync({
      event: "donePublish",
      streamName,
      key,
    }).catch((err) => {
      console.error("[nms] donePublish hook failed:", err);
    });
  });

  const shutdown = () => {
    console.log("[nms] shutting down, stopping transcoders");
    for (const slug of [...transcoders.keys()]) stopHlsTranscoder(slug);
    process.exit(0);
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);

  nms.run();
  console.log(`[nms] RTMP listening on rtmp://localhost:${RTMP_PORT}/${APP_NAME}`);
  console.log(
    `[nms] HLS output served at http://localhost:${HTTP_PORT}/${APP_NAME}/<slug>/index.m3u8`,
  );
}

main().catch((err) => {
  console.error("[nms] failed to start:", err);
  process.exit(1);
});
