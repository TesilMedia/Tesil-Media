import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { unlink } from "node:fs/promises";

const execFileAsync = promisify(execFile);

const TRANSCODE_TIMEOUT_MS = 1_800_000;

export type VideoQualityRendition = {
  label: string;
  url: string;
  height: number;
};

const RUNGS: readonly number[] = [1080, 720, 480, 360];

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

/**
 * Deletable transcode files (excludes the original upload at `sourceUrl`).
 */
export function collectVariantPublicUrls(
  qualityVariantsJson: string | null | undefined,
  sourceUrl: string | null | undefined,
): string[] {
  if (!qualityVariantsJson) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(qualityVariantsJson) as unknown;
  } catch {
    return [];
  }
  if (!isRenditionList(parsed)) return [];
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
  for (const rung of RUNGS) {
    await unlink(path.join(videoDir, `${videoId}-${rung}p.mp4`)).catch(
      () => {},
    );
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
 * Probes the source, encodes every lower rung (1080p → 360p) where the source
 * is taller than that rung, and returns the full quality list (highest first).
 * Thrown errors mean the upload should be rolled back; partial files should be
 * removed with `unlinkRungFilesForVideoId`.
 */
export async function buildQualityLadderFiles(
  videoId: string,
  inputAbs: string,
  sourcePublicUrl: string,
  videoDir: string,
): Promise<VideoQualityRendition[]> {
  const sourceHeight = await probeVideoHeight(inputAbs);
  if (sourceHeight == null) {
    throw new Error("Could not read video dimensions (is ffprobe installed?)");
  }

  const list: VideoQualityRendition[] = [
    {
      label: heightToDisplayLabel(sourceHeight),
      url: sourcePublicUrl,
      height: sourceHeight,
    },
  ];

  for (const rung of RUNGS) {
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
    list.push({
      label: `${rung}p`,
      url: `/uploads/videos/${outName}`,
      height: rung,
    });
  }

  return list;
}
