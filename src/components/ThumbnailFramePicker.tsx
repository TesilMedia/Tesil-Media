"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const MAX_CAPTURE_WIDTH = 1280;
const JPEG_QUALITY = 0.92;

function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export type ThumbnailFramePickerProps = {
  disabled?: boolean;
  /** Local file from the upload file input */
  videoFile?: File | null;
  /** Absolute path on this site (`/uploads/...`) or direct video URL */
  videoUrl?: string | null;
  /** Called with a JPEG file suitable for the thumbnail field */
  onFrameChosen: (file: File) => void;
  /** Fired once metadata loads (upload flow uses this to persist duration on the server). */
  onDurationSec?: (seconds: number) => void;
};

/**
 * Scrub a video and capture the current frame as a JPEG for use as thumbnail.
 */
export function ThumbnailFramePicker({
  disabled,
  videoFile,
  videoUrl,
  onFrameChosen,
  onDurationSec,
}: ThumbnailFramePickerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [activeSrc, setActiveSrc] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    setReady(false);
    setDuration(0);
    setCurrentTime(0);

    if (videoFile && videoFile.size > 0) {
      const url = URL.createObjectURL(videoFile);
      setActiveSrc(url);
      return () => {
        URL.revokeObjectURL(url);
      };
    }

    setActiveSrc(videoUrl?.trim() ? videoUrl.trim() : null);
    return () => {};
  }, [videoFile, videoUrl]);

  const onLoadedMetadata = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    const d = Number.isFinite(v.duration) ? v.duration : 0;
    setDuration(d);
    setCurrentTime(0);
    setReady(true);
    if (d > 0 && onDurationSec) {
      onDurationSec(Math.round(d));
    }
  }, [onDurationSec]);

  const onTimeUpdate = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    setCurrentTime(v.currentTime);
  }, []);

  const onSeeked = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    setCurrentTime(v.currentTime);
  }, []);

  const scrubTo = useCallback((t: number) => {
    const v = videoRef.current;
    if (!v || !ready) return;
    const next = Math.min(Math.max(0, t), duration || v.duration || 0);
    v.currentTime = next;
  }, [duration, ready]);

  const captureFrame = useCallback(() => {
    const v = videoRef.current;
    if (!v || disabled || busy || !ready) return;
    const vw = v.videoWidth;
    const vh = v.videoHeight;
    if (!vw || !vh) {
      setError("Video has no frame yet — try again after it loads.");
      return;
    }

    setBusy(true);
    setError(null);

    let w = vw;
    let h = vh;
    if (w > MAX_CAPTURE_WIDTH) {
      h = Math.round((vh * MAX_CAPTURE_WIDTH) / vw);
      w = MAX_CAPTURE_WIDTH;
    }

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setError("Could not read pixels from this video.");
      setBusy(false);
      return;
    }

    try {
      ctx.drawImage(v, 0, 0, w, h);
    } catch {
      setError(
        "This video cannot be captured (browser security). Use an image file instead, or a file hosted on this site.",
      );
      setBusy(false);
      return;
    }

    canvas.toBlob(
      (blob) => {
        setBusy(false);
        if (!blob) {
          setError("Could not encode thumbnail.");
          return;
        }
        const file = new File([blob], "thumbnail-from-video.jpg", {
          type: "image/jpeg",
        });
        onFrameChosen(file);
      },
      "image/jpeg",
      JPEG_QUALITY,
    );
  }, [busy, disabled, onFrameChosen, ready]);

  if (!activeSrc) return null;

  return (
    <div className="mt-2 flex flex-col gap-2 rounded-md border border-border bg-surface-2/40 p-3 text-xs">
      <div className="font-medium text-text">Pick a frame from the video</div>
      <div className="overflow-hidden rounded-md bg-black">
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video
          key={activeSrc}
          ref={videoRef}
          src={activeSrc}
          className="max-h-48 w-full object-contain"
          playsInline
          preload="metadata"
          muted
          onLoadedMetadata={onLoadedMetadata}
          onTimeUpdate={onTimeUpdate}
          onSeeked={onSeeked}
          onError={() => {
            setReady(false);
            setError("Could not load this video for scrubbing.");
          }}
        />
      </div>
      <label className="flex flex-col gap-1 text-muted">
        <span className="flex justify-between gap-2 text-[11px]">
          <span>Scrub</span>
          <span className="tabular-nums text-text">
            {formatTime(currentTime)}
            {duration > 0 ? ` / ${formatTime(duration)}` : ""}
          </span>
        </span>
        <input
          type="range"
          min={0}
          max={duration > 0 ? duration : 0}
          step={duration > 500 ? 0.5 : 0.05}
          value={duration > 0 ? Math.min(currentTime, duration) : 0}
          disabled={disabled || !ready || duration <= 0}
          onChange={(e) => scrubTo(Number(e.target.value))}
          className="w-full accent-accent disabled:opacity-50"
        />
      </label>
      <button
        type="button"
        disabled={disabled || !ready || busy}
        onClick={captureFrame}
        className="rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text hover:bg-surface-2 disabled:opacity-50"
      >
        {busy ? "Capturing…" : "Use current frame as thumbnail"}
      </button>
      {error ? (
        <div className="rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-100">
          {error}
        </div>
      ) : null}
    </div>
  );
}

/** True when the URL is likely playable in a plain &lt;video&gt; tag (not YouTube/Vimeo embed pages). */
export function canScrubVideoForThumbnail(sourceUrl: string | null | undefined): boolean {
  if (!sourceUrl?.trim()) return false;
  const u = sourceUrl.trim().toLowerCase();
  if (
    u.includes("youtube.com") ||
    u.includes("youtu.be") ||
    u.includes("vimeo.com") ||
    u.includes("twitch.tv")
  ) {
    return false;
  }
  return true;
}
