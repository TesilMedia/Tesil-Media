"use client";

import Link from "next/link";
import {
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { formatDuration, formatViews } from "@/lib/format";
import { titleOverflowClampClass } from "@/lib/titleClamp";
import { RatingBadge } from "@/components/RatingBadge";
import {
  takePreviewLease,
  releasePreviewLease,
  useTrueHover,
} from "@/lib/previewLease";

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

export function VideoCard(props: VideoCardProps) {
  const previewSrc = getPreviewableSrc(props.sourceUrl);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hoverTimerRef = useRef<number | null>(null);
  const trueHover = useTrueHover();

  const [showPreview, setShowPreview] = useState(false);
  const [previewReady, setPreviewReady] = useState(false);

  const cancelPendingHoverDelay = () => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
  };

  const previewLeaseReleaseRef = useRef<(() => void) | null>(null);
  if (!previewLeaseReleaseRef.current) {
    previewLeaseReleaseRef.current = () => {
      const self = previewLeaseReleaseRef.current;
      if (!self) return;
      releasePreviewLease(self);
      cancelPendingHoverDelay();
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

  const usePointerHover = trueHover === true && Boolean(previewSrc);
  const showMobilePreviewButton = trueHover === false && Boolean(previewSrc);

  useEffect(() => {
    return () => {
      cancelPendingHoverDelay();
      previewLeaseReleaseRef.current?.();
    };
  }, []);

  const startPreviewAfterDelay = () => {
    if (!previewSrc) return;
    cancelPendingHoverDelay();
    hoverTimerRef.current = window.setTimeout(() => {
      takePreviewLease(previewLeaseReleaseRef.current!);
      setShowPreview(true);
    }, HOVER_DELAY_MS);
  };

  const startPreviewImmediately = () => {
    if (!previewSrc) return;
    cancelPendingHoverDelay();
    takePreviewLease(previewLeaseReleaseRef.current!);
    setShowPreview(true);
  };

  const stopPreview = () => {
    previewLeaseReleaseRef.current?.();
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

  const timeRel = timeAgoValue(props.createdAt);

  const thumbClasses =
    "relative block aspect-video touch-manipulation touch-callout-none overflow-hidden rounded-lg bg-surface shadow-card";

  const thumbMetaPill =
    "shrink-0 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-medium tabular-nums text-cream";

  const handleMobilePreviewButtonClick = (e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (showPreview) stopPreview();
    else startPreviewImmediately();
  };

  const thumbnailVisual = (
    <>
      {showMobilePreviewButton ? (
        <button
          type="button"
          onClick={handleMobilePreviewButtonClick}
          className="absolute left-2 top-2 z-20 touch-manipulation rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-medium text-cream ring-offset-2 hover:bg-black/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue"
          aria-pressed={showPreview}
        >
          {showPreview ? "Stop" : "Preview"}
        </button>
      ) : null}
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
      <div className="pointer-events-none absolute bottom-2 left-2 flex max-w-[calc(100%-1rem)] items-center justify-start gap-1.5">
        {props.durationSec ? (
          <span className={thumbMetaPill}>{formatDuration(props.durationSec)}</span>
        ) : null}
        <span className={thumbMetaPill} title={timeAgoTitle(timeRel)}>
          {formatTimeAgoShort(timeRel)}
        </span>
        <span className={thumbMetaPill}>
          {formatViews(props.views)} {props.views === 1 ? "View" : "Views"}
        </span>
      </div>
      {props.rating ? (
        <RatingBadge
          rating={props.rating}
          size="sm"
          className="pointer-events-none absolute right-2 top-2 shadow-sm"
        />
      ) : null}
    </>
  );

  const handleThumbPointerEnter = (e: ReactPointerEvent<HTMLAnchorElement>) => {
    if (!previewSrc) return;
    if (e.pointerType === "touch") return;
    startPreviewAfterDelay();
  };

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
        onPointerEnter={usePointerHover ? handleThumbPointerEnter : undefined}
        onPointerLeave={usePointerHover ? handleThumbPointerLeave : undefined}
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

const TIME_AGO_UNITS: [number, string][] = [
  [60, "s"],
  [60, "m"],
  [24, "h"],
  [30, "d"],
  [12, "mo"],
  [Infinity, "y"],
];

type TimeAgoRel = { value: number; abbr: string };

function timeAgoValue(date: Date): TimeAgoRel {
  const now = Date.now();
  const diffSec = Math.round((now - new Date(date).getTime()) / 1000);
  let value = diffSec;
  let abbr = "s";
  for (const [factor, name] of TIME_AGO_UNITS) {
    if (value < factor) {
      abbr = name;
      break;
    }
    value = Math.round(value / factor);
    abbr = name;
  }
  return { value, abbr };
}

function formatTimeAgoShort(rel: TimeAgoRel): string {
  return `${rel.value}${rel.abbr} ago`;
}

function timeAgoTitle(rel: TimeAgoRel): string {
  const { value, abbr } = rel;
  const full: Record<string, [string, string]> = {
    s: ["second", "seconds"],
    m: ["minute", "minutes"],
    h: ["hour", "hours"],
    d: ["day", "days"],
    mo: ["month", "months"],
    y: ["year", "years"],
  };
  const [one, many] = full[abbr] ?? ["", ""];
  const label = value === 1 ? one : many;
  return `${value} ${label} ago`;
}
