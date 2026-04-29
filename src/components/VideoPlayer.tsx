import { ViewportFittedPlayerFrame } from "@/components/ViewportFittedPlayerFrame";

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
  /** Hides the LIVE pill. Used for pre-stream players where the HLS source is live but the broadcast hasn't started. */
  hideLivePill?: boolean;
  /** Hides the entire time-group (timestamp + frame-step buttons). Used for pre-stream players. */
  hideTimeGroup?: boolean;
};

const PLAYER_ASSET_VERSION = "llhls-chrome-status-20260428";

/**
 * Embeds the Tesil Video Player via an iframe pointing at the bundled
 * copy in `/public/video-player/embed.html`. Because the player itself
 * is a static, self-contained vanilla-JS app, this is the simplest and
 * most faithful way to use it inside Next.js without rewriting it as a
 * React component.
 */
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
  hideLivePill,
  hideTimeGroup,
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
      ? `/video-player/embed.html?v=${PLAYER_ASSET_VERSION}&src=${encodeURIComponent(src)}&startedAt=${encodeURIComponent(
          startedAtIso,
        )}${vidQ}`
      : `/video-player/embed.html?v=${PLAYER_ASSET_VERSION}&src=${encodeURIComponent(src)}${vidQ}`;
  const extraParams = [
    disableSeek ? "disableSeek=1" : "",
    hideLivePill ? "hideLivePill=1" : "",
    hideTimeGroup ? "hideTimeGroup=1" : "",
  ]
    .filter(Boolean)
    .join("&");
  const iframeSrc = `${base}&autoplay=1${extraParams ? `&${extraParams}` : ""}`;
  return (
    <ViewportFittedPlayerFrame className={className}>
      <iframe
        title={title ?? "Tesil Video Player"}
        src={iframeSrc}
        className="absolute inset-0 h-full w-full border-0"
        allow="fullscreen; picture-in-picture; autoplay"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
        loading="eager"
      />
    </ViewportFittedPlayerFrame>
  );
}
