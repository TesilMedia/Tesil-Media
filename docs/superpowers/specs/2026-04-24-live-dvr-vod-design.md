# Live DVR / VOD Recording Design

**Date:** 2026-04-24
**Status:** Approved

## Overview

While a stream is live, record all HLS segments to a separate growing playlist that viewers can seek into freely. When the stream ends, concat-remux the segments to a permanent MP4 and publish it as a regular Video record on the channel. The live player simultaneously has seeking disabled so it stays truly live.

---

## Architecture

### Dual ffmpeg output

`startHlsTranscoder` in `scripts/media-server.mjs` spawns a single ffmpeg process with two HLS outputs from the same RTMP subscriber connection:

| Output | Path | Flags | Purpose |
|--------|------|-------|---------|
| Live HLS | `media/live/{slug}/index.m3u8` | `hls_list_size 8`, `delete_segments`, `omit_endlist` | Live playback (unchanged) |
| VOD HLS | `media/vod/{slug}/index.m3u8` | `hls_list_size 0`, no `delete_segments`, no `omit_endlist` | DVR playback + remux source |

Both outputs use `-c:v copy` and `-c:a aac -ar 44100 -b:a 128k`. Audio is encoded independently per output (negligible overhead at 128kbps AAC). The VOD HLS uses 4-second segments to reduce file count for long streams.

### State tracking

A new `vodState = new Map<slug, { vodId: string, vodHlsDir: string }>()` is added alongside the existing `transcoders` map. `vodId` is `crypto.randomBytes(12).toString("hex")`, generated at `postPublish` time and used as the MP4 filename.

### Stream end / remux pipeline

When `donePublish` fires:

1. Send SIGINT to ffmpeg
2. Fire existing `donePublish` hook immediately (`isLive = false`) — no waiting
3. Await ffmpeg process exit (up to 5s, then SIGKILL)
4. Ensure `EXT-X-ENDLIST` is appended to `media/vod/{slug}/index.m3u8` (ffmpeg writes it on clean exit; append manually if SIGKILL was needed)
5. Async remux (non-blocking):
   a. Parse `index.m3u8` for ordered segment list
   b. Write `concat.txt`
   c. Run `ffmpeg -f concat -safe 0 -i concat.txt -c copy -movflags +faststart -y public/uploads/videos/{vodId}.mp4`
   d. POST `{ event: "vodReady", streamName, vodId }` to hook
   e. Delete `media/vod/{slug}/` (success or failure)

---

## Static file serving

**NMS config** changes from `router: '/live', root: HLS_ROOT` to `router: '/', root: MEDIA_ROOT`. Port 8000 then serves the whole `media/` directory:

- Live HLS: `http://localhost:8000/live/{slug}/index.m3u8` (unchanged)
- VOD HLS: `http://localhost:8000/vod/{slug}/index.m3u8` (new)

**`next.config.ts`** gains a second rewrite:

```
/hls-vod/:path* → http://localhost:8000/vod/:path*
```

The existing `/hls/:path*` rewrite is unchanged.

---

## Hook route (`src/app/api/stream/hook/route.ts`)

The flat `hookSchema` becomes a `z.discriminatedUnion("event", [...])` with three shapes:

| Event | Required fields | Action |
|-------|----------------|--------|
| `prePublish` | `streamName`, `key` | Validate key, set `isLive = true` (unchanged) |
| `donePublish` | `streamName`, `key` | Set `isLive = false` (unchanged) |
| `vodReady` | `streamName`, `vodId` | Create `Video` record (new) |

**`vodReady` handler:**
1. Look up `LiveStream` by channel slug (include `channel` for `channelId`)
2. `prisma.video.create` with:
   - `id`: fresh `cuid()` generated in the handler
   - `sourceUrl`: `/uploads/videos/{vodId}.mp4`
   - `title`, `category`, `rating`, `thumbnail`: inherited from `LiveStream`
   - `transcodePending`: `false` (MP4 is final; no quality ladder)
   - `channelId`: from the looked-up stream

---

## Live page UI

### Seek disable

`VideoPlayer.tsx` gains an optional `disableSeek?: boolean` prop. When `true`, it appends `&disableSeek=1` to the iframe URL. `player.js` reads this param on init and hides the seek bar + blocks pointer events on it. All other controls (volume, fullscreen, quality) are unaffected.

### `LivePlayerToggle` (new Client Component)

`src/components/LivePlayerToggle.tsx` holds `mode: "live" | "dvr"` state (default `"live"`). Renders:

- **Player:** `VideoPlayer` with `src` and `disableSeek` driven by `mode`
  - `live` → `/hls/{slug}/index.m3u8`, `disableSeek={true}`
  - `dvr` → `/hls-vod/{slug}/index.m3u8`, `disableSeek={false}`
- **Toggle buttons:** shown only when `isLive === true`
  - "Watch live" (active when mode is `live`)
  - "Watch from beginning" (active when mode is `dvr`)

### `live/[slug]/page.tsx`

Remains a Server Component. Handles the rating gate check unchanged. Replaces the inline `VideoPlayer` call with `<LivePlayerToggle>`, passing `isLive`, `slug`, `startedAt`, `title`, and stream metadata as props.

---

## Files changed

| File | Change |
|------|--------|
| `scripts/media-server.mjs` | Dual ffmpeg output, `vodState` map, remux pipeline, `vodReady` hook call, NMS static config |
| `src/app/api/stream/hook/route.ts` | Discriminated union schema, `vodReady` handler |
| `next.config.ts` | Add `/hls-vod/:path*` rewrite |
| `public/video-player/player.js` | Read `disableSeek` param, hide seek bar when set |
| `src/components/VideoPlayer.tsx` | Add `disableSeek` prop |
| `src/components/LivePlayerToggle.tsx` | New Client Component (toggle + dual player) |
| `src/app/live/[slug]/page.tsx` | Swap inline player for `LivePlayerToggle` |

No schema migrations required — `Video` already has all needed fields.

---

## Error handling

- **Remux failure:** Log error, delete VOD HLS segments, do not call `vodReady` hook. Stream ends normally; no VOD appears. No retry (operator can manually remux if needed).
- **SIGKILL fallback:** `EXT-X-ENDLIST` appended manually before remux if absent.
- **`vodReady` hook failure:** Log error. VOD HLS segments are still cleaned up. The orphaned MP4 file remains on disk but no DB record is created.
- **Stream ends before first VOD segment written:** Remux finds no segments, skips `vodReady` call cleanly.
