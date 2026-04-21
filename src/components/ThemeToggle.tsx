"use client";

import { useEffect, useLayoutEffect, useState } from "react";

import { THEME_STORAGE_KEY, type StoredTheme } from "@/lib/theme";

export function ThemeToggle() {
  const [mode, setMode] = useState<"light" | "dark">("light");

  useLayoutEffect(() => {
    setMode(
      document.documentElement.classList.contains("theme-dark")
        ? "dark"
        : "light",
    );
  }, []);

  useEffect(() => {
    function syncFromOtherTab(e: StorageEvent) {
      if (e.key !== THEME_STORAGE_KEY || !e.newValue) return;
      const next = e.newValue === "dark" ? "dark" : "light";
      document.documentElement.classList.remove("theme-light", "theme-dark");
      document.documentElement.classList.add(
        next === "dark" ? "theme-dark" : "theme-light",
      );
      setMode(next);
    }
    window.addEventListener("storage", syncFromOtherTab);
    return () => window.removeEventListener("storage", syncFromOtherTab);
  }, []);

  function applyTheme(next: StoredTheme) {
    document.documentElement.classList.remove("theme-light", "theme-dark");
    document.documentElement.classList.add(
      next === "dark" ? "theme-dark" : "theme-light",
    );
    localStorage.setItem(THEME_STORAGE_KEY, next);
    setMode(next);
  }

  function toggle() {
    const next: StoredTheme =
      document.documentElement.classList.contains("theme-dark")
        ? "light"
        : "dark";
    applyTheme(next);
  }

  const isDark = mode === "dark";
  const label = isDark ? "Switch to light theme" : "Switch to dark theme";

  return (
    <button
      type="button"
      onClick={toggle}
      className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-border bg-surface text-text hover:bg-surface-2 md:h-9 md:w-9"
      aria-label={label}
      title={label}
    >
      {isDark ? <SunIcon aria-hidden /> : <MoonIcon aria-hidden />}
    </button>
  );
}

function SunIcon({ "aria-hidden": ah }: { "aria-hidden"?: boolean }) {
  return (
    <svg
      className="h-5 w-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={ah}
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

function MoonIcon({ "aria-hidden": ah }: { "aria-hidden"?: boolean }) {
  return (
    <svg
      className="h-5 w-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={ah}
    >
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}
