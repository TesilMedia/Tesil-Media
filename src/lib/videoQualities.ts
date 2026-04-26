import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";

const execFileAsync = promisify(execFile);

const TRANSCODE_TIMEOUT_MS = 1_800_000;

export type VideoQualityRendition = {
  label: string;
  url: string;
  height: number;
};

export const QUALITY_RUNGS: readonly number[] = [1080, 720, 480, 360];

/** How many ffmpeg ladder outputs we will generate for this source height (excludes original). */
export function expectedTranscodedRungCount(sourceHeight: number): number {
  let n = 0;
  for (const rung of QUALITY_RUNGS) {
    if (sourceHeight > rung) n++;
  }
  return n;
}

/** Human-readable height label (e.g. 1080 → "1080p"). */
export function heightToDisplayLabel(height: number): string {
  if (!Number.isFinite(height) || height <= 0) return "Source";
  return `${Math.round(height)}p`;
}

function isRenditionList(v: unknown): v is VideoQualityRendition[] {
  if (!Array.isArray(v)) return false;
  for (const x of v) {
    if (!x || typeof x !== "object") return false;
    const o = x as Record<string, unknown>;
    if (typeof o.label !== "string" || typeof o.url !== "string") return false;
    if (typeof o.height !== "number" || !Number.isFinite(o.height)) return false;
  }
  return v.length > 0;
}

/** Parses stored ladder JSON; returns null if missing or invalid. */
export function parseQualityVariantsJson(
  raw: string | null | undefined,
): VideoQualityRendition[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return isRenditionList(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Deletable transcode files (excludes the original upload at `sourceUrl`).
 */
export function collectVariantPublicUrls(
  qualityVariantsJson: string | null | undefined,
  sourceUrl: string | null | undefined,
): string[] {
  const parsed = parseQualityVariantsJson(qualityVariantsJson);
  if (!parsed) return [];
  const urls = new Set<string>();
  for (const r of parsed) {
    if (r.url && r.url !== sourceUrl) urls.add(r.url);
  }
  return [...urls];
}

export async function unlinkRungFilesForVideoId(
  videoId: string,
  videoDir: string,
): Promise<void> {
  for (const rung of QUALITY_RUNGS) {
    await unlink(path.join(videoDir, `${videoId}-${rung}p.mp4`)).catch(
      () => {},
    );
  }
}

async function probeVideoDuration(inputAbs: string): Promise<number | null> {
  try {
    const { stdout } = await execFileAsync(
      "ffprobe",
      [
        "-v", "error",
        "-show_entries", "format=duration",
        "-of", "csv=p=0",
        inputAbs,
      ],
      { maxBuffer: 2 * 1024 * 1024 },
    );
    const n = Number.parseFloat(String(stdout).trim());
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

/**
 * Extracts a JPEG frame from the middle of the video and saves it to the
 * thumbnails directory. Returns the public URL, or null on failure.
 */
export async function generateMidframeThumbnail(
  inputAbs: string,
  thumbnailDir: string,
): Promise<string | null> {
  try {
    const duration = await probeVideoDuration(inputAbs);
    if (duration == null) return null;

    const seekSecs = duration / 2;
    const filename = `${randomUUID()}.jpg`;
    const outputAbs = path.join(thumbnailDir, filename);

    await mkdir(thumbnailDir, { recursive: true });
    await execFileAsync(
      "ffmpeg",
      [
        "-y",
        "-ss", String(seekSecs),
        "-i", inputAbs,
        "-frames:v", "1",
        "-q:v", "2",
        outputAbs,
      ],
      { maxBuffer: 10 * 1024 * 1024, timeout: 30_000 },
    );

    return `/uploads/thumbnails/${filename}`;
  } catch {
    return null;
  }
}

async function probeVideoHeight(inputAbs: string): Promise<number | null> {
  try {
    const { stdout } = await execFileAsync(
      "ffprobe",
      [
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=height",
        "-of",
        "csv=p=0",
        inputAbs,
      ],
      { maxBuffer: 2 * 1024 * 1024 },
    );
    const n = Number.parseInt(String(stdout).trim(), 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

async function encodeLadderRung(
  inputAbs: string,
  outputAbs: string,
  maxHeight: number,
): Promise<void> {
  await execFileAsync(
    "ffmpeg",
    [
      "-y",
      "-i",
      inputAbs,
      "-c:v",
      "libx264",
      "-crf",
      "24",
      "-preset",
      "fast",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-movflags",
      "+faststart",
      "-vf",
      `scale=-2:${maxHeight}`,
      outputAbs,
    ],
    { maxBuffer: 40 * 1024 * 1024, timeout: TRANSCODE_TIMEOUT_MS },
  );
}

/**
 * Probes the source and returns a single-rendition ladder (source only).
 * Used to publish immediately; lower rungs are encoded in the background.
 */
export async function buildInitialQualityLadder(
  inputAbs: string,
  sourcePublicUrl: string,
): Promise<{ ladder: VideoQualityRendition[]; sourceHeight: number }> {
  const sourceHeight = await probeVideoHeight(inputAbs);
  if (sourceHeight == null) {
    throw new Error("Could not read video dimensions (is ffprobe installed?)");
  }
  const ladder: VideoQualityRendition[] = [
    {
      label: heightToDisplayLabel(sourceHeight),
      url: sourcePublicUrl,
      height: sourceHeight,
    },
  ];
  return { ladder, sourceHeight };
}

/**
 * Encodes each ladder rung below source height and calls `onRungEncoded` after
 * each file is written. Stops on first ffmpeg error (partial ladder may exist).
 */
export async function encodeEachRemainingRung(
  videoId: string,
  inputAbs: string,
  videoDir: string,
  sourceHeight: number,
  onRungEncoded: (rung: VideoQualityRendition) => Promise<void>,
): Promise<void> {
  for (const rung of QUALITY_RUNGS) {
    if (sourceHeight <= rung) continue;
    const outName = `${videoId}-${rung}p.mp4`;
    const outAbs = path.join(videoDir, outName);
    try {
      await encodeLadderRung(inputAbs, outAbs, rung);
    } catch (err) {
      console.error(`ffmpeg transcode failed (${rung}p):`, err);
      await unlink(outAbs).catch(() => {});
      throw new Error(
        `Transcoding failed at ${rung}p. Ensure ffmpeg is installed and the file is a valid video.`,
      );
    }
    await onRungEncoded({
      label: `${rung}p`,
      url: `/uploads/videos/${outName}`,
      height: rung,
    });
  }
}
