import { execFileSync, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import http from "node:http";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const APP_NAME = "live";
const RTMP_PORT = Number(process.env.RTMP_PORT ?? 1935);
const HLS_HTTP_PORT = Number(process.env.HLS_HTTP_PORT ?? 8888);
const MEDIAMTX_HOOK_PORT = Number(process.env.MEDIAMTX_HOOK_PORT ?? 9100);
const NEXT_APP_URL = process.env.NEXT_APP_URL ?? "http://localhost:3000";
const STREAM_HOOK_SECRET = process.env.STREAM_HOOK_SECRET ?? "";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MEDIA_ROOT = path.join(REPO_ROOT, "media");
const VOD_ROOT = path.join(MEDIA_ROOT, "vod");
const VIDEO_UPLOAD_DIR = path.join(REPO_ROOT, "public", "uploads", "videos");
const MEDIAMTX_CONFIG = path.join(REPO_ROOT, "mediamtx.yml");
const MEDIAMTX_BIN_DIR = path.join(REPO_ROOT, "bin", "mediamtx");

/** Active ffmpeg VOD-subscriber processes keyed by stream slug. */
const transcoders = new Map();

/** Per-slug VOD output state captured at publish-start. */
const vodState = new Map();

function ensureFfmpegOnPath() {
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
  } catch {
    throw new Error(
      "FFmpeg is required for VOD recording. Install it and ensure `ffmpeg` is on PATH.",
    );
  }
}

function findMediaMtxBinary() {
  const exeName = process.platform === "win32" ? "mediamtx.exe" : "mediamtx";
  // Prefer a repo-local install so dev environments are self-contained.
  const local = path.join(MEDIAMTX_BIN_DIR, exeName);
  if (existsSync(local)) return local;
  // Fall back to PATH for users who installed via brew/scoop/winget.
  try {
    execFileSync(exeName, ["--version"], { stdio: "ignore" });
    return exeName;
  } catch {
    return null;
  }
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
  return response.json();
}

function openPreStreamSetupPage(streamName) {
  const url = `${NEXT_APP_URL}/me/live?slug=${encodeURIComponent(streamName)}`;
  try {
    if (process.platform === "win32") {
      const child = spawn("cmd", ["/c", "start", "", url], {
        detached: true,
        stdio: "ignore",
        windowsHide: true,
      });
      child.unref();
      return;
    }
    if (process.platform === "darwin") {
      const child = spawn("open", [url], {
        detached: true,
        stdio: "ignore",
        windowsHide: true,
      });
      child.unref();
      return;
    }
    const child = spawn("xdg-open", [url], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    child.unref();
  } catch (err) {
    console.warn("[media] unable to auto-open pre-stream setup page:", err);
  }
}

/**
 * Spawn an ffmpeg subscriber that pulls the live RTMP stream from MediaMTX
 * (loopback) and writes a VOD HLS ladder to disk. MediaMTX serves live
 * playback itself; this exists only so we can remux a recording when the
 * stream ends. Authentication is bypassed for `read` actions in mediamtx.yml,
 * so this connection does not need credentials.
 */
function startVodSubscriber(slug) {
  stopVodSubscriber(slug);

  const vodId = randomBytes(12).toString("hex");
  const vodHlsDir = path.join(VOD_ROOT, slug);
  mkdirSync(vodHlsDir, { recursive: true });
  vodState.set(slug, { vodId, vodHlsDir });

  const rtmpSubscribeUrl = `rtmp://127.0.0.1:${RTMP_PORT}/${APP_NAME}/${slug}`;
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
    "-hls_time", "4",
    "-hls_list_size", "0",
    "-hls_flags", "independent_segments+program_date_time",
    "-hls_segment_filename", path.join(vodHlsDir, "seg_%05d.ts"),
    "-y",
    path.join(vodHlsDir, "index.m3u8"),
  ];

  const child = spawn("ffmpeg", args, {
    stdio: ["ignore", "inherit", "inherit"],
    windowsHide: true,
  });
  transcoders.set(slug, child);
  console.log(`[ffmpeg] VOD subscriber started for ${slug} (pid=${child.pid})`);

  child.on("exit", (code, signal) => {
    if (transcoders.get(slug) === child) transcoders.delete(slug);
    console.log(
      `[ffmpeg] VOD subscriber exited for ${slug} (code=${code ?? "null"} signal=${signal ?? "null"})`,
    );
  });
  child.on("error", (err) => {
    console.error(`[ffmpeg] VOD subscriber failed to spawn for ${slug}:`, err);
    if (transcoders.get(slug) === child) transcoders.delete(slug);
  });
}

function stopVodSubscriber(slug) {
  const child = transcoders.get(slug);
  if (!child) return;
  transcoders.delete(slug);
  try {
    child.kill("SIGINT");
  } catch {
    /* noop */
  }
  // SIGINT lets ffmpeg flush a final segment + write EXT-X-ENDLIST; fall back after 3s.
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

function waitForExit(child, timeoutMs) {
  return new Promise((resolve) => {
    if (child.exitCode !== null || child.killed) {
      resolve();
      return;
    }
    const timer = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {
        /* noop */
      }
      resolve();
    }, timeoutMs);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

function ensureEndlist(manifestPath) {
  try {
    const content = readFileSync(manifestPath, "utf8");
    if (!content.includes("#EXT-X-ENDLIST")) {
      appendFileSync(manifestPath, "\n#EXT-X-ENDLIST\n", "utf8");
    }
  } catch (err) {
    console.warn("[remux] could not check/append EXT-X-ENDLIST:", err);
  }
}

function parseHlsSegments(manifestPath, segDir) {
  try {
    const content = readFileSync(manifestPath, "utf8");
    const segments = [];
    let nextProgramDateTime = null;
    for (const line of content.split("\n").map((l) => l.trim())) {
      if (!line) continue;
      if (line.startsWith("#EXT-X-PROGRAM-DATE-TIME:")) {
        const raw = line.slice("#EXT-X-PROGRAM-DATE-TIME:".length);
        const parsed = new Date(raw);
        nextProgramDateTime = Number.isNaN(parsed.getTime()) ? null : parsed;
        continue;
      }
      if (line.startsWith("#")) continue;
      segments.push({
        path: path.isAbsolute(line) ? line : path.join(segDir, line),
        programDateTime: nextProgramDateTime,
      });
      nextProgramDateTime = null;
    }
    return segments;
  } catch {
    return [];
  }
}

function segmentsFromPublicStart(segments, startedAt) {
  if (!startedAt) return segments.map((s) => s.path);
  const publicStart = new Date(startedAt);
  if (Number.isNaN(publicStart.getTime())) return segments.map((s) => s.path);
  return segments
    .filter(
      (segment) =>
        !segment.programDateTime ||
        segment.programDateTime.getTime() >= publicStart.getTime(),
    )
    .map((segment) => segment.path);
}

function remuxVodToMp4(segments, outputPath) {
  const listPath = `${outputPath}.concat.txt`;
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
        outputPath,
      ],
      { stdio: ["ignore", "inherit", "inherit"], windowsHide: true },
    );
    child.on("exit", (code) => {
      try { rmSync(listPath, { force: true }); } catch { /* noop */ }
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg concat exited with code ${code}`));
    });
    child.on("error", (err) => {
      try { rmSync(listPath, { force: true }); } catch { /* noop */ }
      reject(err);
    });
  });
}

function parseSlugFromMtxPath(mtxPath) {
  if (typeof mtxPath !== "string") return null;
  const match = mtxPath.match(/^live\/([a-z0-9-]{1,80})$/i);
  return match ? match[1] : null;
}

function keyFromQueryString(query) {
  if (!query) return "";
  try {
    const sp = new URLSearchParams(query);
    return sp.get("key") ?? sp.get("pass") ?? sp.get("password") ?? "";
  } catch {
    return "";
  }
}

async function handleHookEvent(payload) {
  const slug = parseSlugFromMtxPath(payload?.path);
  if (!slug) {
    console.error("[hook] could not parse slug from MTX_PATH:", payload?.path);
    return;
  }

  if (payload.event === "ready") {
    const key = keyFromQueryString(payload.query);
    if (!key) {
      // /api/stream/auth has already validated the publish at this point,
      // so a missing key here would only happen if MediaMTX's auth was
      // misconfigured. Bail loudly rather than silently accept.
      console.error(`[hook] ${slug} ready event has no key in query — auth misconfigured`);
      return;
    }
    try {
      await postHookPayloadAsync({ event: "prePublish", streamName: slug, key });
    } catch (err) {
      console.error(`[hook] prePublish forward failed for ${slug}:`, err);
      return;
    }
    startVodSubscriber(slug);
    openPreStreamSetupPage(slug);
    return;
  }

  if (payload.event === "notReady") {
    const vod = vodState.get(slug);
    vodState.delete(slug);
    const child = transcoders.get(slug);
    stopVodSubscriber(slug);

    void postHookPayloadAsync({ event: "donePublish", streamName: slug }).catch(
      (err) => console.error(`[hook] donePublish forward failed for ${slug}:`, err),
    );

    if (!vod) return;

    void (async () => {
      if (child) await waitForExit(child, 5000);
      const manifestPath = path.join(vod.vodHlsDir, "index.m3u8");
      ensureEndlist(manifestPath);
      let streamState = null;
      try {
        streamState = await postHookPayloadAsync({
          event: "streamState",
          streamName: slug,
        });
      } catch (err) {
        console.error("[remux] failed to load stream state:", err);
      }
      const segments = segmentsFromPublicStart(
        parseHlsSegments(manifestPath, vod.vodHlsDir),
        streamState?.startedAt ?? null,
      );
      if (segments.length === 0) {
        console.warn(`[remux] no segments for ${slug} — skipping VOD`);
        rmSync(vod.vodHlsDir, { recursive: true, force: true });
        return;
      }
      const mp4Path = path.join(VIDEO_UPLOAD_DIR, `${vod.vodId}.mp4`);
      try {
        await remuxVodToMp4(segments, mp4Path);
        await postHookPayloadAsync({
          event: "vodReady",
          streamName: slug,
          vodId: vod.vodId,
        });
        console.log(`[remux] VOD ready for ${slug}: ${mp4Path}`);
      } catch (err) {
        console.error(`[remux] failed for ${slug}:`, err);
      } finally {
        rmSync(vod.vodHlsDir, { recursive: true, force: true });
      }
    })();
    return;
  }
}

function startHookServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      if (req.method !== "POST" || req.url !== "/hook") {
        res.writeHead(404).end();
        return;
      }
      let body = "";
      try {
        for await (const chunk of req) body += chunk;
      } catch {
        res.writeHead(400).end();
        return;
      }
      let payload;
      try {
        payload = JSON.parse(body);
      } catch {
        res.writeHead(400).end();
        return;
      }
      // Ack first so MediaMTX's runOn* hook returns promptly; then process.
      res.writeHead(200, { "Content-Type": "application/json" }).end('{"ok":true}');
      void handleHookEvent(payload);
    });
    server.once("error", reject);
    server.listen(MEDIAMTX_HOOK_PORT, "127.0.0.1", () => resolve(server));
  });
}

async function main() {
  ensureFfmpegOnPath();
  if (!STREAM_HOOK_SECRET) {
    throw new Error("STREAM_HOOK_SECRET is required for media server hooks.");
  }

  const mtxBin = findMediaMtxBinary();
  if (!mtxBin) {
    console.error([
      "MediaMTX binary not found.",
      "Install it via one of:",
      "  - npm run setup:mediamtx     (auto-downloads into ./bin/mediamtx/)",
      "  - manual:                    https://github.com/bluenviron/mediamtx/releases",
      "                               place `mediamtx` (or `mediamtx.exe`) on PATH.",
    ].join("\n"));
    process.exit(1);
  }

  mkdirSync(VOD_ROOT, { recursive: true });
  mkdirSync(VIDEO_UPLOAD_DIR, { recursive: true });

  await startHookServer();
  console.log(`[media] hook server listening on http://127.0.0.1:${MEDIAMTX_HOOK_PORT}/hook`);

  const mtx = spawn(mtxBin, [MEDIAMTX_CONFIG], {
    cwd: REPO_ROOT,
    stdio: ["ignore", "inherit", "inherit"],
    env: {
      ...process.env,
      MEDIAMTX_HOOK_PORT: String(MEDIAMTX_HOOK_PORT),
    },
    windowsHide: true,
  });

  mtx.on("error", (err) => {
    console.error("[mediamtx] failed to spawn:", err);
    process.exit(1);
  });
  mtx.on("exit", (code, signal) => {
    console.error(
      `[mediamtx] exited (code=${code ?? "null"} signal=${signal ?? "null"})`,
    );
    process.exit(code ?? 1);
  });

  console.log(`[mediamtx] RTMP listening on rtmp://localhost:${RTMP_PORT}/${APP_NAME}`);
  console.log(
    `[mediamtx] LL-HLS listening on http://localhost:${HLS_HTTP_PORT}/${APP_NAME}/<slug>/index.m3u8`,
  );

  const shutdown = () => {
    console.log("[media] shutting down");
    for (const slug of [...transcoders.keys()]) stopVodSubscriber(slug);
    try {
      mtx.kill("SIGINT");
    } catch {
      /* noop */
    }
    setTimeout(() => process.exit(0), 1500).unref();
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("[media] failed to start:", err);
  process.exit(1);
});
