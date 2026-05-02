"use client";

import Link from "next/link";
import {
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { formatViews } from "@/lib/format";
import { titleOverflowClampClass } from "@/lib/titleClamp";
import { RatingBadge } from "@/components/RatingBadge";
import { useTrueHover } from "@/lib/previewLease";

type LiveCardProps = {
  channelSlug: string;
  channelName: string;
  channelAvatar: string | null;
  title: string;
  thumbnail: string | null;
  viewers: number;
  rating?: string | null;
  isLive: boolean;
  // Stream URL — direct video files (MP4/WebM) and HLS (.m3u8) are previewed
  // natively; embed-only sources like YouTube/Twitch fall back to the thumbnail.
  streamUrl?: string | null;
};

const HOVER_DELAY_MS = 400;

// Direct video files + HLS for live streams. HLS plays natively in Safari;
// other browsers fail gracefully and fall back to the static thumbnail.
const LIVE_PREVIEW_EXT = /\.(mp4|m4v|webm|ogg|ogv|mov|m3u8)(\?|#|$)/i;

function getPreviewableLiveSrc(streamUrl?: string | null): string | null {
  if (!streamUrl) return null;
  const trimmed = streamUrl.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("/") && LIVE_PREVIEW_EXT.test(trimmed)) return trimmed;
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
    if (LIVE_PREVIEW_EXT.test(u.pathname)) return trimmed;
    return null;
  } catch {
    return null;
  }
}

export function LiveCard(props: LiveCardProps) {
  const previewSrc = getPreviewableLiveSrc(props.streamUrl);
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

  /** Local teardown only — live previews do not use the global one-at-a-time lease (see VideoCard). */
  const stopPreviewRef = useRef<(() => void) | null>(null);
  if (!stopPreviewRef.current) {
    stopPreviewRef.current = () => {
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
    if (props.isLive && previewSrc) {
      startPreviewImmediately();
    }
    return () => {
      cancelPendingHoverDelay();
      stopPreviewRef.current?.();
    };
  }, [props.isLive, previewSrc]);

  const startPreviewAfterDelay = () => {
    if (!previewSrc) return;
    cancelPendingHoverDelay();
    hoverTimerRef.current = window.setTimeout(() => {
      setShowPreview(true);
    }, HOVER_DELAY_MS);
  };

  const startPreviewImmediately = () => {
    if (!previewSrc) return;
    cancelPendingHoverDelay();
    setShowPreview(true);
  };

  const stopPreview = () => {
    stopPreviewRef.current?.();
  };

  const tryPlayPreview = () => {
    const v = videoRef.current;
    if (!v) return;
    const play = v.play();
    if (play && typeof play.catch === "function") {
      play.catch(() => setShowPreview(false));
    }
    setPreviewReady(true);
  };

  const handleMobilePreviewButtonClick = (e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (showPreview) stopPreview();
    else startPreviewImmediately();
  };

  const handleThumbPointerEnter = (e: ReactPointerEvent<HTMLAnchorElement>) => {
    if (!previewSrc || props.isLive) return;
    if (e.pointerType === "touch") return;
    startPreviewAfterDelay();
  };

  const handleThumbPointerLeave = (e: ReactPointerEvent<HTMLAnchorElement>) => {
    if (!previewSrc || props.isLive) return;
    if (e.pointerType !== "mouse") return;
    stopPreview();
  };

  return (
    <article className="group flex flex-col gap-2">
      <Link
        href={`/live/${props.channelSlug}`}
        className="relative block aspect-video touch-manipulation overflow-hidden rounded-lg bg-surface shadow-card"
        onPointerEnter={usePointerHover ? handleThumbPointerEnter : undefined}
        onPointerLeave={usePointerHover ? handleThumbPointerLeave : undefined}
      >
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
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted">
            Live
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
            onCanPlay={tryPlayPreview}
            onLoadedData={tryPlayPreview}
            onError={() => setShowPreview(false)}
            className={`pointer-events-none absolute inset-0 h-full w-full object-cover transition-opacity duration-200 ${
              previewReady ? "opacity-100" : "opacity-0"
            }`}
            aria-hidden="true"
            tabIndex={-1}
          />
        ) : null}
        <span className="absolute left-2 top-2 z-10 flex items-center gap-1 rounded-sm bg-live px-2 py-0.5 font-display text-[11px] uppercase tracking-[0.15em] text-cream">
          <span className="live-pulse inline-block h-1.5 w-1.5 rounded-full bg-cream" />
          Live
        </span>
        <span className="absolute bottom-2 left-2 z-10 rounded-sm bg-black/75 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-cream">
          {formatViews(props.viewers)} watching
        </span>
        {props.rating ? (
          <RatingBadge
            rating={props.rating}
            size="sm"
            className="absolute right-2 top-2 z-10 shadow-sm"
          />
        ) : null}
      </Link>
      <div className="flex gap-3">
        <Link
          href={`/c/${props.channelSlug}`}
          className="h-9 w-9 shrink-0 overflow-hidden rounded-full bg-surface-2"
        >
          {props.channelAvatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={props.channelAvatar}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : null}
        </Link>
        <div className="min-w-0 flex-1">
          <div className="min-w-0">
            <Link
              href={`/live/${props.channelSlug}`}
              className={`min-w-0 w-full text-sm font-semibold leading-snug hover:underline ${titleOverflowClampClass(props.title)}`}
            >
              {props.title}
            </Link>
            <Link
              href={`/c/${props.channelSlug}`}
              className="mt-1 block truncate text-xs text-muted hover:text-accent-blue"
            >
              {props.channelName}
            </Link>
          </div>
        </div>
      </div>
    </article>
  );
}
