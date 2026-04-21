import { THEME_STORAGE_KEY } from "@/lib/theme";

/**
 * Runs before first paint so saved theme / `prefers-color-scheme` apply without a flash.
 * Keep logic aligned with `ThemeToggle`.
 */
export function ThemeInitScript() {
  const js = `
(function(){
  try {
    var key = ${JSON.stringify(THEME_STORAGE_KEY)};
    var stored = localStorage.getItem(key);
    var dark;
    if (stored === "dark") dark = true;
    else if (stored === "light") dark = false;
    else dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.classList.remove("theme-light", "theme-dark");
    document.documentElement.classList.add(dark ? "theme-dark" : "theme-light");
  } catch (e) {}
})();`;

  return <script dangerouslySetInnerHTML={{ __html: js }} />;
}
