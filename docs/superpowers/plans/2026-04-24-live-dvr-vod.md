# Live DVR / VOD Recording Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** While a stream is live, record all HLS segments to a growing VOD playlist that viewers can seek into; when the stream ends, concat-remux the segments to a permanent MP4 and publish it as a Video record on the channel.

**Architecture:** A second ffmpeg HLS output (`hls_list_size 0`, all segments retained) runs alongside the existing live HLS during every stream. On `donePublish`, the media server waits for ffmpeg to exit, then async-remuxes the segments to a faststart MP4 and fires a new `vodReady` hook that creates the Video DB record. The live player gets a `disableSeek` param; a new `LivePlayerToggle` client component on the live page lets viewers switch between the true-live player and a DVR player that loads the growing VOD HLS with no snap-to-edge.

**Tech Stack:** Node.js ESM (media server), Next.js 15 App Router, Prisma + SQLite, hls.js 1.5.18, Vanilla JS player, Zod, TypeScript.

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `next.config.ts` | Modify | Add `/hls-vod/:path*` rewrite |
| `scripts/media-server.mjs` | Modify | VOD_ROOT, vodState map, dual ffmpeg output, remux pipeline, vodReady hook call |
| `src/app/api/stream/hook/route.ts` | Modify | Discriminated union schema, vodReady → Video.create |
| `public/video-player/player.js` | Modify | `disableSeek` hides seek bar; `dvrMode` skips snap-to-edge and hides goLive button |
| `src/components/VideoPlayer.tsx` | Modify | Add `disableSeek` and `dvrMode` props → iframe URL params |
| `src/components/LivePlayerToggle.tsx` | Create | Client Component with live/dvr mode toggle |
| `src/app/live/[slug]/page.tsx` | Modify | Swap inline `VideoPlayer` for `LivePlayerToggle` when RTMP stream |

No schema migrations — `Video` already has all needed fields.

---

## Task 1: Add `/hls-vod` rewrite to Next.js config

**Files:**
- Modify: `next.config.ts`

- [ ] **Step 1: Add the rewrite**

Open `next.config.ts`. The `rewrites()` array currently has one entry. Add a second:

```typescript
async rewrites() {
  return [
    {
      source: "/hls/:path*",
      destination: "http://localhost:8000/live/:path*",
    },
    {
      source: "/hls-vod/:path*",
      destination: "http://localhost:8000/vod/:path*",
    },
  ];
},
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add next.config.ts
git commit -m "feat: add /hls-vod rewrite for DVR HLS serving"
```

---

## Task 2: VOD constants, directory init, and NMS static root

**Files:**
- Modify: `scripts/media-server.mjs` (lines 1–17, 238–258)

The NMS `static` config currently serves only `media/live/` at `/live`. Changing `root` to `MEDIA_ROOT` and `router` to `/` makes port 8000 serve the whole `media/` tree, so `media/vod/{slug}/` is accessible at `http://localhost:8000/vod/{slug}/` without a second HTTP server.

- [ ] **Step 1: Add `randomBytes` and file-system imports**

The current imports are:
```javascript
import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
```

Replace with:
```javascript
import { execFileSync, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  appendFileSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
```

- [ ] **Step 2: Add `VOD_ROOT` and `VIDEO_UPLOAD_DIR` constants**

After line 17 (`const HLS_ROOT = path.join(MEDIA_ROOT, APP_NAME);`), add:

```javascript
const VOD_ROOT = path.join(MEDIA_ROOT, "vod");
const VIDEO_UPLOAD_DIR = path.join(REPO_ROOT, "public", "uploads", "videos");
```

- [ ] **Step 3: Add `vodState` map**

After the `authorizedStreams` declaration (around line 27), add:

```javascript
/**
 * Tracks VOD HLS output state per active stream slug.
 * Consumed in `donePublish` to locate segments for remux.
 */
const vodState = new Map();
```

- [ ] **Step 4: Broaden NMS static root**

In `main()`, find the `static:` block inside `new NodeMediaServer({...})`:

```javascript
static: {
  router: `/${APP_NAME}`,
  root: HLS_ROOT,
},
```

Replace with:

```javascript
static: {
  router: "/",
  root: MEDIA_ROOT,
},
```

- [ ] **Step 5: Ensure VOD and upload directories exist on startup**

In `main()`, after the existing `mkdirSync(HLS_ROOT, { recursive: true });` line, add:

```javascript
mkdirSync(VOD_ROOT, { recursive: true });
mkdirSync(VIDEO_UPLOAD_DIR, { recursive: true });
```

- [ ] **Step 6: Commit**

```bash
git add scripts/media-server.mjs
git commit -m "feat: add VOD_ROOT and broaden NMS static root to MEDIA_ROOT"
```

---

## Task 3: Dual ffmpeg output (live HLS + VOD HLS)

**Files:**
- Modify: `scripts/media-server.mjs` — `startHlsTranscoder` function

The `startHlsTranscoder` function currently builds a single-output ffmpeg args array. We extend it with a second HLS output that retains every segment (`hls_list_size 0`, no `delete_segments`) and stores state in `vodState` for later remux.

- [ ] **Step 1: Replace `startHlsTranscoder` with the dual-output version**

Find the entire `startHlsTranscoder(slug)` function (starts around line 143, ends around line 201) and replace it in full:

```javascript
function startHlsTranscoder(slug) {
  stopHlsTranscoder(slug);

  const hlsDir = path.join(HLS_ROOT, slug);
  mkdirSync(hlsDir, { recursive: true });

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
    // --- Output 1: Live HLS — sliding 8-segment window, low-latency ---
    "-c:v", "copy",
    "-c:a", "aac",
    "-ar", "44100",
    "-b:a", "128k",
    "-f", "hls",
    "-hls_time", "2",
    "-hls_init_time", "1",
    "-hls_list_size", "8",
    "-hls_flags", "delete_segments+append_list+independent_segments+omit_endlist+program_date_time",
    "-hls_segment_filename", path.join(hlsDir, "seg_%05d.ts"),
    "-y",
    path.join(hlsDir, "index.m3u8"),
    // --- Output 2: VOD HLS — all segments retained, 4-second cuts ---
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
```

- [ ] **Step 2: Verify the node script parses without errors**

```bash
node --input-type=module --eval "import './scripts/media-server.mjs'" 2>&1 | head -5
```

Expected: the script attempts to start (will fail at runtime without env vars, but should not throw a parse/import error). If it immediately errors with `STREAM_HOOK_SECRET is required`, that's correct — it means the module loaded fine.

- [ ] **Step 3: Commit**

```bash
git add scripts/media-server.mjs
git commit -m "feat: dual ffmpeg output — live HLS + VOD HLS per stream"
```

---

## Task 4: Stream end remux pipeline

**Files:**
- Modify: `scripts/media-server.mjs` — add helper functions + update `donePublish` handler

- [ ] **Step 1: Add `waitForExit` helper after `cleanupHlsDir`**

Find the `cleanupHlsDir` function (around line 224). After it, add:

```javascript
/** Wait for a child process to exit, then resolve. Sends SIGKILL after `timeoutMs`. */
function waitForExit(child, timeoutMs) {
  return new Promise((resolve) => {
    if (child.exitCode !== null || child.killed) { resolve(); return; }
    const timer = setTimeout(() => {
      try { child.kill("SIGKILL"); } catch { /* noop */ }
      resolve();
    }, timeoutMs);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}
```

- [ ] **Step 2: Add `ensureEndlist` helper**

After `waitForExit`, add:

```javascript
/**
 * Append EXT-X-ENDLIST to the manifest if absent.
 * ffmpeg writes it on clean SIGINT exit; we add it manually if SIGKILL was used.
 */
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
```

- [ ] **Step 3: Add `parseHlsSegments` helper**

After `ensureEndlist`, add:

```javascript
/** Extract ordered segment filenames from an HLS manifest. Returns absolute paths. */
function parseHlsSegments(manifestPath, segDir) {
  try {
    const content = readFileSync(manifestPath, "utf8");
    return content
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith("#"))
      .map((seg) => (path.isAbsolute(seg) ? seg : path.join(segDir, seg)));
  } catch {
    return [];
  }
}
```

- [ ] **Step 4: Add `remuxVodToMp4` helper**

After `parseHlsSegments`, add:

```javascript
/**
 * Concat-remux an ordered list of .ts segments to a single faststart MP4.
 * IO-bound (no re-encoding) — typically completes in seconds regardless of duration.
 */
function remuxVodToMp4(segments, outputPath) {
  const listPath = `${outputPath}.concat.txt`;
  // Forward slashes are safe on Windows ffmpeg and required on Unix.
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
```

- [ ] **Step 5: Replace the `donePublish` handler**

Find the `nms.on("donePublish", ...)` block (around line 291). Replace the entire handler:

```javascript
nms.on("donePublish", (session) => {
  const { streamName, key } = publishAuthFromSession(session);
  if (!streamName) return;

  const vod = vodState.get(streamName);
  vodState.delete(streamName);
  authorizedStreams.delete(streamName);

  const child = transcoders.get(streamName);
  stopHlsTranscoder(streamName);
  cleanupHlsDir(streamName);

  // Notify the app immediately so isLive flips without waiting for the remux.
  void postHookPayloadAsync({ event: "donePublish", streamName, key }).catch(
    (err) => console.error("[nms] donePublish hook failed:", err),
  );

  if (!vod) return;

  void (async () => {
    // Wait for ffmpeg to flush its final segment before reading the manifest.
    if (child) await waitForExit(child, 5000);

    const manifestPath = path.join(vod.vodHlsDir, "index.m3u8");
    ensureEndlist(manifestPath);
    const segments = parseHlsSegments(manifestPath, vod.vodHlsDir);

    if (segments.length === 0) {
      console.warn(`[remux] no segments for ${streamName} — skipping VOD`);
      rmSync(vod.vodHlsDir, { recursive: true, force: true });
      return;
    }

    const mp4Path = path.join(VIDEO_UPLOAD_DIR, `${vod.vodId}.mp4`);
    try {
      await remuxVodToMp4(segments, mp4Path);
      await postHookPayloadAsync({ event: "vodReady", streamName, vodId: vod.vodId });
      console.log(`[remux] VOD ready for ${streamName}: ${mp4Path}`);
    } catch (err) {
      console.error(`[remux] failed for ${streamName}:`, err);
    } finally {
      rmSync(vod.vodHlsDir, { recursive: true, force: true });
    }
  })();
});
```

- [ ] **Step 6: Verify the script still loads without parse errors**

```bash
node --input-type=module --eval "import './scripts/media-server.mjs'" 2>&1 | head -5
```

Expected: process exits with `STREAM_HOOK_SECRET is required` (correct — means the module parsed and ran `main()`).

- [ ] **Step 7: Commit**

```bash
git add scripts/media-server.mjs
git commit -m "feat: remux VOD HLS to MP4 on stream end, fire vodReady hook"
```

---

## Task 5: Hook route — `vodReady` handler

**Files:**
- Modify: `src/app/api/stream/hook/route.ts`

- [ ] **Step 1: Add `randomUUID` import**

The file currently imports only `timingSafeEqual` from `node:crypto`. Replace:

```typescript
import { timingSafeEqual } from "node:crypto";
```

With:

```typescript
import { randomUUID, timingSafeEqual } from "node:crypto";
```

- [ ] **Step 2: Replace the flat schema with a discriminated union**

Replace the entire `hookSchema` definition:

```typescript
const hookSchema = z.object({
  event: z.enum(["prePublish", "donePublish"]),
  streamName: z.string().min(1).max(80).regex(/^[a-z0-9-]+$/i),
  key: z.string().min(1).max(128),
});
```

With:

```typescript
const streamNameSchema = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9-]+$/i);

const hookSchema = z.discriminatedUnion("event", [
  z.object({
    event: z.literal("prePublish"),
    streamName: streamNameSchema,
    key: z.string().min(1).max(128),
  }),
  z.object({
    event: z.literal("donePublish"),
    streamName: streamNameSchema,
    key: z.string().max(128).optional(),
  }),
  z.object({
    event: z.literal("vodReady"),
    streamName: streamNameSchema,
    vodId: z.string().min(1).max(64).regex(/^[a-f0-9]+$/),
  }),
]);
```

- [ ] **Step 3: Add the `vodReady` handler inside `POST`**

After the existing `else` block that handles `donePublish` (which ends around line 75), add an `else if` before the final `return`:

```typescript
  } else {
    // donePublish
    await prisma.liveStream.update({
      where: { id: stream.id },
      data: { isLive: false },
    });
  }
```

Wait — with the discriminated union, the `stream` lookup at line 46 is shared across all events. But `vodReady` doesn't need to look up by `id`; it needs `channelId` and metadata. Refactor the handler to handle each event separately.

Replace the entire `POST` handler body after the secret check, from the `let body` declaration through the final `return`, with:

```typescript
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const parsed = hookSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid payload." },
      { status: 400 },
    );
  }

  // Use parsed.data.event (not a destructured variable) so TypeScript narrows
  // parsed.data to the correct union member inside each branch.
  const { streamName } = parsed.data;

  if (parsed.data.event === "prePublish") {
    const stream = await prisma.liveStream.findFirst({
      where: { channel: { slug: streamName } },
      select: { id: true, streamKey: true },
    });
    if (!stream) return NextResponse.json({ ok: true });
    if (
      !stream.streamKey ||
      !secureStringMatch(parsed.data.key, stream.streamKey)
    ) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }
    await prisma.liveStream.update({
      where: { id: stream.id },
      data: { isLive: true, startedAt: new Date(), lastIngestAt: new Date() },
    });
  } else if (parsed.data.event === "donePublish") {
    const stream = await prisma.liveStream.findFirst({
      where: { channel: { slug: streamName } },
      select: { id: true },
    });
    if (!stream) return NextResponse.json({ ok: true });
    await prisma.liveStream.update({
      where: { id: stream.id },
      data: { isLive: false },
    });
  } else {
    // vodReady — parsed.data.vodId is accessible because TS narrows to vodReady shape
    const liveStream = await prisma.liveStream.findFirst({
      where: { channel: { slug: streamName } },
      select: {
        title: true,
        category: true,
        rating: true,
        thumbnail: true,
        channelId: true,
      },
    });
    if (!liveStream) return NextResponse.json({ ok: true });
    await prisma.video.create({
      data: {
        id: randomUUID(),
        title: liveStream.title,
        category: liveStream.category ?? null,
        rating: liveStream.rating,
        thumbnail: liveStream.thumbnail ?? null,
        sourceUrl: `/uploads/videos/${parsed.data.vodId}.mp4`,
        channelId: liveStream.channelId,
      },
    });
  }

  return NextResponse.json({ ok: true });
```

- [ ] **Step 4: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/stream/hook/route.ts
git commit -m "feat: add vodReady hook event — creates Video record from stream recording"
```

---

## Task 6: Player — `disableSeek` and `dvrMode` params

**Files:**
- Modify: `public/video-player/player.js`

Two new URL params:
- `disableSeek=1` — hides the seek bar (live player)
- `dvrMode=1` — skips snap-to-live-edge on load and hides the "Jump to live" button (DVR player)

- [ ] **Step 1: Read the new params from `startupQuery`**

Find the last startup param declaration (around line 115–117):

```javascript
const startupHostBridge = ["1", "true", "yes"].includes(
  String(startupQuery.get("hostBridge") || "").toLowerCase()
);
```

Add immediately after it:

```javascript
const startupDisableSeek = startupQuery.get("disableSeek") === "1";
const startupDvrMode = startupQuery.get("dvrMode") === "1";
```

- [ ] **Step 2: Apply seek disable immediately after params**

Add right after the two new constants:

```javascript
if (startupDisableSeek) {
  if (progressWrap instanceof HTMLElement) progressWrap.hidden = true;
  if (progress instanceof HTMLInputElement) {
    progress.disabled = true;
    progress.tabIndex = -1;
  }
}
```

- [ ] **Step 3: Skip snap-to-edge in `requestInitialLiveSeek` when in DVR mode**

Find `requestInitialLiveSeek` (around line 464):

```javascript
function requestInitialLiveSeek() {
  pendingInitialLiveSeek = true;
  clearInitialLiveSeekGuard();
  ...
```

Add a guard at the very top of the function body:

```javascript
function requestInitialLiveSeek() {
  if (startupDvrMode) {
    tryPlayLiveMedia();
    return;
  }
  pendingInitialLiveSeek = true;
  clearInitialLiveSeekGuard();
```

- [ ] **Step 4: Hide `goLiveBtn` when in DVR mode**

Find `syncLiveButtonUI` (around line 496):

```javascript
function syncLiveButtonUI() {
  if (!(goLiveBtn instanceof HTMLElement)) return;
  const live = isLiveStream();
  goLiveBtn.hidden = !live;
```

Replace that third line:

```javascript
  goLiveBtn.hidden = !live || startupDvrMode;
```

- [ ] **Step 5: Pass `startPosition: 0` to hls.js when in DVR mode**

Find the hls.js constructor call (around line 1649):

```javascript
const instance = new HlsCtor({
  lowLatencyMode: true,
  enableWorker: true,
  liveSyncDurationCount: 1,
  liveMaxLatencyDurationCount: 7,
  maxLiveSyncPlaybackRate: 1.2,
  maxBufferLength: 24,
  backBufferLength: 18,
  manifestLoadPolicy: retryPolicy,
  playlistLoadPolicy: retryPolicy,
  fragLoadPolicy: retryPolicy,
});
```

Replace with:

```javascript
const instance = new HlsCtor({
  lowLatencyMode: true,
  enableWorker: true,
  liveSyncDurationCount: 1,
  liveMaxLatencyDurationCount: 7,
  maxLiveSyncPlaybackRate: 1.2,
  maxBufferLength: 24,
  backBufferLength: 18,
  ...(startupDvrMode ? { startPosition: 0 } : {}),
  manifestLoadPolicy: retryPolicy,
  playlistLoadPolicy: retryPolicy,
  fragLoadPolicy: retryPolicy,
});
```

- [ ] **Step 6: Commit**

```bash
git add public/video-player/player.js
git commit -m "feat: add disableSeek and dvrMode URL params to video player"
```

---

## Task 7: `VideoPlayer` — `disableSeek` and `dvrMode` props

**Files:**
- Modify: `src/components/VideoPlayer.tsx`

- [ ] **Step 1: Add the new props to the type and destructure**

Replace the entire file content:

```typescript
type VideoPlayerProps = {
  src: string;
  /** When set, the player loads `/api/videos/{id}/renditions` and shows a quality menu. */
  videoId?: string;
  title?: string;
  className?: string;
  /**
   * Wall-clock moment the broadcast started (from `LiveStream.startedAt`).
   * Forwarded to the embedded player so its live-time readout can show
   * "elapsed since broadcast start" — the HLS manifest alone only exposes the
   * last ~12 s of segments so the player can't derive a true start on its own.
   */
  liveStartedAt?: Date | string | null;
  /** Hides the seek bar. Used for the true-live player. */
  disableSeek?: boolean;
  /** Skips snap-to-live-edge and hides the goLive button. Used for the DVR player. */
  dvrMode?: boolean;
};

function isLocalHostUploadSource(src: string) {
  return src.startsWith("/uploads/videos/");
}

export function VideoPlayer({
  src,
  videoId,
  title,
  className,
  liveStartedAt,
  disableSeek,
  dvrMode,
}: VideoPlayerProps) {
  const startedAtIso =
    liveStartedAt instanceof Date
      ? liveStartedAt.toISOString()
      : typeof liveStartedAt === "string" && liveStartedAt
        ? liveStartedAt
        : null;
  const vidQ =
    videoId != null && isLocalHostUploadSource(src)
      ? `&vid=${encodeURIComponent(videoId)}`
      : "";
  const base =
    startedAtIso != null
      ? `/video-player/embed.html?src=${encodeURIComponent(src)}&startedAt=${encodeURIComponent(
          startedAtIso,
        )}${vidQ}`
      : `/video-player/embed.html?src=${encodeURIComponent(src)}${vidQ}`;
  const extraParams = [
    disableSeek ? "disableSeek=1" : "",
    dvrMode ? "dvrMode=1" : "",
  ]
    .filter(Boolean)
    .join("&");
  const iframeSrc = `${base}&autoplay=1${extraParams ? `&${extraParams}` : ""}`;
  return (
    <div
      className={`relative w-full overflow-hidden rounded-lg bg-black shadow-2xl shadow-black/30 ${
        className ?? ""
      }`}
      style={{ aspectRatio: "16 / 9" }}
    >
      <iframe
        title={title ?? "Tesil Video Player"}
        src={iframeSrc}
        className="absolute inset-0 h-full w-full border-0"
        allow="fullscreen; picture-in-picture; autoplay"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
        loading="eager"
      />
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/VideoPlayer.tsx
git commit -m "feat: add disableSeek and dvrMode props to VideoPlayer"
```

---

## Task 8: `LivePlayerToggle` — new Client Component

**Files:**
- Create: `src/components/LivePlayerToggle.tsx`

- [ ] **Step 1: Create the file**

```typescript
"use client";

import { useState } from "react";

import { VideoPlayer } from "@/components/VideoPlayer";

type Props = {
  slug: string;
  isLive: boolean;
  title: string;
  startedAt: Date | null;
};

export function LivePlayerToggle({ slug, isLive, title, startedAt }: Props) {
  const [mode, setMode] = useState<"live" | "dvr">("live");

  const src =
    mode === "live"
      ? `/hls/${slug}/index.m3u8`
      : `/hls-vod/${slug}/index.m3u8`;

  return (
    <div>
      <VideoPlayer
        src={src}
        title={title}
        liveStartedAt={mode === "live" ? startedAt : null}
        disableSeek={mode === "live"}
        dvrMode={mode === "dvr"}
      />
      {isLive && (
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={() => setMode("live")}
            className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              mode === "live"
                ? "bg-live text-white"
                : "border border-border bg-surface text-text hover:bg-surface-2"
            }`}
          >
            {mode === "live" && (
              <span className="live-pulse inline-block h-1.5 w-1.5 rounded-full bg-white" />
            )}
            Watch live
          </button>
          <button
            type="button"
            onClick={() => setMode("dvr")}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              mode === "dvr"
                ? "bg-accent text-on-accent"
                : "border border-border bg-surface text-text hover:bg-surface-2"
            }`}
          >
            Watch from beginning
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/LivePlayerToggle.tsx
git commit -m "feat: add LivePlayerToggle client component for live/DVR mode switching"
```

---

## Task 9: Live page — swap `VideoPlayer` for `LivePlayerToggle`

**Files:**
- Modify: `src/app/live/[slug]/page.tsx`

- [ ] **Step 1: Add the `LivePlayerToggle` import**

At the top of the file, after the existing `VideoPlayer` import:

```typescript
import { VideoPlayer } from "@/components/VideoPlayer";
```

Add:

```typescript
import { LivePlayerToggle } from "@/components/LivePlayerToggle";
```

- [ ] **Step 2: Replace the player in the main return**

Find the `VideoPlayer` usage in the main return (around line 80):

```tsx
<VideoPlayer
  src={playbackSrc}
  title={stream.title}
  liveStartedAt={stream.isLive ? stream.startedAt : null}
/>
```

Replace with:

```tsx
{stream.streamKey ? (
  <LivePlayerToggle
    slug={channel.slug}
    isLive={stream.isLive}
    title={stream.title}
    startedAt={stream.startedAt}
  />
) : (
  <VideoPlayer
    src={stream.streamUrl}
    title={stream.title}
    liveStartedAt={stream.isLive ? stream.startedAt : null}
  />
)}
```

The `playbackSrc` variable is no longer needed — you can delete it (lines 31–34):

```typescript
const playbackSrc =
  stream.streamKey && stream.isLive
    ? `/hls/${channel.slug}/index.m3u8`
    : stream.streamUrl;
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Build check**

```bash
npx next build 2>&1 | tail -20
```

Expected: build succeeds with no type or compilation errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/live/[slug]/page.tsx
git commit -m "feat: swap live page player for LivePlayerToggle with DVR support"
```

---

## Smoke Test Checklist

Run the app (`npm run dev` + `node scripts/media-server.mjs`) and push a stream from OBS:

- [ ] Live player loads at `/live/{slug}` — seek bar is hidden, "LIVE" indicator shows
- [ ] "Watch from beginning" button appears while stream is live
- [ ] Clicking it swaps to the DVR player — seek bar is visible, playback starts from segment 0
- [ ] Seeking backward in DVR player works into already-recorded content
- [ ] "Watch live" button switches back to the live player (seek bar hidden again)
- [ ] On stream end: `media/vod/{slug}/` is created then deleted
- [ ] A `.mp4` file appears in `public/uploads/videos/`
- [ ] The channel's video list gains a new entry with the stream's title, category, and rating
- [ ] The VOD is playable and seekable in full from the video page
- [ ] After stream ends, toggle buttons disappear on the live page (stream is offline)
