/** Stored in localStorage when the user picks a theme explicitly. */
export const THEME_STORAGE_KEY = "tesil-theme";

/** `postMessage` type so `/public/video-player/theme-init.js` can stay in sync. */
export const THEME_BROADCAST_MESSAGE_TYPE = "tesil-theme";

export type StoredTheme = "light" | "dark";

const BACKDROP_CHROME_SELECTORS = "#app-top-nav, #main-sidebar";

/**
 * iOS Safari (WebKit) often leaves `backdrop-filter` + alpha backgrounds stuck
 * when only `:root` custom properties change. A tiny compositor nudge on the
 * affected surfaces makes them pick up the new --color-bg without a full reload.
 */
function nudgeThemeBackdropSurfaces(): void {
  const run = () => {
    void document.documentElement.getBoundingClientRect();
    for (const el of document.querySelectorAll<HTMLElement>(
      BACKDROP_CHROME_SELECTORS,
    )) {
      const t = el.style.transform;
      el.style.transform = "translateZ(0)";
      void el.getBoundingClientRect();
      if (t) {
        el.style.setProperty("transform", t);
      } else {
        el.style.removeProperty("transform");
      }
    }
  };
  // Double rAF: let the engine apply the new theme class on <html> first.
  requestAnimationFrame(() => {
    requestAnimationFrame(run);
  });
}

/**
 * Update `theme-light` / `theme-dark` on `<html>`. Use from client code after
 * `ThemeInitScript` has run on first load.
 */
export function setThemeOnDocument(next: StoredTheme): void {
  const root = document.documentElement;
  root.classList.remove("theme-light", "theme-dark");
  root.classList.add(next === "dark" ? "theme-dark" : "theme-light");
  nudgeThemeBackdropSurfaces();
}
