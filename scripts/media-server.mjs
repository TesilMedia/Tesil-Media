import { execFileSync } from "node:child_process";
import process from "node:process";

import NodeMediaServer from "node-media-server";

const APP_NAME = "live";
const RTMP_PORT = Number(process.env.RTMP_PORT ?? 1935);
const HTTP_PORT = Number(process.env.HLS_HTTP_PORT ?? 8000);
const NEXT_APP_URL = process.env.NEXT_APP_URL ?? "http://localhost:3000";
const STREAM_HOOK_SECRET = process.env.STREAM_HOOK_SECRET ?? "";

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

async function main() {
  ensureFfmpegOnPath();
  if (!STREAM_HOOK_SECRET) {
    throw new Error("STREAM_HOOK_SECRET is required for media server hooks.");
  }

  const nms = new NodeMediaServer({
    logType: 2,
    rtmp: {
      port: RTMP_PORT,
      chunk_size: 60000,
      gop_cache: true,
      ping: 30,
      ping_timeout: 60,
    },
    http: {
      port: HTTP_PORT,
      mediaroot: "./media",
      allow_origin: "*",
    },
    trans: {
      ffmpeg: "ffmpeg",
      tasks: [
        {
          app: APP_NAME,
          hls: true,
          hlsFlags: "[hls_time=2:hls_list_size=6:hls_flags=delete_segments+append_list]",
          hlsKeep: false,
        },
      ],
    },
  });

  // Node Media Server v4: single argument `session` (BaseSession), not (id, path, args).
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
    } catch (err) {
      console.error("[nms] prePublish hook failed:", err);
      session.close();
    }
  });

  nms.on("donePublish", (session) => {
    const { streamName, key } = publishAuthFromSession(session);
    if (!streamName || !key) return;
    void postHookPayloadAsync({
      event: "donePublish",
      streamName,
      key,
    }).catch((err) => {
      console.error("[nms] donePublish hook failed:", err);
    });
  });

  nms.run();
  console.log(`[nms] RTMP listening on rtmp://localhost:${RTMP_PORT}/${APP_NAME}`);
  console.log(`[nms] HLS output served at http://localhost:${HTTP_PORT}/${APP_NAME}`);
}

main().catch((err) => {
  console.error("[nms] failed to start:", err);
  process.exit(1);
});
