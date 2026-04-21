"use client";

import { useSyncExternalStore } from "react";

/** Matches Tailwind `md` default */
const MD_MIN = "(min-width: 768px)";

const INPUT_CLASS =
  "h-10 min-w-0 w-full rounded-full border-2 border-border bg-surface px-3 py-1.5 text-base leading-snug text-text outline-none placeholder:text-muted focus:outline-none focus:ring-0 focus:ring-offset-0 sm:px-4 md:h-9 md:text-sm lg:rounded-l-full lg:rounded-r-none";

function subscribeMd(callback: () => void) {
  const mq = window.matchMedia(MD_MIN);
  mq.addEventListener("change", callback);
  return () => mq.removeEventListener("change", callback);
}

function getMdSnapshot() {
  return window.matchMedia(MD_MIN).matches;
}

function getServerMdSnapshot() {
  return false;
}

export function TopNavSearchInput() {
  const mdUp = useSyncExternalStore(
    subscribeMd,
    getMdSnapshot,
    getServerMdSnapshot,
  );
  return (
    <input
      type="search"
      name="q"
      placeholder={
        mdUp ? "Search channels and videos…" : "Search..."
      }
      className={INPUT_CLASS}
    />
  );
}
