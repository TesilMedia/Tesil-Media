/**
 * Applies `.theme-light` / `.theme-dark` on `<html>` for the standalone player.
 * Logic mirrors `src/components/ThemeInitScript.tsx` and `THEME_STORAGE_KEY` in `src/lib/theme.ts`.
 * `postMessage` type must match `THEME_BROADCAST_MESSAGE_TYPE` in `src/lib/theme.ts`.
 */
(function () {
  var STORAGE_KEY = "tesil-theme";
  var BROADCAST_TYPE = "tesil-theme";

  function prefersDark() {
    return (
      window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: dark)").matches
    );
  }

  function resolveDark() {
    try {
      var stored = localStorage.getItem(STORAGE_KEY);
      if (stored === "dark") return true;
      if (stored === "light") return false;
    } catch (e) {
      /* ignore */
    }
    return prefersDark();
  }

  function apply(dark) {
    var root = document.documentElement;
    root.classList.remove("theme-light", "theme-dark");
    root.classList.add(dark ? "theme-dark" : "theme-light");
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", dark ? "#455154" : "#d4d0c9");
  }

  apply(resolveDark());

  window.addEventListener("storage", function (e) {
    if (e.key !== STORAGE_KEY) return;
    if (e.newValue === "dark") apply(true);
    else if (e.newValue === "light") apply(false);
    else apply(resolveDark());
  });

  window.addEventListener("message", function (e) {
    if (e.origin !== window.location.origin) return;
    var d = e.data;
    if (!d || d.type !== BROADCAST_TYPE) return;
    if (d.theme === "dark") apply(true);
    else if (d.theme === "light") apply(false);
  });
})();
