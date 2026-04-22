"use client";

import Link from "next/link";
import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type TouchEvent as ReactTouchEvent,
} from "react";

import { formatDuration, formatViews } from "@/lib/format";
import { titleOverflowClampClass } from "@/lib/titleClamp";
import { RatingBadge } from "@/components/RatingBadge";

type VideoCardProps = {
  id: string;
  title: string;
  thumbnail: string | null;
  durationSec: number | null;
  views: number;
  createdAt: Date;
  rating?: string | null;
  // Raw source URL. Used to play a muted hover preview for direct
  // video files (MP4/WebM/etc.). Embed-only sources like YouTube,
  // Vimeo and Twitch fall back to the static thumbnail.
  sourceUrl?: string | null;
  channel: {
    slug: string;
    name: string;
    avatarUrl: string | null;
  };
};

const HOVER_DELAY_MS = 400;
// Touch: movement past this after touchstart ≈ scroll/drag → start preview immediately.
const TOUCH_MOVE_PREVIEW_PX = 14;
// Touch: hold still this long on the thumb to start preview when the device can’t hover.
const TOUCH_HOLD_PREVIEW_MS = 380;

/** Only one card preview (hover or touch) at a time — avoids many muted videos on mobile scroll. */
type PreviewLeaseRelease = () => void;
let activePreviewRelease: PreviewLeaseRelease | null = null;

function takePreviewLease(release: PreviewLeaseRelease) {
  if (activePreviewRelease && activePreviewRelease !== release) {
    activePreviewRelease();
  }
  activePreviewRelease = release;
}

function releasePreviewLease(release: PreviewLeaseRelease) {
  if (activePreviewRelease === release) {
    activePreviewRelease = null;
  }
}

export function VideoCard(props: VideoCardProps) {
  const previewSrc = getPreviewableSrc(props.sourceUrl);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hoverTimerRef = useRef<number | null>(null);
  const touchSessionRef = useRef<{
    startX: number;
    startY: number;
    holdTimer: number | null;
    previewStarted: boolean;
  } | null>(null);

  const [showPreview, setShowPreview] = useState(false);
  const [previewReady, setPreviewReady] = useState(false);

  /** Stable per mount: used with global lease so only one preview plays app-wide. */
  const previewLeaseReleaseRef = useRef<PreviewLeaseRelease | null>(null);
  if (!previewLeaseReleaseRef.current) {
    previewLeaseReleaseRef.current = () => {
      const self = previewLeaseReleaseRef.current;
      if (!self) return;
      releasePreviewLease(self);
      if (hoverTimerRef.current) {
        clearTimeout(hoverTimerRef.current);
        hoverTimerRef.current = null;
      }
      setShowPreview(false);
      setPreviewReady(false);
      const v = videoRef.current;
      if (v) {
        try {
          v.pause();
          v.currentTime = 0;
        } catch {
          // ignore
        }
      }
    };
  }

  /** Touch scroll/hold preview — always when we have a file URL (works with pointer-hover too). */
  const useTouchPreview = Boolean(previewSrc);

  useEffect(() => {
    return () => {
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
      previewLeaseReleaseRef.current?.();
    };
  }, []);

  const startPreviewAfterDelay = () => {
    if (!previewSrc) return;
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = window.setTimeout(() => {
      takePreviewLease(previewLeaseReleaseRef.current!);
      setShowPreview(true);
    }, HOVER_DELAY_MS);
  };

  const startPreviewImmediately = () => {
    if (!previewSrc) return;
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    takePreviewLease(previewLeaseReleaseRef.current!);
    setShowPreview(true);
  };

  const stopPreview = () => {
    previewLeaseReleaseRef.current?.();
  };

  const handleThumbTouchStart = (e: ReactTouchEvent<HTMLAnchorElement>) => {
    if (!useTouchPreview) return;
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    const session: {
      startX: number;
      startY: number;
      holdTimer: number | null;
      previewStarted: boolean;
    } = {
      startX: t.clientX,
      startY: t.clientY,
      holdTimer: null,
      previewStarted: false,
    };
    touchSessionRef.current = session;
    session.holdTimer = window.setTimeout(() => {
      if (touchSessionRef.current !== session) return;
      session.holdTimer = null;
      session.previewStarted = true;
      startPreviewImmediately();
    }, TOUCH_HOLD_PREVIEW_MS);
  };

  const handleThumbTouchMove = (e: ReactTouchEvent<HTMLAnchorElement>) => {
    if (!useTouchPreview) return;
    const session = touchSessionRef.current;
    if (!session || session.previewStarted || !e.touches[0]) return;
    const t = e.touches[0];
    const dx = t.clientX - session.startX;
    const dy = t.clientY - session.startY;
    if (dx * dx + dy * dy < TOUCH_MOVE_PREVIEW_PX * TOUCH_MOVE_PREVIEW_PX) {
      return;
    }
    if (session.holdTimer) {
      clearTimeout(session.holdTimer);
      session.holdTimer = null;
    }
    session.previewStarted = true;
    startPreviewImmediately();
  };

  const handleThumbTouchEnd = () => {
    if (!useTouchPreview) return;
    const session = touchSessionRef.current;
    if (session?.holdTimer) clearTimeout(session.holdTimer);
    touchSessionRef.current = null;
  };

  const tryPlayPreview = () => {
    const v = videoRef.current;
    if (!v) return;
    const play = v.play();
    if (play && typeof play.catch === "function") {
      play.catch(() => {
        setShowPreview(false);
      });
    }
    setPreviewReady(true);
  };

  const handleCanPlay = () => {
    tryPlayPreview();
  };

  const handleLoadedData = () => {
    tryPlayPreview();
  };

  const thumbClasses =
    "relative block aspect-video touch-manipulation touch-callout-none overflow-hidden rounded-lg bg-surface shadow-card";

  const thumbnailVisual = (
    <>
      {props.thumbnail ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={props.thumbnail}
          alt=""
          className="h-full w-full object-cover transition group-hover:scale-[1.02]"
          draggable={false}
          loading="lazy"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-muted">
          No preview
        </div>
      )}
      {showPreview && previewSrc ? (
        <video
          ref={videoRef}
          src={previewSrc}
          muted
          loop
          playsInline
          preload="auto"
          onCanPlay={handleCanPlay}
          onLoadedData={handleLoadedData}
          onError={() => setShowPreview(false)}
          className={`pointer-events-none absolute inset-0 h-full w-full object-cover transition-opacity duration-200 ${
            previewReady ? "opacity-100" : "opacity-0"
          }`}
          aria-hidden="true"
          tabIndex={-1}
        />
      ) : null}
      <span className="pointer-events-none absolute bottom-2 left-2 rounded-full bg-black/75 px-2 py-0.5 text-[11px] font-medium tabular-nums text-cream">
        {formatViews(props.views)} {props.views === 1 ? "View" : "Views"}
      </span>
      {props.durationSec ? (
        <span className="pointer-events-none absolute bottom-2 right-2 rounded-full bg-black/75 px-2 py-0.5 text-[11px] font-medium tabular-nums text-cream">
          {formatDuration(props.durationSec)}
        </span>
      ) : null}
      {props.rating ? (
        <RatingBadge
          rating={props.rating}
          size="sm"
          className="pointer-events-none absolute right-2 top-2 shadow-sm"
        />
      ) : null}
    </>
  );

  /** Only real mice should stop preview on leave — touch ending fires pointerleave too. */
  const handleThumbPointerLeave = (
    e: ReactPointerEvent<HTMLAnchorElement>,
  ) => {
    if (!previewSrc) return;
    if (e.pointerType !== "mouse") return;
    stopPreview();
  };

  return (
    <article
      className="group flex touch-callout-none flex-col gap-2"
      onContextMenu={(e) => e.preventDefault()}
    >
      <Link
        href={`/watch/${props.id}`}
        className={thumbClasses}
        onPointerEnter={previewSrc ? startPreviewAfterDelay : undefined}
        onPointerLeave={previewSrc ? handleThumbPointerLeave : undefined}
        onTouchStart={useTouchPreview ? handleThumbTouchStart : undefined}
        onTouchMove={useTouchPreview ? handleThumbTouchMove : undefined}
        onTouchEnd={useTouchPreview ? handleThumbTouchEnd : undefined}
        onTouchCancel={useTouchPreview ? handleThumbTouchEnd : undefined}
      >
        {thumbnailVisual}
      </Link>
      <div className="flex gap-3">
        <Link
          href={`/c/${props.channel.slug}`}
          className="h-9 w-9 shrink-0 overflow-hidden rounded-full bg-surface-2"
        >
          {props.channel.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={props.channel.avatarUrl}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : null}
        </Link>
        <div className="min-w-0 flex-1">
          <div className="min-w-0">
            <Link
              href={`/watch/${props.id}`}
              className={`min-w-0 w-full text-sm font-semibold leading-snug hover:underline ${titleOverflowClampClass(props.title)}`}
            >
              {props.title}
            </Link>
            <Link
              href={`/c/${props.channel.slug}`}
              className="mt-1 block truncate text-xs text-muted hover:text-accent-blue"
            >
              {props.channel.name}
            </Link>
            <div className="text-xs text-muted">{timeAgo(props.createdAt)}</div>
          </div>
        </div>
      </div>
    </article>
  );
}

// Direct video file extensions the browser can play natively in a
// `<video>` tag. HLS (.m3u8) is intentionally excluded because it
// would need hls.js for non-Safari browsers.
const DIRECT_VIDEO_EXT = /\.(mp4|m4v|webm|ogg|ogv|mov)(\?|#|$)/i;

function getPreviewableSrc(sourceUrl?: string | null): string | null {
  if (!sourceUrl) return null;
  const trimmed = sourceUrl.trim();
  if (!trimmed) return null;
  // Relative paths (e.g. "/uploads/foo.mp4") are fine — just check
  // the extension.
  if (trimmed.startsWith("/") && DIRECT_VIDEO_EXT.test(trimmed)) {
    return trimmed;
  }
  try {
    const u = new URL(trimmed);
    const host = u.hostname.toLowerCase();
    if (
      host.endsWith("youtube.com") ||
      host.endsWith("youtube-nocookie.com") ||
      host === "youtu.be" ||
      host.endsWith("vimeo.com") ||
      host.endsWith("twitch.tv")
    ) {
      return null;
    }
    if (DIRECT_VIDEO_EXT.test(u.pathname)) return trimmed;
    return null;
  } catch {
    return null;
  }
}

function timeAgo(date: Date): string {
  const now = Date.now();
  const diffSec = Math.round((now - new Date(date).getTime()) / 1000);
  const units: [number, string][] = [
    [60, "second"],
    [60, "minute"],
    [24, "hour"],
    [30, "day"],
    [12, "month"],
    [Infinity, "year"],
  ];
  let value = diffSec;
  let unit = "second";
  for (const [factor, name] of units) {
    if (value < factor) {
      unit = name;
      break;
    }
    value = Math.round(value / factor);
    unit = name;
  }
  return `${value} ${unit}${value === 1 ? "" : "s"} ago`;
}
