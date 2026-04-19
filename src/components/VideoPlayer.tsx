type VideoPlayerProps = {
  src: string;
  title?: string;
  className?: string;
  /**
   * Wall-clock moment the broadcast started (from `LiveStream.startedAt`).
   * Forwarded to the embedded player so its live-time readout can show
   * "elapsed since broadcast start" — the HLS manifest alone only exposes the
   * last ~12 s of segments so the player can't derive a true start on its own.
   */
  liveStartedAt?: Date | string | null;
};

/**
 * Embeds the Tesil Video Player via an iframe pointing at the bundled
 * copy in `/public/video-player/embed.html`. Because the player itself
 * is a static, self-contained vanilla-JS app, this is the simplest and
 * most faithful way to use it inside Next.js without rewriting it as a
 * React component.
 */
export function VideoPlayer({
  src,
  title,
  className,
  liveStartedAt,
}: VideoPlayerProps) {
  const startedAtIso =
    liveStartedAt instanceof Date
      ? liveStartedAt.toISOString()
      : typeof liveStartedAt === "string" && liveStartedAt
        ? liveStartedAt
        : null;
  const iframeSrc = startedAtIso
    ? `/video-player/embed.html?src=${encodeURIComponent(src)}&startedAt=${encodeURIComponent(startedAtIso)}`
    : `/video-player/embed.html?src=${encodeURIComponent(src)}`;
  return (
    <div
      className={`relative w-full overflow-hidden rounded-lg bg-black ${
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
