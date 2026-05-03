"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

const PLAYER_ASPECT_RATIO = 16 / 9;
const BOTTOM_VIEWPORT_GAP = 8;

type PlayerSize = {
  width: number;
  height: number;
};

type ViewportFittedPlayerFrameProps = {
  children: ReactNode;
  className?: string;
  /**
   * Extra pixels subtracted from available viewport height when fitting the
   * player (e.g. keep title / channel / actions visible without scrolling).
   */
  bottomInset?: number;
};

export function ViewportFittedPlayerFrame({
  children,
  className,
  bottomInset = 0,
}: ViewportFittedPlayerFrameProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<PlayerSize | null>(null);

  useLayoutEffect(() => {
    const updateSize = () => {
      const frame = frameRef.current;
      if (!frame) return;

      const rect = frame.getBoundingClientRect();
      const parentWidth = frame.parentElement?.clientWidth ?? rect.width;
      /* Avoid a width jump: first layout pass can report 0 before flex resolves. */
      if (parentWidth < 2) return;

      const availableHeight = Math.max(
        0,
        window.innerHeight -
          rect.top -
          BOTTOM_VIEWPORT_GAP -
          bottomInset,
      );
      /*
       * Fill the parent's width so side-by-side layouts (live player + chat)
       * never show empty horizontal gutter: the old min(parent, height×AR) rule
       * capped width by viewport height (especially with bottomInset), which
       * looked correct on first paint (width 100%) then "snapped" narrower after
       * layout measured—pillarboxing beside the video instead of beside the chat.
       *
       * Keep the frame full-width; when the natural 16:9 height exceeds what fits
       * below the fold, cap height and letterbox vertically (video uses object-contain).
       */
      const width = Math.max(0, parentWidth);
      const heightNatural = width / PLAYER_ASPECT_RATIO;
      const height = Math.max(
        0,
        Math.min(heightNatural, availableHeight),
      );

      setSize((current) => {
        if (
          current &&
          Math.abs(current.width - width) < 1 &&
          Math.abs(current.height - height) < 1
        ) {
          return current;
        }

        return { width, height };
      });
    };

    updateSize();
    const rafId = requestAnimationFrame(() => updateSize());

    const parent = frameRef.current?.parentElement;
    const resizeObserver = new ResizeObserver(updateSize);
    if (parent) resizeObserver.observe(parent);

    window.addEventListener("resize", updateSize);
    window.addEventListener("orientationchange", updateSize);

    return () => {
      cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      window.removeEventListener("resize", updateSize);
      window.removeEventListener("orientationchange", updateSize);
    };
  }, [bottomInset]);

  /**
   * The player runs in an iframe; taps on the host page never reach the iframe
   * document. On coarse pointers, tell the embed to hide its HUD immediately.
   */
  useEffect(() => {
    const coarse =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(pointer: coarse)").matches;
    if (!coarse) return;

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      const frame = frameRef.current;
      if (!frame) return;
      const t = e.target;
      if (!(t instanceof Node) || frame.contains(t)) return;
      const iframe = frame.querySelector("iframe");
      const w = iframe?.contentWindow;
      if (!w) return;
      try {
        w.postMessage(
          { type: "tesil-embed-dismiss-chrome" },
          window.location.origin,
        );
      } catch {
        /* noop */
      }
    };

    window.addEventListener("pointerdown", onPointerDown, true);
    return () => window.removeEventListener("pointerdown", onPointerDown, true);
  }, []);

  const frameStyle: CSSProperties = {
    maxWidth: "100%",
    ...(size
      ? { width: `${size.width}px`, height: `${size.height}px` }
      : { width: "100%", aspectRatio: "16 / 9" }),
  };

  return (
    <div
      ref={frameRef}
      className={`relative w-full overflow-hidden rounded-lg bg-black ${
        className ?? ""
      }`}
      style={frameStyle}
    >
      {children}
    </div>
  );
}
