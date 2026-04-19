type VideoPlayerProps = {
  src: string;
  title?: string;
  className?: string;
};

/**
 * Embeds the Tesil Video Player via an iframe pointing at the bundled
 * copy in `/public/video-player/embed.html`. Because the player itself
 * is a static, self-contained vanilla-JS app, this is the simplest and
 * most faithful way to use it inside Next.js without rewriting it as a
 * React component.
 */
export function VideoPlayer({ src, title, className }: VideoPlayerProps) {
  const iframeSrc = `/video-player/embed.html?src=${encodeURIComponent(src)}`;
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
        loading="lazy"
      />
    </div>
  );
}
