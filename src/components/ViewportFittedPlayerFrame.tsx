"use client";

import {
  useEffect,
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
};

export function ViewportFittedPlayerFrame({
  children,
  className,
}: ViewportFittedPlayerFrameProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<PlayerSize | null>(null);

  useEffect(() => {
    const updateSize = () => {
      const frame = frameRef.current;
      if (!frame) return;

      const rect = frame.getBoundingClientRect();
      const parentWidth = frame.parentElement?.clientWidth ?? rect.width;
      const availableHeight = Math.max(
        0,
        window.innerHeight - rect.top - BOTTOM_VIEWPORT_GAP,
      );
      const width = Math.max(
        0,
        Math.min(parentWidth, availableHeight * PLAYER_ASPECT_RATIO),
      );
      const height = width / PLAYER_ASPECT_RATIO;

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

    const parent = frameRef.current?.parentElement;
    const resizeObserver = new ResizeObserver(updateSize);
    if (parent) resizeObserver.observe(parent);

    window.addEventListener("resize", updateSize);
    window.addEventListener("orientationchange", updateSize);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", updateSize);
      window.removeEventListener("orientationchange", updateSize);
    };
  }, []);

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
    aspectRatio: "16 / 9",
    width: size ? `${size.width}px` : "100%",
    height: size ? `${size.height}px` : undefined,
    maxWidth: "100%",
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
