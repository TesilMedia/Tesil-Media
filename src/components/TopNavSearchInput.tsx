"use client";

import { useRouter } from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

/** Matches Tailwind `md` default */
const MD_MIN = "(min-width: 768px)";

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

/**
 * Top-nav search.
 *
 *  - md+      : renders an inline form (rounded input + Search submit button on lg+).
 *  - below md : collapsed to a single circular magnifying-glass button. Tapping
 *               it overlays an expanded form across the entire header row with a
 *               back button, auto-focused input, and submit icon.
 */
export function TopNavSearchInput() {
  const router = useRouter();
  const mdUp = useSyncExternalStore(
    subscribeMd,
    getMdSnapshot,
    getServerMdSnapshot,
  );
  const [expanded, setExpanded] = useState(false);
  const mobileInputRef = useRef<HTMLInputElement>(null);
  const expandedFormRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (mdUp && expanded) setExpanded(false);
  }, [mdUp, expanded]);

  useEffect(() => {
    if (expanded && !mdUp) {
      mobileInputRef.current?.focus();
    }
  }, [expanded, mdUp]);

  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExpanded(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expanded]);

  useEffect(() => {
    if (!expanded || mdUp) return;
    const onPointerDown = (e: PointerEvent) => {
      const form = expandedFormRef.current;
      if (!form || form.contains(e.target as Node)) return;
      setExpanded(false);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [expanded, mdUp]);

  if (mdUp) {
    return (
      <form
        action="/search"
        method="GET"
        className="mx-auto flex min-w-0 flex-1 max-w-xl items-center justify-center"
      >
        <input
          type="search"
          name="q"
          placeholder="Search channels and videos…"
          className="h-10 min-w-0 w-full rounded-full border-2 border-border bg-surface px-3 py-1.5 text-base leading-snug text-text outline-none placeholder:text-muted focus:outline-none focus:ring-0 focus:ring-offset-0 sm:px-4 md:h-9 md:text-sm lg:rounded-l-full lg:rounded-r-none"
        />
        <button
          type="submit"
          className="hidden h-10 shrink-0 items-center justify-center rounded-r-full border-2 border-l-0 border-border bg-surface-2 px-3 py-1.5 text-base font-medium leading-snug text-muted transition-colors hover:bg-surface hover:text-text sm:px-4 md:h-9 md:text-sm lg:flex"
        >
          Search
        </button>
      </form>
    );
  }

  return (
    <>
      <div className="ml-auto flex shrink-0 items-center">
        <button
          type="button"
          onClick={() => setExpanded(true)}
          aria-label="Open search"
          aria-expanded={expanded}
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-border bg-surface text-text hover:bg-surface-2"
        >
          <SearchIcon />
        </button>
      </div>

      {expanded ? (
        <form
          ref={expandedFormRef}
          action="/search"
          method="GET"
          className="retro-tricolor-divider-b absolute inset-0 z-50 flex items-center gap-[8px] bg-bg px-[8px] pb-[6px]"
          onSubmit={(e) => {
            e.preventDefault();
            const q = String(
              new FormData(e.currentTarget).get("q") ?? "",
            ).trim();
            setExpanded(false);
            router.push(
              q
                ? `/search?${new URLSearchParams({ q })}`
                : "/search",
            );
          }}
        >
          <button
            type="button"
            aria-label="Close search"
            onClick={() => setExpanded(false)}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-border bg-surface text-text hover:bg-surface-2"
          >
            <BackIcon />
          </button>
          <input
            ref={mobileInputRef}
            type="search"
            name="q"
            placeholder="Search channels and videos…"
            className="h-10 min-w-0 flex-1 rounded-full border-2 border-border bg-surface px-4 py-1.5 text-base leading-snug text-text outline-none placeholder:text-muted focus:outline-none focus:ring-0 focus:ring-offset-0"
          />
          <button
            type="submit"
            aria-label="Submit search"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-border bg-surface-2 text-text hover:bg-surface"
          >
            <SearchIcon />
          </button>
        </form>
      ) : null}
    </>
  );
}

function SearchIcon() {
  return (
    <svg
      className="h-5 w-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.35-4.35" />
    </svg>
  );
}

function BackIcon() {
  return (
    <svg
      className="h-5 w-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M15 6l-6 6 6 6" />
    </svg>
  );
}
