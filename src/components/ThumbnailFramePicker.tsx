"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";

/** Iframe (player.js) and parent (this component) */
const TESIL_MSG = {
  SET_FILE: "tesil-embed-set-file",
  CAPTURE: "tesil-embed-capture-frame",
  CAPTURE_RESULT: "tesil-embed-capture-frame-result",
  META: "tesil-embed-meta",
} as const;

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
 * Tesil Video Player (same scrub + frame step UI as watch) for choosing an exact
 * frame. Plain &lt;video&gt; scrubs only land on keyframes (~every few seconds).
 */
export function ThumbnailFramePicker({
  disabled,
  videoFile,
  videoUrl,
  onFrameChosen,
  onDurationSec,
}: ThumbnailFramePickerProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const pendingCaptureId = useRef<string | null>(null);
  const labelId = useId();
  const [iframeSrc, setIframeSrc] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    setError(null);
    setReady(false);
    setBusy(false);
    setDuration(0);

    if (videoFile && videoFile.size > 0) {
      const u = new URL("/video-player/embed.html", window.location.origin);
      u.searchParams.set("embed", "1");
      u.searchParams.set("autoplay", "0");
      u.searchParams.set("hostBridge", "1");
      setIframeSrc(u.pathname + u.search);
      return;
    }

    const trimmed = videoUrl?.trim();
    if (trimmed) {
      const u = new URL("/video-player/embed.html", window.location.origin);
      u.searchParams.set("src", trimmed);
      u.searchParams.set("embed", "1");
      u.searchParams.set("autoplay", "0");
      setIframeSrc(u.pathname + u.search);
      return;
    }

    setIframeSrc(null);
  }, [videoFile, videoUrl]);

  const onIframeLoad = useCallback(() => {
    if (!videoFile || videoFile.size <= 0) return;
    const w = iframeRef.current?.contentWindow;
    if (!w) return;
    w.postMessage(
      { type: TESIL_MSG.SET_FILE, file: videoFile },
      window.location.origin,
    );
  }, [videoFile]);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      if (e.data?.type === TESIL_MSG.META && typeof e.data.durationSec === "number") {
        setDuration(e.data.durationSec);
        setReady(true);
        onDurationSec?.(e.data.durationSec);
        return;
      }
      if (e.data?.type === TESIL_MSG.CAPTURE_RESULT) {
        if (e.data.id !== pendingCaptureId.current) return;
        pendingCaptureId.current = null;
        setBusy(false);
        if (e.data.ok && e.data.blob instanceof Blob) {
          const file = new File([e.data.blob], "thumbnail-from-video.jpg", {
            type: "image/jpeg",
          });
          onFrameChosen(file);
        } else {
          setError(
            typeof e.data.error === "string"
              ? e.data.error
              : "Could not capture this frame.",
          );
        }
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [onDurationSec, onFrameChosen]);

  const captureFrame = useCallback(() => {
    const w = iframeRef.current?.contentWindow;
    if (!w || disabled || busy || !ready) return;
    const id =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : String(Date.now());
    pendingCaptureId.current = id;
    setBusy(true);
    setError(null);
    w.postMessage({ type: TESIL_MSG.CAPTURE, id }, window.location.origin);
  }, [busy, disabled, ready]);

  if (!iframeSrc) return null;

  return (
    <div
      className="mt-2 flex flex-col gap-2 rounded-md border border-border bg-surface-2/40 p-3 text-xs"
      aria-labelledby={labelId}
    >
      <div id={labelId} className="font-medium text-text">
        Tesil player — pick a frame
      </div>
      <p className="text-[11px] text-muted">
        Scrub the timeline, use the <kbd className="rounded bg-surface px-0.5">,</kbd> and{" "}
        <kbd className="rounded bg-surface px-0.5">.</kbd> frame buttons for precision, then
        capture the frame.
      </p>
      <div
        className="relative w-full overflow-hidden rounded-md bg-black"
        style={{ aspectRatio: "16 / 9" }}
      >
        <iframe
          key={iframeSrc + (videoFile ? `${videoFile.name}-${videoFile.size}` : "")}
          ref={iframeRef}
          title="Tesil player — pick thumbnail frame"
          src={iframeSrc}
          onLoad={onIframeLoad}
          className="absolute inset-0 h-full w-full border-0"
          allow="fullscreen; picture-in-picture; autoplay"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          loading="eager"
        />
      </div>
      {duration > 0 ? (
        <div className="text-center tabular-nums text-[11px] text-muted">
          Length: {formatTime(duration)}
        </div>
      ) : null}
      <button
        type="button"
        disabled={disabled || !ready || busy}
        onClick={captureFrame}
        className="rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text hover:bg-surface-2 disabled:opacity-50"
      >
        {busy ? "Capturing…" : "Use current frame as thumbnail"}
      </button>
      {error ? (
        <div className="rounded border border-danger-border bg-danger-bg px-2 py-1.5 text-[11px] text-danger">
          {error}
        </div>
      ) : null}
    </div>
  );
}

/** True when the URL is likely playable in a plain &lt;video&gt; tag (not YouTube/Vimeo embed pages). */
export function canScrubVideoForThumbnail(
  sourceUrl: string | null | undefined,
): boolean {
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
