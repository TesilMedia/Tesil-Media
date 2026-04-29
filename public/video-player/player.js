(function () {
  const player = document.getElementById("player");
  const useNativeDropdowns = (function () {
    try {
      if (window.matchMedia("(hover: none) and (pointer: coarse)").matches) {
        return true;
      }
      if (window.matchMedia("(max-width: 640px)").matches) {
        return true;
      }
    } catch (_) {
      /* matchMedia may be unavailable in odd embeds */
    }
    return false;
  })();
  if (useNativeDropdowns && player) {
    player.classList.add("player--native-dropdowns");
  }
  const video = document.getElementById("video");
  const playPause = document.getElementById("playPause");
  const progress = document.getElementById("progress");
  const timeDisplay = document.getElementById("timeDisplay");
  const timeGroup = document.getElementById("timeGroup");
  const muteBtn = document.getElementById("mute");
  const volumeSlider = document.getElementById("volume");
  const pipBtn = document.getElementById("pip");
  const fullscreenBtn = document.getElementById("fullscreen");
  const fileInput = document.getElementById("fileInput");
  const fileNameEl = document.getElementById("fileName");
  const previewVideo = document.getElementById("previewVideo");
  const scrubPreview = document.getElementById("scrubPreview");
  const previewCanvas = document.getElementById("previewCanvas");
  const previewTimeEl = document.getElementById("previewTime");
  const progressWrap = progress.closest(".player__progress-wrap");
  const videoViewport = document.getElementById("videoViewport");
  const zoomLayer = document.getElementById("zoomLayer");
  const zoomInBtn = document.getElementById("zoomIn");
  const zoomOutBtn = document.getElementById("zoomOut");
  const zoomResetBtn = document.getElementById("zoomReset");
  const zoomGroup = document.getElementById("zoomGroup");
  const zoomLabel = document.getElementById("zoomLabel");
  const playbackRateTrigger = document.getElementById("playbackRateTrigger");
  const playbackRateLabel = document.getElementById("playbackRateLabel");
  const playbackRatePanel = document.getElementById("playbackRatePanel");
  const playbackRateDropdown = document.getElementById("playbackRateDropdown");
  const rateDownBtn = document.getElementById("rateDown");
  const rateUpBtn = document.getElementById("rateUp");
  const tooltipLayer = document.getElementById("tooltipLayer");
  /** Set when `#tooltipLayer` is wired; used by custom dropdowns to dismiss the label. */
  let hidePlayerTooltip = function () {};
  const frameBackBtn = document.getElementById("frameBack");
  const frameForwardBtn = document.getElementById("frameForward");
  const goLiveBtn = document.getElementById("goLive");
  const qualityWrap = document.getElementById("qualityWrap");
  const qualityTrigger = document.getElementById("qualityTrigger");
  const qualityLabel = document.getElementById("qualityLabel");
  const qualityPanel = document.getElementById("qualityPanel");
  const qualityDropdown = document.getElementById("qualityDropdown");
  const playbackRateNative = document.getElementById("playbackRateNative");
  const qualitySelectNative = document.getElementById("qualitySelectNative");
  const hlsStatusEl = document.getElementById("hlsStatus");
  if (useNativeDropdowns) {
    if (playbackRateTrigger) {
      playbackRateTrigger.setAttribute("aria-hidden", "true");
      playbackRateTrigger.setAttribute("tabindex", "-1");
    }
    if (qualityTrigger) {
      qualityTrigger.setAttribute("aria-hidden", "true");
      qualityTrigger.setAttribute("tabindex", "-1");
    }
  }
  const ratePill = player && player.querySelector
    ? player.querySelector(".player__rate")
    : null;
  const chromeEl = player.querySelector(".player__chrome");
  const cornerTools = player.querySelector(".player__corner-tools");
  const cornerVolume = player.querySelector(".player__corner-volume");
  const ytMount = document.getElementById("ytMount");
  const urlInput = document.getElementById("urlInput");
  const loadUrlBtn = document.getElementById("loadUrlBtn");
  const pageShell = document.querySelector(".page");

  const startupQuery = (() => {
    try {
      return new URLSearchParams(window.location.search || "");
    } catch (_) {
      return new URLSearchParams();
    }
  })();
  const embedModeRequested = ["1", "true", "yes"].includes(
    String(startupQuery.get("embed") || "").toLowerCase()
  );
  const startupSourceFromQuery = String(startupQuery.get("src") || "").trim();
  /**
   * Wall-clock moment the broadcast started, supplied by the host page (see
   * `VideoPlayer.tsx`). The HLS manifest only exposes the last few segments,
   * so without this value the player has no way to compute "time since the
   * broadcast began" — each browser picks a different effective zero, which is
   * why Chrome was showing 0 while Firefox/Safari showed the ffmpeg start
   * wall-clock. Prefer this value when present; fall back to the oldest PDT
   * fragment in the playlist otherwise.
   */
  const startupStartedAtMs = (() => {
    const raw = String(startupQuery.get("startedAt") || "").trim();
    if (!raw) return null;
    const t = Date.parse(raw);
    return Number.isFinite(t) && t > 0 ? t : null;
  })();
  const startupAutoplay = ["1", "true", "yes"].includes(
    String(startupQuery.get("autoplay") || "").toLowerCase()
  );
  const startupVideoId = String(startupQuery.get("vid") || "").trim();
  /**
   * Thumbnail / host UI loads the embed with no `src=`, then passes a `File` via
   * `postMessage` (object URLs in `?src=` do not work across documents for blob:).
   */
  const startupHostBridge = ["1", "true", "yes"].includes(
    String(startupQuery.get("hostBridge") || "").toLowerCase()
  );
  const startupDisableSeek = startupQuery.get("disableSeek") === "1";
  const startupHideLivePill = startupQuery.get("hideLivePill") === "1";
  const startupHideTimeGroup = startupQuery.get("hideTimeGroup") === "1";

  if (startupHideTimeGroup) {
    if (timeGroup instanceof HTMLElement) timeGroup.hidden = true;
  }

  if (startupDisableSeek) {
    if (progressWrap instanceof HTMLElement) progressWrap.hidden = true;
    if (progress instanceof HTMLInputElement) {
      progress.disabled = true;
      progress.tabIndex = -1;
    }
    if (frameBackBtn instanceof HTMLElement) frameBackBtn.hidden = true;
    if (frameForwardBtn instanceof HTMLElement) frameForwardBtn.hidden = true;
    if (goLiveBtn instanceof HTMLElement) goLiveBtn.hidden = true;
  }

  if (startupHideLivePill) {
    if (goLiveBtn instanceof HTMLElement) goLiveBtn.hidden = true;
  }

  /**
   * When false (typical phones / touch-first tablets), we do not mute+retry on
   * failed `play()` — mobile autoplay policies reject audible playback anyway,
   * and forcing mute felt like the app was silencing the user. Desktop keeps
   * mute fallback so autoplay can still start without a tap.
   */
  function autoplayMuteFallbackOk() {
    try {
      if (window.matchMedia("(pointer: coarse)").matches) return false;
      if (window.matchMedia("(hover: none)").matches) return false;
    } catch (_) {
      /* matchMedia unavailable */
    }
    return true;
  }

  function applyEmbedMode() {
    if (!embedModeRequested) return;
    if (pageShell instanceof HTMLElement) pageShell.classList.add("page--embed");
    if (document.body instanceof HTMLElement) {
      document.body.classList.add("page--embed-host");
    }
  }

  const PREVIEW_W = 160;
  const PREVIEW_H = 90;

  let blobUrl = null;
  /** True after a user-chosen file, OS file launch, or drop (not the built-in sample). */
  let hasCustomSource = false;
  /** `native` = `<video>`; other values use an iframe embed and hide custom chrome. */
  let sourceKind = "native";
  /** Active hls.js instance, when streaming an m3u8 via MSE. Null otherwise. */
  let hlsInstance = null;
  /**
   * True while the active URL is `.m3u8` (sliding-window / live-style). Used before metadata
   * so we still treat the session as live for autoplay + snap-to-edge (Safari native HLS).
   */
  let expectsLiveHlsPlayback = false;

  function detachHlsInstance() {
    if (!hlsInstance) return;
    try {
      hlsInstance.destroy();
    } catch (_) {
      /* noop */
    }
    hlsInstance = null;
  }

  function isHlsUrl(urlStr) {
    if (!urlStr) return false;
    try {
      const u = new URL(urlStr, window.location.href);
      return /\.m3u8(?:$|\?)/i.test(u.pathname + u.search);
    } catch (_) {
      return /\.m3u8(?:$|\?)/i.test(String(urlStr));
    }
  }

  function isLiveDuration() {
    return video.duration === Infinity;
  }

  function isExternalEmbedSource() {
    return sourceKind !== "native";
  }

  /**
   * How close to the playlist live edge we must be before the LIVE badge lights up.
   * Low-latency HLS hovers ~2–3 s behind the edge even under ideal conditions; pad a
   * little past that so normal playback reads as "at live" without flicker.
   */
  const LIVE_EDGE_AT_TOLERANCE_SEC = 5;

  function getSeekableEndTime() {
    try {
      const seekable = video.seekable;
      if (seekable && seekable.length > 0) {
        const end = seekable.end(seekable.length - 1);
        if (Number.isFinite(end) && end > 0) return end;
      }
    } catch (_) {
      /* seekable can throw before metadata arrives */
    }
    return null;
  }

  /** Earliest seekable position (seekable.start(0)). Non-zero for long-running live streams. */
  function getSeekableStartTime() {
    try {
      const seekable = video.seekable;
      if (seekable && seekable.length > 0) {
        const start = seekable.start(0);
        if (Number.isFinite(start) && start >= 0) return start;
      }
    } catch (_) {}
    return null;
  }

  /**
   * Finite duration for progress/scrub calculations. For live streams
   * `video.duration` is Infinity; fall back to the seekable end so the scrub
   * bar, frame-step, and preview all work within the available buffer window.
   */
  function getEffectiveDuration() {
    const dur = video.duration;
    if (Number.isFinite(dur) && dur > 0) return dur;
    if (isLiveStream()) {
      const end = getSeekableEndTime();
      if (end != null) return end;
    }
    return null;
  }

  /**
   * Broadcast elapsed ms at a given video.currentTime position.
   * Uses wall-clock (Date.now - startedAt) offset by the viewer's distance
   * from the live edge, so the counter is accurate even when scrubbed back.
   */
  function getElapsedMsAtVideoTime(t) {
    if (startupStartedAtMs == null) return null;
    const seekableEnd = getSeekableEndTime();
    const offset = seekableEnd != null ? (t - seekableEnd) * 1000 : 0;
    return Math.max(0, Date.now() - startupStartedAtMs + offset);
  }

  /** hls.js suggested sync point (often a few seconds behind the true buffer edge). */
  function getHlsLiveSyncTime() {
    if (!hlsInstance) return null;
    const sync = hlsInstance.liveSyncPosition;
    if (Number.isFinite(sync) && sync > 0) return sync;
    return null;
  }

  /**
   * Target time for "go live" / initial snap: never rewind vs current playback.
   * With hls.js, prefer its live sync point; seeking to the raw seekable edge can
   * land past the freshest complete part/fragment and stall low-latency HLS.
   */
  function getJumpToLiveTargetTime() {
    if (!isLiveStream()) return null;
    const cur = video.currentTime;
    const sync = getHlsLiveSyncTime();
    if (sync != null) return Math.max(cur, sync);
    const end = getSeekableEndTime();
    if (end == null) return null;
    return Math.max(cur, end);
  }

  /** Reference "live edge" for UI proximity (seekable end when known, else hls sync). */
  function getLiveEdgeTime() {
    const end = getSeekableEndTime();
    if (end != null) return end;
    return getHlsLiveSyncTime();
  }

  /**
   * Wall-clock milliseconds for the frame currently on screen, derived from the
   * HLS EXT-X-PROGRAM-DATE-TIME tag. This is what lets the displayed timestamp
   * track OBS itself rather than "seconds since the live window started" (which
   * differs by browser, by reload, and by localhost-vs-server). Returns `null`
   * when PDT isn't available yet so callers can fall back to relative time.
   */
  function getProgramDateTimeMs() {
    if (hlsInstance) {
      const d = hlsInstance.playingDate;
      if (d instanceof Date) {
        const t = d.getTime();
        if (Number.isFinite(t) && t > 0) return t;
      }
    }
    // Safari native HLS exposes PDT via `<video>.getStartDate()`: the Date at
    // `currentTime === 0`. Adding `currentTime` gives the live wall-clock.
    if (typeof video.getStartDate === "function") {
      try {
        const start = video.getStartDate();
        if (start instanceof Date) {
          const startMs = start.getTime();
          if (Number.isFinite(startMs) && startMs > 0) {
            return startMs + video.currentTime * 1000;
          }
        }
      } catch (_) {
        /* getStartDate can throw before metadata / on non-live sources */
      }
    }
    return null;
  }

  function getLiveEdgeWallClockMs() {
    const wallMs = getProgramDateTimeMs();
    if (wallMs == null) return null;
    const edge = getLiveEdgeTime();
    if (edge == null) return wallMs;
    return wallMs + Math.max(0, edge - video.currentTime) * 1000;
  }

  /**
   * Returns ms elapsed since the broadcast started, for the frame currently
   * on screen. Based on the host-supplied `startedAt` query param (what OBS /
   * our DB know); otherwise the manifest's oldest PDT (which is only the last
   * few seconds of the sliding window and will undercount long streams).
   */
  function getLiveElapsedMs() {
    const wallMs = getProgramDateTimeMs();
    if (wallMs == null) return null;
    const startMs = startupStartedAtMs;
    if (startMs == null) return null;
    return Math.max(0, wallMs - startMs);
  }

  function getLiveDurationMs() {
    const edgeMs = getLiveEdgeWallClockMs();
    if (edgeMs == null) return null;
    const startMs = startupStartedAtMs;
    if (startMs == null) return null;
    return Math.max(0, edgeMs - startMs);
  }

  function isLiveStream() {
    if (hlsInstance) return true;
    if (expectsLiveHlsPlayback) return true;
    return isLiveDuration();
  }

  function describeMediaError() {
    const err = video.error;
    if (!err) return null;
    const labels = {
      1: "aborted",
      2: "network",
      3: "decode",
      4: "unsupported source",
    };
    return labels[err.code] || `code ${err.code}`;
  }

  function setHlsStatus(message) {
    if (!(hlsStatusEl instanceof HTMLElement)) return;
    hlsStatusEl.textContent = message;
    hlsStatusEl.hidden = false;
    try {
      console.info("[tesil-player]", message, {
        currentTime: video.currentTime,
        muted: video.muted,
        paused: video.paused,
        readyState: video.readyState,
        networkState: video.networkState,
        mediaError: describeMediaError(),
      });
    } catch (_) {
      /* console can be unavailable in embedded contexts */
    }
  }

  function clearHlsStatus() {
    if (!(hlsStatusEl instanceof HTMLElement)) return;
    hlsStatusEl.hidden = true;
    hlsStatusEl.textContent = "";
  }

  if (hlsStatusEl instanceof HTMLButtonElement) {
    hlsStatusEl.addEventListener("click", () => {
      liveUserWantsPlaying = true;
      requestInitialLiveSeek();
      seekToLiveEdge();
      attemptPlayWithAutoplayMuteFallback({ live: true });
    });
  }

  /**
   * Autoplay policies across browsers are inconsistent: Chrome refuses audible
   * autoplay without a user gesture, Safari is more lenient when the tab is
   * visible, Firefox varies by profile. Desktop/tablet-with-mouse: retry once
   * muted on rejection so playback can start. Touch-primary viewports: skip
   * that for VOD so we do not surprise-mute uploads; live HLS still passes
   * `{ live: true }` so streams can start muted when the OS requires it.
   */
  /**
   * @param {{ live?: boolean }} [opts] Pass `{ live: true }` for HLS/live so
   * mobile can still start the stream muted when the OS blocks audible autoplay.
   */
  function attemptPlayWithAutoplayMuteFallback(opts) {
    const allowMuteRetry =
      opts && opts.live === true ? true : autoplayMuteFallbackOk();
    if (opts && opts.live === true && startupAutoplay && !liveHasEverPlayed && !video.muted) {
      video.muted = true;
      setMutedUI();
    }
    const p = video.play();
    if (p && typeof p.catch === "function") {
      p.catch((err) => {
        // AbortError: play() was interrupted by a concurrent seek or load reset
        // (common on Chrome when hls.js calls startLoad(-1) at the same time).
        // Silently ignore — BUFFER_APPENDED will re-enter tryPlayLiveMedia once
        // the new fragment arrives and retry the play call.
        if (err && err.name === "AbortError") {
          setHlsStatus("Live stream is buffering. Click to retry playback.");
          return;
        }
        if (!allowMuteRetry) {
          setHlsStatus(`Playback blocked: ${err && err.name ? err.name : "unknown"}. Click to start.`);
          return;
        }
        if (!video.muted) {
          video.muted = true;
          setMutedUI();
          const r = video.play();
          if (r && typeof r.catch === "function") {
            r.catch((retryErr) => {
              setHlsStatus(`Muted playback blocked: ${retryErr && retryErr.name ? retryErr.name : "unknown"}. Click to start.`);
            });
          }
        }
      });
    }
  }

  function tryPlayLiveMedia() {
    if (!isLiveStream()) return;
    // Respect an explicit user pause: do not force-resume on every BUFFER_APPENDED
    // tick. `liveUserWantsPlaying` is set true when the user clicks play and false
    // when they click pause, so stall-induced aborts are still recovered.
    if (liveHasEverPlayed && !liveUserWantsPlaying) return;
    attemptPlayWithAutoplayMuteFallback({ live: true });
  }

  /** Progressive / finite-duration native sources (embed `?autoplay=1`). */
  function scheduleVodAutoplayWhenReady() {
    if (!startupAutoplay) return;
    if (isExternalEmbedSource()) return;
    if (isLiveStream()) return;
    let fired = false;
    const run = () => {
      if (fired) return;
      fired = true;
      attemptPlayWithAutoplayMuteFallback();
      try {
        setState(!video.paused);
      } catch (_) {
        /* same-tick init edge */
      }
    };
    if (video.readyState >= 3) {
      queueMicrotask(run);
      return;
    }
    video.addEventListener("canplay", run, { once: true });
    video.addEventListener("loadeddata", run, { once: true });
  }

  function seekToLiveEdge() {
    if (!isLiveStream()) return false;
    const t = getJumpToLiveTargetTime();
    if (t == null) return false;
    try {
      /* Already at the newest seekable frame (within one frame). */
      if (t - video.currentTime <= 1 / 30) return true;
      video.currentTime = t;
      return true;
    } catch (_) {
      /* seek may be rejected briefly while the source is still attaching */
      return false;
    }
  }

  /**
   * Latched true whenever a new live source is loading; cleared after we successfully snap
   * to the live edge. `liveSyncPosition` / `video.seekable` may not populate until a few
   * events after MANIFEST_PARSED, so retry on later events instead of seeking just once.
   */
  let pendingInitialLiveSeek = false;
  /** Set to true once the live video has played for the first time. */
  let liveHasEverPlayed = false;
  /** Set to true when the user explicitly clicks play on a live stream; false when they pause.
   *  Lets tryPlayLiveMedia distinguish a deliberate pause from a stall-induced one. */
  let liveUserWantsPlaying = false;
  /** Clears a stuck `pendingInitialLiveSeek` if `seekable` never appears (rare). */
  let initialLiveSeekGuardTimer = null;
  /** Polls `tryConsumeInitialLiveSeek` at a fixed cadence for cross-browser parity. */
  let initialLiveSeekPollTimer = null;
  const INITIAL_LIVE_SEEK_GUARD_MS = 8000;
  /** Short poll interval: snap the frame we're waiting on the moment it's available. */
  const INITIAL_LIVE_SEEK_POLL_MS = 120;

  function clearInitialLiveSeekPoll() {
    if (initialLiveSeekPollTimer != null) {
      clearInterval(initialLiveSeekPollTimer);
      initialLiveSeekPollTimer = null;
    }
  }

  function clearInitialLiveSeekGuard() {
    if (initialLiveSeekGuardTimer != null) {
      clearTimeout(initialLiveSeekGuardTimer);
      initialLiveSeekGuardTimer = null;
    }
    clearInitialLiveSeekPoll();
  }

  /**
   * Request a snap-to-live-edge as soon as the pipeline is ready. Instead of
   * relying on a single HLS event (MANIFEST_PARSED / LEVEL_UPDATED fires at
   * different points on Safari vs hls.js, and locally vs over real network),
   * we start a short polling loop that consumes the seek the instant either
   * `seekable.end` or `liveSyncPosition` is usable. This is what makes the
   * first-load/reload behavior consistent across browsers and hosts.
   */
  function requestInitialLiveSeek() {
    pendingInitialLiveSeek = true;
    clearInitialLiveSeekGuard();
    initialLiveSeekPollTimer = window.setInterval(() => {
      tryConsumeInitialLiveSeek();
      if (!pendingInitialLiveSeek) clearInitialLiveSeekPoll();
    }, INITIAL_LIVE_SEEK_POLL_MS);
    initialLiveSeekGuardTimer = window.setTimeout(() => {
      initialLiveSeekGuardTimer = null;
      pendingInitialLiveSeek = false;
      clearInitialLiveSeekPoll();
    }, INITIAL_LIVE_SEEK_GUARD_MS);
    // Fire the first pass immediately and kick playback in parallel; HLS events
    // will re-enter `tryConsumeInitialLiveSeek` as soon as data is attached.
    tryConsumeInitialLiveSeek();
    tryPlayLiveMedia();
  }

  function tryConsumeInitialLiveSeek() {
    if (!pendingInitialLiveSeek) return;
    if (!isLiveStream()) {
      pendingInitialLiveSeek = false;
      clearInitialLiveSeekGuard();
      return;
    }
    if (!seekToLiveEdge()) return;
    /* With hls.js, keep retrying until `seekable` exists so we snap to the buffer edge, not only sync. */
    if (hlsInstance && getSeekableEndTime() == null) return;
    pendingInitialLiveSeek = false;
    clearInitialLiveSeekGuard();
  }

  function syncLiveButtonUI() {
    if (!(goLiveBtn instanceof HTMLElement)) return;
    if (startupDisableSeek || startupHideLivePill) return;
    const live = isLiveStream();
    goLiveBtn.hidden = !live;
    if (!live) return;
    const edge = getLiveEdgeTime();
    const atLive =
      edge == null || edge - video.currentTime <= LIVE_EDGE_AT_TOLERANCE_SEC;
    goLiveBtn.dataset.liveAt = atLive ? "true" : "false";
    goLiveBtn.setAttribute(
      "data-tooltip",
      atLive ? "Live" : "Jump to live"
    );
    goLiveBtn.setAttribute(
      "aria-label",
      atLive ? "Live" : "Jump to live"
    );
  }

  const DEMO_SAMPLE_URL =
    "https://storage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4";

  /** Desktop (Electron): waiting for native initial path so we do not flash the web demo. */
  let pendingNativeInitial = false;

  let scrubPreviewActive = false;
  /** Last pointer X while preview is shown; used to reflow size on resize. */
  let lastPreviewClientX = null;
  let previewSeekRaf = null;
  /** Latest scrub time while preview is active; not cleared until seek pipeline catches up or hide. */
  let previewDesiredTime = null;
  let previewSeekInFlight = false;
  /** Like `frameStepGen`: ignore stale `seeked` draws when a newer hover target was queued. */
  let previewSeekGen = 0;
  /** Generation for the in-flight preview seek (set when assigning `previewVideo.currentTime`). */
  let previewSeekInFlightGen = 0;
  let lastScrubTime = 0;
  /** Which pointer owns an in-progress seek drag (document `pointerup` must ignore other pointers). */
  let scrubPointerId = null;
  /** Touch `Touch.identifier` for the finger scrubbing the seek bar (PE `pointermove` is often missing during native range drags). */
  let scrubTouchId = null;
  /** Touch `pointerId`s whose `pointerdown` was on the player; used to catch long-press menus when MQs still report a fine pointer (Windows hybrid). */
  const activeTouchPointersOnPlayer = new Set();

  const MIN_ZOOM = 1;
  const MAX_ZOOM = 9;
  const ZOOM_STEP = 0.25;
  const usesCoarsePrimaryPointer =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(pointer: coarse)").matches;
  const isMobileLikePlaybackEnvironment =
    usesCoarsePrimaryPointer ||
    (typeof window.matchMedia === "function" &&
      window.matchMedia("(hover: none)").matches);
  /**
   * Mobile Safari can glitch at non-1x once audio is routed through Web Audio (`MediaElementSource`).
   * Keep the native output path there and rely on hardware volume controls.
   */
  const allowWebAudioVolumeRoute = !isMobileLikePlaybackEnvironment;

  /** iOS and many mobile browsers ignore `video.volume` writes; mute still works. */
  function browserAllowsMediaElementVolumeControl() {
    try {
      const t = document.createElement("video");
      t.muted = true;
      t.volume = 1;
      const target = 0.37;
      t.volume = target;
      return Math.abs(t.volume - target) < 0.02;
    } catch (_) {
      return false;
    }
  }

  /**
   * iOS/iPadOS WebKit often reports successful `video.volume` writes while playback loudness
   * still follows the hardware buttons — route volume through Web Audio instead.
   */
  function isIosStyleVolumeLockedPlatform() {
    try {
      const ua = navigator.userAgent || "";
      if (/iPhone|iPod|iPad/i.test(ua)) return true;
      if (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1) return true;
    } catch (_) {
      /* ignore */
    }
    return false;
  }

  function isNativeFullscreenActive() {
    return Boolean(
      document.fullscreenElement ||
        document.webkitFullscreenElement ||
        video.webkitDisplayingFullscreen === true ||
        (typeof video.webkitPresentationMode === "string" &&
          video.webkitPresentationMode === "fullscreen")
    );
  }

  function syncFullscreenButtonUI() {
    if (!(fullscreenBtn instanceof HTMLElement)) return;
    const active = isNativeFullscreenActive();
    fullscreenBtn.setAttribute("aria-label", active ? "Exit fullscreen" : "Fullscreen");
    fullscreenBtn.setAttribute(
      "data-tooltip",
      active ? "Exit fullscreen (F)" : "Fullscreen (F)"
    );
  }

  /** When true, drive loudness with `video.volume`; otherwise try Web Audio gain (see below). */
  const elementVolumeControlsOutput =
    browserAllowsMediaElementVolumeControl() && !isIosStyleVolumeLockedPlatform();

  /** Lazily created when `elementVolumeControlsOutput` is false (typical: iPhone Safari). */
  let webAudioVolumeRoute = false;
  /** Cleared on `loadstart` so a new source can retry after a CORS/setup failure. */
  let webAudioVolumeSetupFailed = false;
  /** @type {AudioContext | null} */
  let webAudioCtx = null;
  /** @type {GainNode | null} */
  let webAudioGain = null;
  /** Value at `pointerdown` on the volume range; mobile often emits a bogus `input` of 0 first. */
  let volPointerBaseline = null;

  function webAudioVolumeConstructorAvailable() {
    return (
      typeof window.AudioContext === "function" ||
      typeof window.webkitAudioContext === "function"
    );
  }

  function ensureWebAudioGainRoute() {
    if (elementVolumeControlsOutput) return false;
    if (!allowWebAudioVolumeRoute) return false;
    if (webAudioVolumeRoute && webAudioCtx && webAudioGain) {
      void webAudioCtx.resume();
      return true;
    }
    if (webAudioVolumeSetupFailed) return false;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (typeof AC !== "function") {
      webAudioVolumeSetupFailed = true;
      syncVolumeSliderLockedUI();
      return false;
    }
    try {
      const ctx = new AC();
      const src = ctx.createMediaElementSource(video);
      const gain = ctx.createGain();
      src.connect(gain);
      gain.connect(ctx.destination);
      webAudioCtx = ctx;
      webAudioGain = gain;
      webAudioVolumeRoute = true;
      video.volume = 1;
      {
        const raw = Number(volumeSlider.value);
        const g0 = Number.isFinite(raw) ? Math.max(0, Math.min(1, raw)) : 1;
        gain.gain.value = g0;
      }
      void ctx.resume();
      return true;
    } catch (_) {
      webAudioVolumeSetupFailed = true;
      syncVolumeSliderLockedUI();
      return false;
    }
  }

  /** Apply slider + `video.muted` to the Web Audio gain node (no-op if not routed). */
  function setWebAudioOutputGainFromControls() {
    if (!webAudioVolumeRoute || !webAudioGain || !webAudioCtx) return;
    let v = Math.max(0, Math.min(1, Number(volumeSlider.value)));
    if (!Number.isFinite(v)) v = 1;
    const out = video.muted ? 0 : v;
    try {
      webAudioGain.gain.setValueAtTime(out, webAudioCtx.currentTime);
    } catch (_) {
      webAudioGain.gain.value = out;
    }
  }

  function applyVolumeFromSlider() {
    if (!(volumeSlider instanceof HTMLInputElement)) return;
    let v = Math.max(0, Math.min(1, Number(volumeSlider.value)));
    if (!Number.isFinite(v)) return;

    if (!elementVolumeControlsOutput) {
      const baseline = volPointerBaseline;
      if (
        !webAudioVolumeRoute &&
        baseline != null &&
        Number.isFinite(baseline) &&
        baseline > 0.05 &&
        v === 0
      ) {
        v = Math.max(0, Math.min(1, baseline));
        volumeSlider.value = String(v);
      }
    }

    if (elementVolumeControlsOutput) {
      video.volume = v;
      video.muted = v === 0;
      return;
    }

    if (!ensureWebAudioGainRoute()) return;

    video.volume = 1;
    /* Output level is gain; keep `video.muted` for the mute control (WebKit often ignores muted on this route). */
    setWebAudioOutputGainFromControls();
    void webAudioCtx.resume();
    setMutedUI();
  }

  function bumpVolumeKeyboard(delta) {
    if (elementVolumeControlsOutput) {
      if (delta > 0) video.muted = false;
      video.volume = Math.min(1, Math.max(0, video.volume + delta));
      video.muted = video.volume === 0;
      volumeSlider.value = String(video.volume);
      return;
    }
    if (!ensureWebAudioGainRoute()) return;
    if (delta > 0) video.muted = false;
    const cur = Math.max(0, Math.min(1, Number(volumeSlider.value)));
    const next = Math.min(1, Math.max(0, cur + delta));
    volumeSlider.value = String(next);
    applyVolumeFromSlider();
  }

  function syncVolumeSliderLockedUI() {
    if (!(volumeSlider instanceof HTMLInputElement)) return;
    const enabled =
      elementVolumeControlsOutput ||
      (allowWebAudioVolumeRoute &&
        webAudioVolumeConstructorAvailable() &&
        !webAudioVolumeSetupFailed);
    volumeSlider.disabled = !enabled;
    volumeSlider.setAttribute(
      "aria-label",
      enabled
        ? "Volume"
        : "Volume (not adjustable for this source in this browser)"
    );
  }

  video.addEventListener("loadstart", () => {
    webAudioVolumeSetupFailed = false;
  });

  /** At 1× zoom, movement past this before pointerup cancels tap-to-play (scroll starting on the player). */
  const VIEWPORT_TAP_CANCEL_MOVE_PX = usesCoarsePrimaryPointer ? 30 : 12;
  /** Coarse/touch: cancel tap-to-play if the finger stayed down longer than a quick tap (avoids long-press / slow drags). */
  const VIEWPORT_TAP_MAX_DURATION_MS = usesCoarsePrimaryPointer ? 300 : Infinity;
  /** Two-finger span must reach this (px) before pinch-zoom activates (avoids jitter when touches start close). */
  const PINCH_MIN_START_DIST_PX = 28;
  /** Clamp per-move scale ratio so a bad frame does not explode zoom. */
  const PINCH_FACTOR_MIN = 0.55;
  const PINCH_FACTOR_MAX = 1.85;

  let zoomLevel = 1;
  let panX = 0;
  let panY = 0;
  let panPointer = null;

  /** @type {Map<number, { clientX: number; clientY: number; pointerType: string }>} */
  const viewportPointers = new Map();
  /** @type {{ lastDist: number } | null} */
  let pinchState = null;

  function isTwoFingerTouchPinch() {
    if (viewportPointers.size !== 2) return false;
    const pts = [...viewportPointers.values()];
    return pts[0].pointerType === "touch" && pts[1].pointerType === "touch";
  }

  function getViewportPinchDistance() {
    const pts = [...viewportPointers.values()];
    if (pts.length !== 2) return 0;
    const dx = pts[0].clientX - pts[1].clientX;
    const dy = pts[0].clientY - pts[1].clientY;
    return Math.hypot(dx, dy);
  }

  function getViewportPinchAnchor() {
    const pts = [...viewportPointers.values()];
    if (pts.length !== 2) return null;
    const mx = (pts[0].clientX + pts[1].clientX) / 2;
    const my = (pts[0].clientY + pts[1].clientY) / 2;
    const rect = videoViewport.getBoundingClientRect();
    return {
      x: Math.min(rect.width, Math.max(0, mx - rect.left)),
      y: Math.min(rect.height, Math.max(0, my - rect.top)),
    };
  }

  function releasePanPointerCapture() {
    if (!panPointer) return;
    const pid = panPointer.id;
    try {
      if (videoViewport.hasPointerCapture(pid)) {
        videoViewport.releasePointerCapture(pid);
      }
    } catch (_) {
      /* ignore */
    }
    panPointer = null;
    videoViewport.dataset.panning = "false";
  }

  function promoteRemainingFingerToPan() {
    if (viewportPointers.size !== 1) {
      panPointer = null;
      return;
    }
    const [id, pt] = viewportPointers.entries().next().value;
    if (zoomLevel > 1.001) {
      panPointer = {
        id,
        cx: pt.clientX,
        cy: pt.clientY,
        ox: panX,
        oy: panY,
        dragged: false,
        tapCancelled: true,
      };
      try {
        videoViewport.setPointerCapture(id);
      } catch (_) {
        /* ignore */
      }
      videoViewport.dataset.panning = "true";
    } else {
      panPointer = null;
    }
  }

  function clampPan() {
    if (zoomLevel <= 1) {
      panX = 0;
      panY = 0;
      return;
    }
    const vw = videoViewport.clientWidth;
    const vh = videoViewport.clientHeight;
    const maxX = (vw * (zoomLevel - 1)) / 2;
    const maxY = (vh * (zoomLevel - 1)) / 2;
    panX = Math.max(-maxX, Math.min(maxX, panX));
    panY = Math.max(-maxY, Math.min(maxY, panY));
  }

  function syncRatePillWidthToZoom() {
    if (!(zoomGroup instanceof HTMLElement) || !(ratePill instanceof HTMLElement)) return;
    const wZoom = zoomGroup.offsetWidth;
    ratePill.style.removeProperty("width");
    if (qualityWrap instanceof HTMLElement) qualityWrap.style.removeProperty("width");
    const wNatural = Math.ceil(ratePill.getBoundingClientRect().width);
    if (wZoom <= 0) {
      if (wNatural > 0) ratePill.style.width = `${wNatural}px`;
      else ratePill.style.removeProperty("width");
      return;
    }
    const wTarget = Math.max(wZoom, wNatural);
    ratePill.style.width = `${wTarget}px`;
    if (qualityWrap instanceof HTMLElement)
      qualityWrap.style.width = `${wTarget}px`;
  }

  function applyZoomTransform() {
    zoomLayer.style.transform = `translate(${panX}px, ${panY}px) scale(${zoomLevel})`;
    videoViewport.dataset.canPan = zoomLevel > 1.001 ? "true" : "false";
    zoomLabel.textContent = `${Math.round(zoomLevel * 100)}%`;
    syncRatePillWidthToZoom();
  }

  /**
   * @param {number} z
   * @param {{ x: number; y: number } | null} anchorViewport — point in videoViewport coords
   *   (top-left origin); omit or null to zoom toward the viewport center (toolbar / keyboard).
   */
  function setZoomLevel(z, anchorViewport = null) {
    const vw = videoViewport.clientWidth;
    const vh = videoViewport.clientHeight;
    const ox = vw / 2;
    const oy = vh / 2;
    const ax = anchorViewport ? anchorViewport.x : ox;
    const ay = anchorViewport ? anchorViewport.y : oy;

    const z0 = zoomLevel;
    const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(z * 100) / 100));

    if (next <= 1) {
      zoomLevel = next;
      panX = 0;
      panY = 0;
      clampPan();
      applyZoomTransform();
      return;
    }

    if (Math.abs(next - z0) > 1e-6 && z0 >= 1) {
      const ratio = next / z0;
      panX = ax - ox - ratio * (ax - ox - panX);
      panY = ay - oy - ratio * (ay - oy - panY);
    }

    zoomLevel = next;
    clampPan();
    applyZoomTransform();
  }

  function adjustZoomByStep(deltaSteps) {
    const z =
      Math.round((zoomLevel + deltaSteps * ZOOM_STEP) / ZOOM_STEP) * ZOOM_STEP;
    setZoomLevel(z);
  }

  function zoomFromWheel(deltaY, clientX, clientY) {
    const rect = videoViewport.getBoundingClientRect();
    const anchor = {
      x: Math.min(rect.width, Math.max(0, clientX - rect.left)),
      y: Math.min(rect.height, Math.max(0, clientY - rect.top)),
    };
    const factor = deltaY > 0 ? 0.92 : 1.08;
    setZoomLevel(zoomLevel * factor, anchor);
  }

  /** Used until enough frames have been observed (no rVFC or never played). */
  const FALLBACK_FRAME_PERIOD = 1 / 30;
  /** Hold-to-repeat only starts after this many ms so quick taps stay single-step. */
  const FRAME_HOLD_REPEAT_DELAY_MS = 300;
  /**
   * Touch pointers: extra wait before frame-step hold-repeat starts, on top of
   * {@link FRAME_HOLD_REPEAT_DELAY_MS} (avoids accidental rapid stepping on mobile).
   */
  const FRAME_POINTER_HOLD_REPEAT_EXTRA_MS_TOUCH = 300;
  /** After the initial delay, zoom / playback-rate keys and buttons repeat at this interval. */
  const CHROME_HOLD_INTERVAL_MS = 100;

  const DT_SAMPLE_CAP = 48;
  const MIN_FRAME_PERIOD = 1 / 120;
  const MAX_FRAME_PERIOD = 0.2;
  const MIN_SAMPLES_FOR_PERIOD = 6;

  const framePeriodSamples = [];
  let rVfcHandle = null;
  let measureActive = false;
  let lastMediaTime = null;

  function recordFramePeriod(dt) {
    framePeriodSamples.push(dt);
    if (framePeriodSamples.length > DT_SAMPLE_CAP) framePeriodSamples.shift();
  }

  function getFramePeriodSec() {
    if (framePeriodSamples.length < MIN_SAMPLES_FOR_PERIOD) return null;
    const sorted = framePeriodSamples.slice().sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const median =
      sorted.length % 2 === 1
        ? sorted[mid]
        : (sorted[mid - 1] + sorted[mid]) / 2;
    if (median < MIN_FRAME_PERIOD || median > MAX_FRAME_PERIOD) return null;
    return median;
  }

  function onVideoFrame(_now, metadata) {
    rVfcHandle = null;
    if (!measureActive || video.paused) return;

    const mt = metadata.mediaTime;
    if (lastMediaTime != null) {
      const dt = mt - lastMediaTime;
      if (dt >= MIN_FRAME_PERIOD && dt <= MAX_FRAME_PERIOD) {
        recordFramePeriod(dt);
      }
    }
    lastMediaTime = mt;
    rVfcHandle = video.requestVideoFrameCallback(onVideoFrame);
  }

  function startFramePeriodMeasure() {
    if (typeof video.requestVideoFrameCallback !== "function") return;
    measureActive = true;
    if (rVfcHandle != null) return;
    rVfcHandle = video.requestVideoFrameCallback(onVideoFrame);
  }

  function stopFramePeriodMeasure() {
    measureActive = false;
    if (rVfcHandle != null && typeof video.cancelVideoFrameCallback === "function") {
      try {
        video.cancelVideoFrameCallback(rVfcHandle);
      } catch (_) {
        /* ignore */
      }
    }
    rVfcHandle = null;
    lastMediaTime = null;
  }

  /** While true, `stepByFrame` for that direction chains after each completed seek (comma/period hold). */
  let frameKeyHeldBack = false;
  let frameKeyHeldForward = false;
  /** Same for overlay frame step buttons (pointer hold). */
  let framePointerHeldBack = false;
  let framePointerHeldForward = false;
  /** True after `pointerdown` on a frame step button until `click` skips or rAF clears (no duplicate step). */
  let lastFrameStepViaPointer = false;
  /** After delay, hold chains another frame on comma/period or frame buttons (`FRAME_HOLD_REPEAT_DELAY_MS`). */
  let frameKeyHoldRepeatReadyBack = false;
  let frameKeyHoldRepeatReadyForward = false;
  let framePointerHoldRepeatReadyBack = false;
  let framePointerHoldRepeatReadyForward = false;
  let frameKeyHoldTimerBack = null;
  let frameKeyHoldTimerForward = null;
  let framePointerHoldTimerBack = null;
  let framePointerHoldTimerForward = null;

  function frameHeldForDirection(direction) {
    return direction < 0
      ? frameKeyHeldBack || framePointerHeldBack
      : frameKeyHeldForward || framePointerHeldForward;
  }

  function frameHoldRepeatsAfterDelayForDirection(direction) {
    return direction < 0
      ? (frameKeyHeldBack && frameKeyHoldRepeatReadyBack) ||
          (framePointerHeldBack && framePointerHoldRepeatReadyBack)
      : (frameKeyHeldForward && frameKeyHoldRepeatReadyForward) ||
          (framePointerHeldForward && framePointerHoldRepeatReadyForward);
  }

  function disarmKeyboardFrameHoldRepeat(direction) {
    if (direction === -1) {
      if (frameKeyHoldTimerBack != null) {
        clearTimeout(frameKeyHoldTimerBack);
        frameKeyHoldTimerBack = null;
      }
      frameKeyHoldRepeatReadyBack = false;
    } else {
      if (frameKeyHoldTimerForward != null) {
        clearTimeout(frameKeyHoldTimerForward);
        frameKeyHoldTimerForward = null;
      }
      frameKeyHoldRepeatReadyForward = false;
    }
  }

  function disarmPointerFrameHoldRepeat(direction) {
    if (direction === -1) {
      if (framePointerHoldTimerBack != null) {
        clearTimeout(framePointerHoldTimerBack);
        framePointerHoldTimerBack = null;
      }
      framePointerHoldRepeatReadyBack = false;
    } else {
      if (framePointerHoldTimerForward != null) {
        clearTimeout(framePointerHoldTimerForward);
        framePointerHoldTimerForward = null;
      }
      framePointerHoldRepeatReadyForward = false;
    }
  }

  function armKeyboardFrameHoldRepeat(direction) {
    disarmKeyboardFrameHoldRepeat(direction);
    const tid = window.setTimeout(() => {
      if (direction === -1) {
        frameKeyHoldTimerBack = null;
        if (!frameKeyHeldBack) return;
        frameKeyHoldRepeatReadyBack = true;
      } else {
        frameKeyHoldTimerForward = null;
        if (!frameKeyHeldForward) return;
        frameKeyHoldRepeatReadyForward = true;
      }
      stepByFrame(direction);
    }, FRAME_HOLD_REPEAT_DELAY_MS);
    if (direction === -1) frameKeyHoldTimerBack = tid;
    else frameKeyHoldTimerForward = tid;
  }

  function armPointerFrameHoldRepeat(direction, delayMs) {
    disarmPointerFrameHoldRepeat(direction);
    const delay =
      typeof delayMs === "number" && Number.isFinite(delayMs)
        ? delayMs
        : FRAME_HOLD_REPEAT_DELAY_MS;
    const tid = window.setTimeout(() => {
      if (direction === -1) {
        framePointerHoldTimerBack = null;
        if (!framePointerHeldBack) return;
        framePointerHoldRepeatReadyBack = true;
      } else {
        framePointerHoldTimerForward = null;
        if (!framePointerHeldForward) return;
        framePointerHoldRepeatReadyForward = true;
      }
      stepByFrame(direction);
    }, delay);
    if (direction === -1) framePointerHoldTimerBack = tid;
    else framePointerHoldTimerForward = tid;
  }

  /** Suppresses stale `seeked` UI when a newer frame-step seek was started. */
  let frameStepGen = 0;

  function stepByFrame(direction) {
    if (isExternalEmbedSource()) return;
    if (!video.paused) video.pause();
    const dur = getEffectiveDuration();
    if (dur == null) return;

    const fd = getFramePeriodSec() ?? FALLBACK_FRAME_PERIOD;
    const eps = fd * 0.02;
    const idx = Math.floor((video.currentTime + eps) / fd);
    const nextIdx = direction < 0 ? idx - 1 : idx + 1;
    const newTime = Math.max(
      0,
      Math.min(dur - Number.EPSILON, nextIdx * fd)
    );

    if (Math.abs(newTime - video.currentTime) < 1e-6) {
      syncProgressFromVideo();
      updateTimeDisplay();
      return;
    }

    const myGen = (frameStepGen += 1);
    video.addEventListener(
      "seeked",
      () => {
        if (myGen !== frameStepGen) return;
        syncProgressFromVideo();
        updateTimeDisplay();
        if (!frameHeldForDirection(direction)) return;
        if (!frameHoldRepeatsAfterDelayForDirection(direction)) return;
        // Paused video: `requestVideoFrameCallback` often never fires, so holds would stop after
        // one frame. `requestAnimationFrame` runs after the seeked paint path on the main thread.
        requestAnimationFrame(() => {
          if (!frameHoldRepeatsAfterDelayForDirection(direction)) return;
          stepByFrame(direction);
        });
      },
      { once: true }
    );
    video.currentTime = newTime;
  }

  function frameStepDirectionFromKeyEvent(e) {
    if (e.key === ",") return -1;
    if (e.key === ".") return 1;
    if (e.code === "Comma") return -1;
    if (e.code === "Period") return 1;
    return null;
  }

  function clearFrameKeyboardHoldDirection(direction) {
    disarmKeyboardFrameHoldRepeat(direction);
    if (direction === -1) frameKeyHeldBack = false;
    else frameKeyHeldForward = false;
  }

  function clearAllFrameHold() {
    frameKeyHeldBack = false;
    frameKeyHeldForward = false;
    framePointerHeldBack = false;
    framePointerHeldForward = false;
    lastFrameStepViaPointer = false;
    disarmKeyboardFrameHoldRepeat(-1);
    disarmKeyboardFrameHoldRepeat(1);
    disarmPointerFrameHoldRepeat(-1);
    disarmPointerFrameHoldRepeat(1);
  }

  /** @type {Set<() => void>} */
  const chromePointerHoldDisarms = new Set();

  /** Keyboard hold-repeat for zoom (+ / −) and playback rate ([ / ]). */
  let zoomKbActiveDir = /** @type {0 | 1 | -1} */ (0);
  let zoomKbDelayId = null;
  let zoomKbIntervalId = null;
  let rateKbActiveDir = /** @type {0 | 1 | -1} */ (0);
  let rateKbDelayId = null;
  let rateKbIntervalId = null;

  function disarmZoomKbRepeat() {
    zoomKbActiveDir = 0;
    if (zoomKbDelayId != null) {
      clearTimeout(zoomKbDelayId);
      zoomKbDelayId = null;
    }
    if (zoomKbIntervalId != null) {
      clearInterval(zoomKbIntervalId);
      zoomKbIntervalId = null;
    }
  }

  function disarmRateKbRepeat() {
    rateKbActiveDir = 0;
    if (rateKbDelayId != null) {
      clearTimeout(rateKbDelayId);
      rateKbDelayId = null;
    }
    if (rateKbIntervalId != null) {
      clearInterval(rateKbIntervalId);
      rateKbIntervalId = null;
    }
  }

  function disarmZoomRateKeyboardHolds() {
    disarmZoomKbRepeat();
    disarmRateKbRepeat();
  }

  function disarmAllChromePointerHolds() {
    for (const d of [...chromePointerHoldDisarms]) {
      try {
        d();
      } catch (_) {
        /* ignore */
      }
    }
    chromePointerHoldDisarms.clear();
  }

  function isZoomInKeyEvent(e) {
    return (
      e.code === "NumpadAdd" ||
      e.key === "=" ||
      e.key === "+" ||
      e.code === "Equal"
    );
  }

  function isZoomOutKeyEvent(e) {
    return (
      e.code === "NumpadSubtract" ||
      e.code === "Minus" ||
      e.key === "-" ||
      e.key === "_"
    );
  }

  /**
   * @param {1 | -1} dir
   */
  function zoomKbKeydown(dir) {
    disarmZoomKbRepeat();
    zoomKbActiveDir = dir;
    adjustZoomByStep(dir);
    zoomKbDelayId = window.setTimeout(() => {
      zoomKbDelayId = null;
      if (zoomKbActiveDir !== dir) return;
      zoomKbIntervalId = window.setInterval(() => {
        if (zoomKbActiveDir === dir) adjustZoomByStep(dir);
      }, CHROME_HOLD_INTERVAL_MS);
    }, FRAME_HOLD_REPEAT_DELAY_MS);
  }

  /**
   * @param {1 | -1} dir
   */
  function zoomKbKeyup(dir) {
    if (zoomKbActiveDir !== dir) return;
    disarmZoomKbRepeat();
  }

  /**
   * @param {1 | -1} dir  1 = faster, -1 = slower (matches `nudgePlaybackRate`)
   */
  function rateKbKeydown(dir) {
    disarmRateKbRepeat();
    rateKbActiveDir = dir;
    nudgePlaybackRate(dir);
    rateKbDelayId = window.setTimeout(() => {
      rateKbDelayId = null;
      if (rateKbActiveDir !== dir) return;
      rateKbIntervalId = window.setInterval(() => {
        if (rateKbActiveDir === dir) nudgePlaybackRate(dir);
      }, CHROME_HOLD_INTERVAL_MS);
    }, FRAME_HOLD_REPEAT_DELAY_MS);
  }

  /**
   * @param {1 | -1} dir
   */
  function rateKbKeyup(dir) {
    if (rateKbActiveDir !== dir) return;
    disarmRateKbRepeat();
  }

  /**
   * Hold-to-repeat for zoom ± and rate ± buttons (same delay/interval as keyboard).
   * @param {HTMLElement} btn
   * @param {() => void} stepFn
   */
  function wireHeldChromeButton(btn, stepFn) {
    let delayId = null;
    let intervalId = null;
    let viaPointer = false;

    function disarm() {
      if (delayId != null) {
        clearTimeout(delayId);
        delayId = null;
      }
      if (intervalId != null) {
        clearInterval(intervalId);
        intervalId = null;
      }
      chromePointerHoldDisarms.delete(disarm);
    }

    btn.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      try {
        btn.setPointerCapture(e.pointerId);
      } catch (_) {
        /* ignore */
      }
      viaPointer = true;
      disarm();
      chromePointerHoldDisarms.add(disarm);
      stepFn();
      delayId = window.setTimeout(() => {
        delayId = null;
        intervalId = window.setInterval(() => stepFn(), CHROME_HOLD_INTERVAL_MS);
      }, FRAME_HOLD_REPEAT_DELAY_MS);
    });
    btn.addEventListener("click", () => {
      if (viaPointer) {
        viaPointer = false;
        return;
      }
      stepFn();
    });
    btn.addEventListener("lostpointercapture", () => {
      disarm();
      bumpChromeActivity();
    });
  }

  function revokeBlobUrl() {
    previewVideo.removeAttribute("src");
    previewVideo.load();
    if (blobUrl) {
      URL.revokeObjectURL(blobUrl);
      blobUrl = null;
    }
  }

  function exitYoutubeMode() {
    sourceKind = "native";
    player.dataset.source = "native";
    player.classList.remove("player--youtube-only");
    if (ytMount instanceof HTMLElement) {
      ytMount.innerHTML = "";
      ytMount.hidden = true;
    }
    video.hidden = false;
    syncFullscreenButtonUI();
  }

  function parseYouTubeVideoId(raw) {
    const s = String(raw || "").trim();
    if (!s) return null;
    const withScheme = /^https?:\/\//i.test(s) ? s : `https://${s}`;
    let url;
    try {
      url = new URL(withScheme);
    } catch (_) {
      return null;
    }
    const host = url.hostname.replace(/^www\./i, "").toLowerCase();
    if (host === "youtu.be") {
      const id = url.pathname.replace(/^\//, "").split("/")[0];
      return /^[\w-]{11}$/.test(id) ? id : null;
    }
    if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com") {
      if (url.pathname === "/watch" || url.pathname.startsWith("/watch")) {
        const v = url.searchParams.get("v");
        return v && /^[\w-]{11}$/.test(v) ? v : null;
      }
      const embed = url.pathname.match(/^\/embed\/([\w-]{11})/);
      if (embed) return embed[1];
      const shorts = url.pathname.match(/^\/shorts\/([\w-]{11})/);
      if (shorts) return shorts[1];
      const live = url.pathname.match(/^\/live\/([\w-]{11})/);
      if (live) return live[1];
    }
    if (host === "youtube-nocookie.com" || host.endsWith(".youtube-nocookie.com")) {
      const embedNc = url.pathname.match(/^\/embed\/([\w-]{11})/);
      if (embedNc) return embedNc[1];
    }
    return null;
  }

  function parseVimeoVideoId(raw) {
    const s = String(raw || "").trim();
    if (!s) return null;
    const withScheme = /^https?:\/\//i.test(s) ? s : `https://${s}`;
    let url;
    try {
      url = new URL(withScheme);
    } catch (_) {
      return null;
    }
    const host = url.hostname.replace(/^www\./i, "").toLowerCase();
    if (host === "player.vimeo.com") {
      const m = url.pathname.match(/^\/video\/(\d+)/);
      return m ? m[1] : null;
    }
    if (host === "vimeo.com" || host.endsWith(".vimeo.com")) {
      const segs = url.pathname.match(/\/(\d{6,})/g);
      if (!segs || !segs.length) return null;
      const last = segs[segs.length - 1].replace(/^\//, "");
      return last || null;
    }
    return null;
  }

  /**
   * @returns {{ kind: "video", video: string } | { kind: "channel", channel: string } | { kind: "clip", clip: string } | null}
   */
  function parseTwitchEmbedTarget(raw) {
    const s = String(raw || "").trim();
    if (!s) return null;
    const withScheme = /^https?:\/\//i.test(s) ? s : `https://${s}`;
    let url;
    try {
      url = new URL(withScheme);
    } catch (_) {
      return null;
    }
    let host = url.hostname.replace(/^www\./i, "").toLowerCase();
    if (host === "m.twitch.tv") host = "twitch.tv";
    if (host === "clips.twitch.tv") {
      const slug = url.pathname.replace(/^\//, "").split("/")[0];
      if (slug && /^[\w-]+$/.test(slug)) return { kind: "clip", clip: slug };
      return null;
    }
    if (host !== "twitch.tv" && !host.endsWith(".twitch.tv")) return null;
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts[0] === "videos" && /^\d+$/.test(parts[1] || "")) {
      return { kind: "video", video: `v${parts[1]}` };
    }
    if (parts.length >= 3 && parts[1] === "clip") {
      const slug = parts[2] || "";
      if (slug && /^[\w-]+$/.test(slug)) return { kind: "clip", clip: slug };
      return null;
    }
    if (parts.length === 1) {
      const ch = parts[0];
      const reserved = new Set([
        "videos",
        "directory",
        "downloads",
        "settings",
        "jobs",
        "p",
        "legal",
        "security",
        "subs",
        "turbo",
        "products",
        "search",
      ]);
      if (reserved.has(ch.toLowerCase())) return null;
      if (/^[a-zA-Z0-9_]{4,25}$/.test(ch)) return { kind: "channel", channel: ch };
    }
    return null;
  }

  /**
   * Resolve a media URL against the current document. Root-relative paths like
   * `/uploads/foo.mp4` need a base URL — `new URL("/uploads/foo.mp4")` throws,
   * which broke embeds when `?src=` pointed at same-origin static files.
   */
  function resolveToAbsoluteHttpUrl(urlStr) {
    try {
      const u = new URL(urlStr, window.location.href);
      if (u.protocol !== "http:" && u.protocol !== "https:") return null;
      return u.href;
    } catch (_) {
      return null;
    }
  }

  function isLikelyDirectVideoUrl(urlStr) {
    return resolveToAbsoluteHttpUrl(urlStr) !== null;
  }

  function loadExternalEmbedIframe(kind, iframeSrc, iframeTitle, displayLabel) {
    hasCustomSource = true;
    expectsLiveHlsPlayback = false;
    revokeBlobUrl();
    detachHlsInstance();
    exitYoutubeMode();
    sourceKind = kind;
    player.dataset.source = kind;
    player.classList.add("player--youtube-only");
    try {
      setZoomLevel(1);
    } catch (_) {
      /* setZoomLevel not ready in edge load orders */
    }
    video.pause();
    video.removeAttribute("src");
    video.load();
    syncPreviewVideoSrc();
    hideScrubPreview();
    video.hidden = true;
    if (!(ytMount instanceof HTMLElement)) return;
    ytMount.hidden = false;
    ytMount.innerHTML = "";
    const ifr = document.createElement("iframe");
    ifr.className = "player__youtube-iframe";
    ifr.src = iframeSrc;
    ifr.title = iframeTitle;
    ifr.setAttribute("allowfullscreen", "");
    ifr.setAttribute(
      "allow",
      "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
    );
    ifr.referrerPolicy = "strict-origin-when-cross-origin";
    ytMount.appendChild(ifr);
    if (fileNameEl instanceof HTMLElement) {
      fileNameEl.textContent = displayLabel || iframeTitle;
    }
    clearAllFrameHold();
    syncFullscreenButtonUI();
    syncLiveButtonUI();
  }

  function loadYouTubeFromId(videoId, displayLabel) {
    const params = new URLSearchParams({
      rel: "0",
      modestbranding: "1",
      playsinline: "1",
    });
    if (startupAutoplay) {
      params.set("autoplay", "1");
      if (autoplayMuteFallbackOk()) params.set("mute", "1");
    }
    const src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(
      videoId
    )}?${params}`;
    loadExternalEmbedIframe(
      "youtube",
      src,
      "YouTube video",
      displayLabel || `YouTube · ${videoId}`
    );
  }

  function loadVimeoFromId(videoId, displayLabel) {
    const params = new URLSearchParams({
      badge: "0",
      autopause: "0",
      playsinline: "1",
    });
    if (startupAutoplay) {
      params.set("autoplay", "1");
      if (autoplayMuteFallbackOk()) params.set("muted", "1");
    }
    const src = `https://player.vimeo.com/video/${encodeURIComponent(videoId)}?${params}`;
    loadExternalEmbedIframe(
      "vimeo",
      src,
      "Vimeo video",
      displayLabel || `Vimeo · ${videoId}`
    );
  }

  function loadTwitchEmbed(target, displayLabel) {
    const u = new URL("https://player.twitch.tv/");
    u.searchParams.set("playsinline", "true");
    const h = (window.location && window.location.hostname) || "";
    const parents = [];
    if (h) {
      parents.push(h);
      if (h === "127.0.0.1") parents.push("localhost");
      else if (h === "localhost") parents.push("127.0.0.1");
    }
    if (!parents.length) parents.push("localhost");
    for (const p of parents) u.searchParams.append("parent", p);
    if (target.kind === "video") u.searchParams.set("video", target.video);
    else if (target.kind === "channel") u.searchParams.set("channel", target.channel);
    else u.searchParams.set("clip", target.clip);
    if (startupAutoplay) {
      u.searchParams.set("autoplay", "true");
      if (autoplayMuteFallbackOk()) u.searchParams.set("muted", "true");
    }
    const label =
      displayLabel ||
      (target.kind === "video"
        ? `Twitch · ${target.video}`
        : target.kind === "channel"
          ? `Twitch · ${target.channel} (live)`
          : `Twitch clip · ${target.clip}`);
    loadExternalEmbedIframe("twitch", u.toString(), "Twitch video", label);
  }

  function loadVideoFromHttpUrl(urlStr) {
    const abs = resolveToAbsoluteHttpUrl(urlStr);
    if (!abs) {
      if (fileNameEl instanceof HTMLElement) {
        fileNameEl.textContent = "Enter a valid http(s) video URL.";
      }
      return;
    }
    hasCustomSource = true;
    exitYoutubeMode();
    revokeBlobUrl();
    detachHlsInstance();
    video.hidden = false;
    player.dataset.source = "native";
    syncPipVisibility();

    const hls = isHlsUrl(abs);
    expectsLiveHlsPlayback = hls;
    const canNativeHls =
      hls && !!video.canPlayType("application/vnd.apple.mpegurl");
    const HlsCtor = window.Hls;
    const useHlsJs =
      hls && !canNativeHls && HlsCtor && typeof HlsCtor.isSupported === "function" && HlsCtor.isSupported();

    try {
      const host = new URL(abs).hostname;
      if (fileNameEl instanceof HTMLElement) fileNameEl.textContent = host || abs;
    } catch (_) {
      if (fileNameEl instanceof HTMLElement) fileNameEl.textContent = abs;
    }

    if (useHlsJs) {
      // The manifest may 404 briefly while FFmpeg starts muxing; retry quickly.
      // A 10 s max wait per attempt made cold loads feel like a fixed 10 s stall.
      const retryPolicy = {
        default: {
          maxTimeToFirstByteMs: 3500,
          maxLoadTimeMs: 18_000,
          timeoutRetry: {
            maxNumRetry: 12,
            retryDelayMs: 350,
            maxRetryDelayMs: 2500,
          },
          errorRetry: { maxNumRetry: 30, retryDelayMs: 400, maxRetryDelayMs: 3500 },
        },
      };
      const instance = new HlsCtor({
        lowLatencyMode: true,
        enableWorker: true,
        // MediaMTX's mpegts playlist can advertise a large TARGETDURATION while
        // carrying shorter segments. Use seconds so hls.js does not drift back
        // several target durations from the live edge.
        liveSyncDuration: 1.5,
        liveMaxLatencyDuration: 5,
        maxLiveSyncPlaybackRate: 1.2,
        maxBufferLength: 24,
        backBufferLength: 18,
        manifestLoadPolicy: retryPolicy,
        playlistLoadPolicy: retryPolicy,
        fragLoadPolicy: retryPolicy,
      });
      liveHasEverPlayed = false;
      liveUserWantsPlaying = startupAutoplay;
      if (startupAutoplay && !video.muted) {
        video.muted = true;
        setMutedUI();
      }
      hlsInstance = instance;
      requestInitialLiveSeek();
      instance.on(HlsCtor.Events.MANIFEST_PARSED, () => {
        setHlsStatus("Live manifest loaded. Starting playback...");
        requestAnimationFrame(() => tryConsumeInitialLiveSeek());
        tryPlayLiveMedia();
        syncPreviewVideoSrc();
        syncLiveButtonUI();
      });
      instance.on(HlsCtor.Events.LEVEL_UPDATED, () => {
        tryConsumeInitialLiveSeek();
        tryPlayLiveMedia();
        syncLiveButtonUI();
      });
      if (HlsCtor.Events && HlsCtor.Events.BUFFER_APPENDED) {
        instance.on(HlsCtor.Events.BUFFER_APPENDED, () => {
          tryConsumeInitialLiveSeek();
          tryPlayLiveMedia();
          syncLiveButtonUI();
        });
      }
      instance.on(HlsCtor.Events.ERROR, (_evt, data) => {
        if (!data) return;
        setHlsStatus(
          `HLS ${data.fatal ? "fatal " : ""}${data.type || "error"}: ${data.details || "unknown"}. Click to retry.`,
        );
        if (!data.fatal) return;
        if (data.type === HlsCtor.ErrorTypes.NETWORK_ERROR) {
          instance.startLoad();
        } else if (data.type === HlsCtor.ErrorTypes.MEDIA_ERROR) {
          instance.recoverMediaError();
        } else {
          detachHlsInstance();
          hasCustomSource = false;
          expectsLiveHlsPlayback = false;
          if (fileNameEl instanceof HTMLElement) {
            fileNameEl.textContent =
              "Live stream unavailable. The broadcaster may be offline.";
          }
        }
      });
      instance.attachMedia(video);
      instance.loadSource(abs);
      video.playbackRate = 1;
      syncPlaybackRateSelect();
      updateTimeDisplay();
      return;
    }

    video.src = abs;
    const onErr = () => {
      video.removeEventListener("error", onErr);
      hasCustomSource = false;
      expectsLiveHlsPlayback = false;
      if (fileNameEl instanceof HTMLElement) {
        fileNameEl.textContent = hls
          ? "Live stream unavailable. The broadcaster may be offline."
          : "Could not play this URL. Try a direct MP4/WebM link, or a YouTube, Vimeo, or Twitch link.";
      }
    };
    video.addEventListener("error", onErr, { once: true });
    video.load();
    syncPreviewVideoSrc();
    video.playbackRate = 1;
    syncPlaybackRateSelect();
    if (hls) requestInitialLiveSeek();
    tryPlayLiveMedia();
    scheduleVodAutoplayWhenReady();
  }

  /**
   * Swaps progressive (non-HLS) file URL and restores playback time — used for quality ladder.
   */
  function switchProgressiveRendition(urlStr) {
    const abs = resolveToAbsoluteHttpUrl(urlStr);
    if (!abs) return;
    if (isHlsUrl(abs)) {
      loadVideoFromHttpUrl(urlStr);
      return;
    }
    const currentAbs = (video.currentSrc || video.src || "").toString();
    if (currentAbs === abs) return;
    const t = video.currentTime;
    const wasPlaying = !video.paused;
    hasCustomSource = true;
    exitYoutubeMode();
    revokeBlobUrl();
    detachHlsInstance();
    video.hidden = false;
    player.dataset.source = "native";
    expectsLiveHlsPlayback = false;
    syncPipVisibility();
    video.src = abs;
    const onErr = () => {
      video.removeEventListener("error", onErr);
      if (fileNameEl instanceof HTMLElement) {
        fileNameEl.textContent =
          "Could not load this quality. Try another or refresh the page.";
      }
    };
    video.addEventListener("error", onErr, { once: true });
    video.addEventListener(
      "loadedmetadata",
      function onMeta() {
        video.removeEventListener("loadedmetadata", onMeta);
        if (Number.isFinite(t) && t > 0) {
          try {
            video.currentTime = t;
          } catch (_) {
            /* seek may be rejected briefly */
          }
        }
        syncPreviewVideoSrc();
        video.playbackRate = 1;
        syncPlaybackRateSelect();
        syncNativeQualitySelectToCurrentVideoUrl();
        updateTimeDisplay();
        if (wasPlaying) {
          video.play().catch(() => {});
        }
      },
      { once: true }
    );
    video.load();
  }

  function closePlaybackRateDropdown() {
    if (playbackRatePanel) playbackRatePanel.hidden = true;
    if (playbackRateTrigger) {
      playbackRateTrigger.setAttribute("aria-expanded", "false");
    }
    if (playbackRateDropdown && playbackRateDropdown.classList) {
      playbackRateDropdown.classList.remove("player__dropdown--open");
    }
  }

  function closeQualityDropdown() {
    if (qualityPanel) qualityPanel.hidden = true;
    if (qualityTrigger) {
      qualityTrigger.setAttribute("aria-expanded", "false");
    }
    if (qualityDropdown && qualityDropdown.classList) {
      qualityDropdown.classList.remove("player__dropdown--open");
    }
  }

  function setQualityOptions(renditions) {
    if (!(qualityWrap instanceof HTMLElement)) {
      return;
    }
    /* Hide only when there are zero options; a single source rendition still shows the pill (label). */
    if (!Array.isArray(renditions) || renditions.length === 0) {
      if (qualitySelectNative instanceof HTMLSelectElement) {
        qualitySelectNative.innerHTML = "";
        qualitySelectNative.hidden = true;
      }
      if (qualityPanel instanceof HTMLElement) qualityPanel.innerHTML = "";
      if (qualityLabel) qualityLabel.textContent = "—";
      qualityWrap.hidden = true;
      closeQualityDropdown();
      return;
    }

    const cur = (video.currentSrc || video.src || "").toString();
    const fromQuery = resolveToAbsoluteHttpUrl(startupSourceFromQuery);
    let bestIdx = 0;

    if (useNativeDropdowns && qualitySelectNative instanceof HTMLSelectElement) {
      qualitySelectNative.innerHTML = "";
      for (let i = 0; i < renditions.length; i++) {
        const r = renditions[i];
        if (!r || !r.label || !r.url) continue;
        const opt = document.createElement("option");
        opt.value = r.url;
        opt.textContent = r.label;
        qualitySelectNative.appendChild(opt);
      }
      if (qualitySelectNative.options.length === 0) {
        qualitySelectNative.hidden = true;
        qualityWrap.hidden = true;
        return;
      }
      for (let j = 0; j < qualitySelectNative.options.length; j++) {
        const oa = resolveToAbsoluteHttpUrl(qualitySelectNative.options[j].value);
        if (oa && (oa === cur || oa === fromQuery)) {
          bestIdx = j;
          break;
        }
      }
      qualitySelectNative.selectedIndex = bestIdx;
      if (qualityLabel && qualitySelectNative.options[bestIdx]) {
        qualityLabel.textContent = qualitySelectNative.options[bestIdx].text;
      }
      qualitySelectNative.hidden = false;
      qualityWrap.hidden = false;
      syncRatePillWidthToZoom();
      return;
    }

    if (
      !(qualityPanel instanceof HTMLElement) ||
      !(qualityLabel instanceof HTMLElement) ||
      !(qualityTrigger instanceof HTMLElement)
    ) {
      return;
    }
    qualityPanel.innerHTML = "";
    for (let i = 0; i < renditions.length; i++) {
      const r = renditions[i];
      if (!r || !r.label || !r.url) continue;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.setAttribute("role", "option");
      btn.className = "player__dropdown-option";
      btn.dataset.url = r.url;
      btn.textContent = r.label;
      qualityPanel.appendChild(btn);
    }
    const options = qualityPanel.querySelectorAll(".player__dropdown-option[data-url]");
    if (options.length === 0) {
      qualityWrap.hidden = true;
      return;
    }
    for (let j = 0; j < options.length; j++) {
      const oa = resolveToAbsoluteHttpUrl(options[j].getAttribute("data-url") || "");
      if (oa && (oa === cur || oa === fromQuery)) {
        bestIdx = j;
        break;
      }
    }
    for (let j = 0; j < options.length; j++) {
      const sel = j === bestIdx;
      options[j].setAttribute("aria-selected", sel ? "true" : "false");
      options[j].classList.toggle("player__dropdown-option--selected", sel);
    }
    if (options[bestIdx]) qualityLabel.textContent = options[bestIdx].textContent;
    qualityWrap.hidden = false;
    syncRatePillWidthToZoom();
  }

  function syncNativeQualitySelectToCurrentVideoUrl() {
    if (!useNativeDropdowns || !(qualitySelectNative instanceof HTMLSelectElement)) {
      return;
    }
    if (qualitySelectNative.options.length === 0) {
      return;
    }
    const cur = (video.currentSrc || video.src || "").toString();
    for (let j = 0; j < qualitySelectNative.options.length; j++) {
      const oa = resolveToAbsoluteHttpUrl(qualitySelectNative.options[j].value);
      if (oa && oa === cur) {
        qualitySelectNative.selectedIndex = j;
        const o = qualitySelectNative.options[j];
        if (qualityLabel && o) {
          qualityLabel.textContent = o.text;
        }
        return;
      }
    }
  }

  function fetchRenditionList(vid) {
    fetch(`/api/videos/${encodeURIComponent(vid)}/renditions`, { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data || !Array.isArray(data.renditions)) return;
        setQualityOptions(data.renditions);
        if (data.transcodePending) {
          window.setTimeout(function () {
            fetchRenditionList(vid);
          }, 2000);
        }
      })
      .catch(() => {
        /* ignore */
      });
  }

  /** A few follow-up fetches so lower rungs can appear while FFmpeg finishes in the background. */
  function tryLoadFromUrlString(raw) {
    const trimmed = String(raw || "").trim();
    if (!trimmed) return;
    const ytId = parseYouTubeVideoId(trimmed);
    if (ytId) {
      loadYouTubeFromId(ytId, `YouTube · ${ytId}`);
      return;
    }
    const vimeoId = parseVimeoVideoId(trimmed);
    if (vimeoId) {
      loadVimeoFromId(vimeoId, `Vimeo · ${vimeoId}`);
      return;
    }
    const twitchTarget = parseTwitchEmbedTarget(trimmed);
    if (twitchTarget) {
      loadTwitchEmbed(twitchTarget);
      return;
    }
    if (!isLikelyDirectVideoUrl(trimmed)) {
      if (fileNameEl instanceof HTMLElement) {
        fileNameEl.textContent =
          "Unsupported URL. Use YouTube, Vimeo, Twitch, or a direct link to a video file (MP4, WebM, …).";
      }
      return;
    }
    loadVideoFromHttpUrl(trimmed);
  }

  function isVideoFile(file) {
    if (!(file instanceof File)) return false;
    if (file.type && file.type.startsWith("video/")) return true;
    return /\.(mp4|webm|mkv|mov|m4v|ogv|ogg|avi|3gp|3g2)$/i.test(file.name);
  }

  function loadVideoFromFile(file) {
    if (!isVideoFile(file)) return;
    hasCustomSource = true;
    expectsLiveHlsPlayback = false;
    exitYoutubeMode();
    revokeBlobUrl();
    detachHlsInstance();
    blobUrl = URL.createObjectURL(file);
    video.src = blobUrl;
    if (fileNameEl instanceof HTMLElement) fileNameEl.textContent = file.name;
    video.load();
    syncPreviewVideoSrc();
    video.playbackRate = 1;
    syncPlaybackRateSelect();
    syncPipVisibility();
    video.play().catch(() => {});
  }

  function loadVideoFromNativePayload(payload) {
    if (!payload || !payload.url) return;
    hasCustomSource = true;
    expectsLiveHlsPlayback = isHlsUrl(payload.url);
    exitYoutubeMode();
    revokeBlobUrl();
    detachHlsInstance();
    video.src = payload.url;
    if (fileNameEl instanceof HTMLElement) {
      fileNameEl.textContent = payload.displayName || "";
    }
    video.load();
    syncPreviewVideoSrc();
    video.playbackRate = 1;
    syncPlaybackRateSelect();
    syncPipVisibility();
    if (expectsLiveHlsPlayback) requestInitialLiveSeek();
    tryPlayLiveMedia();
    scheduleVodAutoplayWhenReady();
  }

  /** True while the OS launch queue is still delivering file handle(s). */
  let pendingOsFileOpen = false;

  /** True when any pointer is inside `#player` (mouse hover / finger over player). */
  let pointerInsidePlayer = false;

  if ("launchQueue" in window && typeof window.launchQueue.setConsumer === "function") {
    window.launchQueue.setConsumer(async (launchParams) => {
      pendingOsFileOpen = true;
      try {
        let raw = launchParams.files;
        if (raw && typeof raw.then === "function") raw = await raw;
        if (!raw) return;

        if (typeof raw[Symbol.asyncIterator] === "function") {
          for await (const handle of raw) {
            const file = await handle.getFile();
            if (isVideoFile(file)) {
              loadVideoFromFile(file);
              return;
            }
          }
          return;
        }

        const list = Array.isArray(raw) ? raw : Array.from(raw);
        for (const handle of list) {
          const file = await handle.getFile();
          if (isVideoFile(file)) {
            loadVideoFromFile(file);
            return;
          }
        }
      } catch (_) {
        /* ignore */
      } finally {
        pendingOsFileOpen = false;
      }
    });
  }

  function applyDemoSampleIfNeeded() {
    if (isExternalEmbedSource()) return;
    if (startupHostBridge) return;
    if (hasCustomSource || pendingOsFileOpen || pendingNativeInitial || blobUrl) return;
    if (video.currentSrc) return;
    expectsLiveHlsPlayback = false;
    video.src = DEMO_SAMPLE_URL;
    if (fileNameEl instanceof HTMLElement) fileNameEl.textContent = "";
    video.load();
    syncPreviewVideoSrc();
    syncPlaybackRateSelect();
    applyZoomTransform();
    updateTimeDisplay();
    video.play().catch(() => {});
    setState(!video.paused);
  }

  window.addEventListener("load", () => {
    applyEmbedMode();
    if (startupSourceFromQuery) {
      if (urlInput instanceof HTMLInputElement) {
        urlInput.value = startupSourceFromQuery;
      }
      tryLoadFromUrlString(startupSourceFromQuery);
    }
    if (startupVideoId) {
      fetchRenditionList(startupVideoId);
    }
    applyDemoSampleIfNeeded();
    window.setTimeout(applyDemoSampleIfNeeded, 350);
  });

  function syncPreviewVideoSrc() {
    if (hlsInstance) {
      // hls.js drives a MediaSource blob URL that only the main <video> can read.
      previewVideo.removeAttribute("src");
      previewVideo.load();
      return;
    }
    const src = video.currentSrc || video.src;
    if (!src) {
      previewVideo.removeAttribute("src");
      previewVideo.load();
      return;
    }
    if (previewVideo.src === src) return;
    previewVideo.src = src;
    previewVideo.load();
  }

  function clearPreviewCanvas() {
    const ctx = previewCanvas.getContext("2d");
    ctx.clearRect(0, 0, PREVIEW_W, PREVIEW_H);
  }

  /** Thumbnail only; the hover timestamp is updated from the pointer (`formatTime(t)`) so it tracks immediately. */
  function drawPreviewCanvas() {
    const ctx = previewCanvas.getContext("2d");
    if (!previewVideo.videoWidth) return;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    try {
      ctx.drawImage(previewVideo, 0, 0, PREVIEW_W, PREVIEW_H);
    } catch (_) {
      ctx.fillStyle = "#222";
      ctx.fillRect(0, 0, PREVIEW_W, PREVIEW_H);
    }
  }

  function setScrubPreviewVisible(show) {
    scrubPreviewActive = show;
    scrubPreview.hidden = !show;
    if (!show) {
      previewDesiredTime = null;
      previewSeekInFlight = false;
      previewSeekGen += 1;
      if (previewSeekRaf != null) {
        cancelAnimationFrame(previewSeekRaf);
        previewSeekRaf = null;
      }
    }
  }

  function hideScrubPreview() {
    setScrubPreviewVisible(false);
    clearPreviewCanvas();
    lastPreviewClientX = null;
    scrubPreview.style.removeProperty("--scrub-preview-w");
    scrubPreview.style.removeProperty("--scrub-preview-h");
  }

  function ensureScrubPreviewVisible() {
    if (scrubPreviewActive) return;
    setScrubPreviewVisible(true);
    clearPreviewCanvas();
    if (previewTimeEl instanceof HTMLElement) previewTimeEl.textContent = "";
  }

  /** Progress track plus a few pixels so preview still shows when hovering slightly off the bar. */
  const SCRUB_HIT_PAD_PX = 6;

  function isPointOverScrubHitZone(clientX, clientY) {
    const r = progress.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    const p = SCRUB_HIT_PAD_PX;
    return (
      clientX >= r.left - p &&
      clientX <= r.right + p &&
      clientY >= r.top - p &&
      clientY <= r.bottom + p
    );
  }

  /** While scrubbing, touch often leaves the thin hit strip vertically; still map X to the track. */
  function clampClientXToProgressWrap(clientX) {
    const rect = progressWrap.getBoundingClientRect();
    if (rect.width <= 0) return clientX;
    return Math.min(rect.right, Math.max(rect.left, clientX));
  }

  function syncScrubPreviewToPointer(clientX, clientY) {
    if (isExternalEmbedSource()) {
      if (scrubPreviewActive) hideScrubPreview();
      return;
    }
    const durOk = getEffectiveDuration() != null;
    const scrubbing = player.dataset.scrubbing === "true";
    if (!durOk) {
      if (scrubPreviewActive && !scrubbing) hideScrubPreview();
      return;
    }
    const over = isPointOverScrubHitZone(clientX, clientY);
    /* Coarse/touch: only show preview while scrubbing (touch began on the bar), not when a
       vertical swipe merely crosses the hit zone. Mouse keeps hover-to-preview. */
    const showFromHover = over && !usesCoarsePrimaryPointer;
    /*
     * Mobile scrubbing UX: hide preview immediately once the finger leaves the progress hit zone.
     * Desktop keeps preview while scrubbing, even slightly outside, for easier precision.
     */
    const showWhileScrubbing = scrubbing && (!usesCoarsePrimaryPointer || over);
    if (showWhileScrubbing || showFromHover) {
      if (!scrubPreviewActive) {
        setScrubPreviewVisible(true);
        clearPreviewCanvas();
        if (previewTimeEl instanceof HTMLElement) previewTimeEl.textContent = "";
      }
      const cx = scrubbing ? clampClientXToProgressWrap(clientX) : clientX;
      updateScrubPreviewFromClientX(cx);
    } else if (scrubPreviewActive) {
      hideScrubPreview();
    }
  }

  function endProgressScrubIfNeeded(e) {
    if (player.dataset.scrubbing !== "true") return;
    if (
      e instanceof PointerEvent &&
      scrubPointerId != null &&
      e.pointerId !== scrubPointerId
    ) {
      return;
    }
    let endClientX;
    let endClientY;
    if (e instanceof TouchEvent && e.changedTouches.length) {
      const tid = scrubTouchId;
      for (let i = 0; i < e.changedTouches.length; i += 1) {
        const t = e.changedTouches[i];
        if (tid == null || t.identifier === tid) {
          endClientX = t.clientX;
          endClientY = t.clientY;
          break;
        }
      }
    } else if (e instanceof PointerEvent) {
      endClientX = e.clientX;
      endClientY = e.clientY;
    }
    stopProgressScrubState();
    if (usesCoarsePrimaryPointer) {
      hideScrubPreview();
      return;
    }
    if (
      endClientX != null &&
      endClientY != null &&
      !isPointOverScrubHitZone(endClientX, endClientY)
    ) {
      hideScrubPreview();
    }
  }

  function releaseScrubPointerCapture() {
    const capId = scrubPointerId;
    if (capId == null) return;
    try {
      if (progress.hasPointerCapture(capId)) {
        progress.releasePointerCapture(capId);
      }
    } catch (_) {
      /* ignore */
    }
  }

  function stopProgressScrubState() {
    releaseScrubPointerCapture();
    scrubPointerId = null;
    scrubTouchId = null;
    player.dataset.scrubbing = "false";
    syncProgressFromVideo();
    armChromeIdleTimer();
  }

  function timeAtProgressClientX(clientX) {
    const rect = progressWrap.getBoundingClientRect();
    if (rect.width <= 0) return null;
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const end = getEffectiveDuration();
    if (end == null) return null;
    const start = isLiveStream() ? (getSeekableStartTime() ?? 0) : 0;
    return start + ratio * (end - start);
  }

  /**
   * Size and place the scrub preview inside the player. Width uses the same cap as mid-track
   * (vertical space, track width, player width) — it does not shrink when the pointer is near the
   * ends; only horizontal position shifts until the pointer moves inward.
   */
  function layoutScrubPreviewAtRatio(ratio) {
    const wrap = progressWrap.getBoundingClientRect();
    const pr = player.getBoundingClientRect();
    if (wrap.width <= 0) return;

    const pw = wrap.width;
    const r = Math.min(1, Math.max(0, ratio));
    const playerPad = 4;

    const spaceAbove = wrap.top - pr.top - 8;
    let timeBlock = 22;
    if (previewTimeEl instanceof HTMLElement && scrubPreviewActive) {
      const th = Math.ceil(previewTimeEl.getBoundingClientRect().height);
      if (th > 0) timeBlock = th;
    }
    const gap = 4;
    const maxCanvasH = Math.max(24, spaceAbove - gap - timeBlock);
    const maxWVert = maxCanvasH * (16 / 9);

    const maxWTrack = pw * 0.98;
    const maxWPlayer = Math.max(1, pr.width - 2 * playerPad);
    let w = Math.floor(Math.min(160, maxWVert, maxWTrack, maxWPlayer));
    w = Math.max(24, w);

    let lo;
    let hi;
    for (;;) {
      const minCWrap = w / 2;
      const maxCWrap = pw - w / 2;
      const minCPlayer = pr.left + playerPad + w / 2 - wrap.left;
      const maxCPlayer = pr.right - playerPad - w / 2 - wrap.left;
      lo = Math.max(minCWrap, minCPlayer);
      hi = Math.min(maxCWrap, maxCPlayer);
      if (lo <= hi || w <= 24) break;
      w -= 4;
    }

    const centerPx = lo <= hi ? Math.min(Math.max(r * pw, lo), hi) : pw / 2;
    const xPct = (centerPx / pw) * 100;
    scrubPreview.style.left = `${xPct}%`;
    const h = Math.round((w * 9) / 16);
    scrubPreview.style.setProperty("--scrub-preview-w", `${w}px`);
    scrubPreview.style.setProperty("--scrub-preview-h", `${h}px`);
  }

  function positionScrubPreview(clientX) {
    const rect = progressWrap.getBoundingClientRect();
    if (rect.width <= 0) return;
    lastPreviewClientX = clientX;
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    layoutScrubPreviewAtRatio(ratio);
  }

  function schedulePreviewSeek(t) {
    previewDesiredTime = t;
    if (previewSeekRaf != null) return;
    previewSeekRaf = requestAnimationFrame(() => {
      previewSeekRaf = null;
      attemptPreviewSeek();
    });
  }

  /**
   * One seek at a time on the hidden preview element (same idea as `stepByFrame`): fast hovers
   * update `previewDesiredTime` and the pipeline drains after each `seeked` without overlapping
   * `currentTime` assignments that confuse the decoder.
   */
  function attemptPreviewSeek() {
    if (!scrubPreviewActive || previewDesiredTime == null) return;
    const dur = previewVideo.duration;
    if (!Number.isFinite(dur) || dur <= 0) return;

    const want = Math.min(Math.max(0, previewDesiredTime), dur - 1e-3);

    if (previewSeekInFlight) return;

    if (Math.abs(previewVideo.currentTime - want) < 0.02) {
      drawPreviewCanvas();
      return;
    }

    previewSeekInFlight = true;
    previewSeekInFlightGen = (previewSeekGen += 1);
    try {
      previewVideo.currentTime = want;
    } catch (_) {
      previewSeekInFlight = false;
    }
  }

  function updateScrubPreviewFromClientX(clientX) {
    const t = timeAtProgressClientX(clientX);
    if (t == null) return;
    lastScrubTime = t;
    if (previewTimeEl instanceof HTMLElement) {
      const elapsedMs = isLiveStream() ? getElapsedMsAtVideoTime(t) : null;
      previewTimeEl.textContent = elapsedMs != null ? formatTime(elapsedMs / 1000) : formatTime(t);
    }
    positionScrubPreview(clientX);
    schedulePreviewSeek(t);
    /* Touch scrub uses document `touchmove` + preventDefault so the native range does not emit
       `input`; keep the thumb and main video in sync with the pointer. */
    if (player.dataset.scrubbing === "true") {
      const dur = getEffectiveDuration();
      if (dur != null) {
        const ratio = Math.min(1, Math.max(0, t / dur));
        progress.value = String(Math.round(ratio * 1000));
        syncProgressRailFill();
        video.currentTime = t;
        updateTimeDisplay();
      }
    }
  }

  function updateScrubPreviewFromRatio(ratio) {
    const end = getEffectiveDuration();
    if (end == null) return;
    const clamped = Math.min(1, Math.max(0, ratio));
    const start = isLiveStream() ? (getSeekableStartTime() ?? 0) : 0;
    const t = start + clamped * (end - start);
    lastScrubTime = t;
    if (previewTimeEl instanceof HTMLElement) {
      const elapsedMs = isLiveStream() ? getElapsedMsAtVideoTime(t) : null;
      previewTimeEl.textContent = elapsedMs != null ? formatTime(elapsedMs / 1000) : formatTime(t);
    }
    const rect = progressWrap.getBoundingClientRect();
    lastPreviewClientX = rect.left + clamped * rect.width;
    layoutScrubPreviewAtRatio(clamped);
    schedulePreviewSeek(t);
  }

  previewVideo.addEventListener("loadedmetadata", () => {
    if (scrubPreviewActive) schedulePreviewSeek(lastScrubTime);
  });

  previewVideo.addEventListener("seeked", () => {
    if (!scrubPreviewActive) {
      previewSeekInFlight = false;
      return;
    }
    const doneGen = previewSeekInFlightGen;
    previewSeekInFlight = false;
    // Same rhythm as frame-step UI: paint after seeked, then chain the next pending target on rAF.
    requestAnimationFrame(() => {
      if (!scrubPreviewActive) return;
      if (doneGen === previewSeekGen) drawPreviewCanvas();
      requestAnimationFrame(() => {
        if (!scrubPreviewActive) return;
        attemptPreviewSeek();
      });
    });
  });

  /** Wall-clock style with milliseconds (1/1000 s). */
  function formatTime(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return "0:00.000";
    const msTotal = Math.round(seconds * 1000);
    const ms = msTotal % 1000;
    const totalS = Math.floor(msTotal / 1000);
    const s = totalS % 60;
    const m = Math.floor(totalS / 60) % 60;
    const h = Math.floor(totalS / 3600);
    const pad = (n) => String(n).padStart(2, "0");
    const padMs = (n) => String(n).padStart(3, "0");
    const dec = `.${padMs(ms)}`;
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}${dec}` : `${m}:${pad(s)}${dec}`;
  }

  function updateTimeDisplay() {
    const cur = video.currentTime;
    const dur = video.duration;
    const live = isLiveStream() || dur === Infinity;
    if (live) {
      // When the host supplies `startedAt`, use Date.now() - startedAt so the
      // counter always reflects real wall-clock broadcast runtime regardless of
      // how far behind the live edge the viewer is buffering.
      if (startupStartedAtMs != null) {
        const elapsedMs = getElapsedMsAtVideoTime(video.currentTime);
        timeDisplay.textContent = formatTime(elapsedMs / 1000);
        return;
      }
      // Fallback: PDT-based elapsed / live-edge duration (no startedAt supplied).
      const elapsedMs = getLiveElapsedMs();
      const durMs = getLiveDurationMs();
      if (elapsedMs != null && durMs != null) {
        timeDisplay.textContent = `${formatTime(elapsedMs / 1000)} / ${formatTime(durMs / 1000)}`;
        return;
      }
      const edge = getSeekableEndTime() ?? getHlsLiveSyncTime();
      if (edge != null && Number.isFinite(edge) && edge > 0) {
        timeDisplay.textContent = `${formatTime(cur)} / ${formatTime(edge)}`;
      } else {
        timeDisplay.textContent = formatTime(cur);
      }
      return;
    }
    timeDisplay.textContent = `${formatTime(cur)} / ${formatTime(dur)}`;
  }

  /**
   * While a live stream is playing, the wall-clock display needs to update at
   * visual cadence (~60fps), not at the ~4Hz rate of the `timeupdate` event.
   * We run a rAF loop only for live playback so paused / non-live pages don't
   * pay the overhead. The loop self-terminates on pause/non-live.
   */
  let liveClockRaf = null;
  function startLiveClock() {
    if (liveClockRaf != null) return;
    const step = () => {
      liveClockRaf = null;
      if (video.paused || !isLiveStream()) return;
      updateTimeDisplay();
      liveClockRaf = requestAnimationFrame(step);
    };
    liveClockRaf = requestAnimationFrame(step);
  }
  function stopLiveClock() {
    if (liveClockRaf != null) {
      cancelAnimationFrame(liveClockRaf);
      liveClockRaf = null;
    }
  }

  function syncProgressRailFill() {
    const max = Number(progress.max);
    const v = Number(progress.value);
    const denom = Number.isFinite(max) && max > 0 ? max : 1000;
    const ratio = Math.min(1, Math.max(0, v / denom));
    if (progressWrap instanceof HTMLElement) {
      progressWrap.style.setProperty("--progress-fill", String(ratio));
    }
  }

  function syncProgressFromVideo() {
    const end = getEffectiveDuration();
    if (end == null) {
      progress.value = 0;
      syncProgressRailFill();
      return;
    }
    const start = isLiveStream() ? (getSeekableStartTime() ?? 0) : 0;
    const span = end - start;
    const ratio = span > 0 ? (video.currentTime - start) / span : 0;
    progress.value = String(Math.round(Math.max(0, Math.min(1, ratio)) * 1000));
    syncProgressRailFill();
  }

  function setState(playing) {
    player.dataset.state = playing ? "playing" : "paused";
    playPause.setAttribute("aria-label", playing ? "Pause" : "Play");
    playPause.dataset.tooltip = playing
      ? "Pause (Space)"
      : "Play (Space)";
  }

  function setMutedUI() {
    const silentByGain =
      webAudioVolumeRoute &&
      webAudioGain &&
      !video.muted &&
      !video.paused &&
      webAudioGain.gain.value <= 0.0005;
    player.dataset.muted =
      video.muted || (!webAudioVolumeRoute && video.volume === 0) || silentByGain
        ? "true"
        : "false";
    muteBtn.setAttribute("aria-label", video.muted ? "Unmute" : "Mute");
    muteBtn.dataset.tooltip = video.muted ? "Unmute (M)" : "Mute (M)";
  }

  const PLAYBACK_RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3];
  /** Same rates on touch / no-hover as desktop (0.25×–3×); revisit if pitch/skip artifacts return on mobile WebKit. */
  const ACTIVE_PLAYBACK_RATES = PLAYBACK_RATES;

  if (!useNativeDropdowns && playbackRatePanel instanceof HTMLElement) {
    for (const rate of ACTIVE_PLAYBACK_RATES) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.setAttribute("role", "option");
      btn.className = "player__dropdown-option";
      btn.setAttribute("data-rate", String(rate));
      btn.textContent = `${rate}×`;
      const sel = Math.abs(rate - 1) < 0.0001;
      btn.setAttribute("aria-selected", sel ? "true" : "false");
      if (sel) btn.classList.add("player__dropdown-option--selected");
      playbackRatePanel.appendChild(btn);
    }
  }

  /**
   * Mobile browsers can produce audible skip/repeat artifacts with pitch correction enabled while
   * changing playback speed. Prefer natural pitch-shift there for smoother time stretching.
   */
  function applyPlaybackPitchPolicy() {
    if (!(video instanceof HTMLMediaElement)) return;
    const preserve = true;
    if ("preservesPitch" in video) {
      video.preservesPitch = preserve;
    }
    if ("webkitPreservesPitch" in video) {
      video.webkitPreservesPitch = preserve;
    }
    if ("mozPreservesPitch" in video) {
      video.mozPreservesPitch = preserve;
    }
  }

  function nearestPlaybackRate(v) {
    let best = ACTIVE_PLAYBACK_RATES[0];
    for (let i = 1; i < ACTIVE_PLAYBACK_RATES.length; i += 1) {
      if (Math.abs(ACTIVE_PLAYBACK_RATES[i] - v) < Math.abs(best - v)) {
        best = ACTIVE_PLAYBACK_RATES[i];
      }
    }
    return best;
  }

  function applyPlaybackRate(nextRate) {
    const safeRate = nearestPlaybackRate(nextRate);
    applyPlaybackPitchPolicy();
    video.defaultPlaybackRate = safeRate;
    video.playbackRate = safeRate;
    return safeRate;
  }

  function syncPlaybackRateOptionsUI() {
    if (useNativeDropdowns && playbackRateNative instanceof HTMLSelectElement) {
      for (let i = 0; i < playbackRateNative.options.length; i++) {
        playbackRateNative.options[i].disabled = false;
        playbackRateNative.options[i].hidden = false;
      }
      return;
    }
    if (!playbackRatePanel) return;
    for (const el of playbackRatePanel.querySelectorAll("[data-rate]")) {
      /* Keep every speed visible; actual rate is still clamped via `nearestPlaybackRate` / `applyPlaybackRate`. */
      if (el instanceof HTMLButtonElement) {
        el.disabled = false;
        el.hidden = false;
      }
    }
  }

  function playbackRateIndex() {
    const cur = video.playbackRate;
    let bestI = 0;
    for (let i = 1; i < ACTIVE_PLAYBACK_RATES.length; i += 1) {
      if (
        Math.abs(ACTIVE_PLAYBACK_RATES[i] - cur) <
        Math.abs(ACTIVE_PLAYBACK_RATES[bestI] - cur)
      ) {
        bestI = i;
      }
    }
    return bestI;
  }

  function setPlaybackRateSelectUI() {
    const exact = nearestPlaybackRate(video.playbackRate);
    if (useNativeDropdowns && playbackRateNative instanceof HTMLSelectElement) {
      playbackRateNative.value = String(exact);
      if (playbackRateLabel) {
        playbackRateLabel.textContent = `${exact}×`;
      }
      return;
    }
    if (!(playbackRateLabel instanceof HTMLElement) || !playbackRatePanel) {
      return;
    }
    playbackRateLabel.textContent = `${exact}×`;
    for (const el of playbackRatePanel.querySelectorAll("[data-rate]")) {
      const v = Number(el.getAttribute("data-rate"));
      const sel = Math.abs(v - exact) < 0.0001;
      el.setAttribute("aria-selected", sel ? "true" : "false");
      el.classList.toggle("player__dropdown-option--selected", sel);
    }
  }

  function syncPlaybackRateSelect() {
    setPlaybackRateSelectUI();
    requestAnimationFrame(() => syncRatePillWidthToZoom());
  }

  function nudgePlaybackRate(deltaSteps) {
    const i = Math.max(
      0,
      Math.min(
        ACTIVE_PLAYBACK_RATES.length - 1,
        playbackRateIndex() + deltaSteps
      )
    );
    const next = applyPlaybackRate(ACTIVE_PLAYBACK_RATES[i]);
    setPlaybackRateSelectUI();
    requestAnimationFrame(() => syncRatePillWidthToZoom());
  }

  if (!useNativeDropdowns) {
    if (playbackRateTrigger) {
      playbackRateTrigger.addEventListener("click", (e) => {
        e.stopPropagation();
        if (!playbackRatePanel) return;
        const open = playbackRatePanel.hidden;
        if (open) {
          closeQualityDropdown();
          hidePlayerTooltip();
          playbackRatePanel.hidden = false;
          playbackRateTrigger.setAttribute("aria-expanded", "true");
          if (playbackRateDropdown) playbackRateDropdown.classList.add("player__dropdown--open");
        } else {
          closePlaybackRateDropdown();
        }
      });
    }
    if (playbackRatePanel) {
      playbackRatePanel.addEventListener("click", (e) => {
        const raw = e.target;
        if (!(raw instanceof Element)) return;
        const btn = raw.closest("[data-rate]");
        if (!btn) return;
        e.preventDefault();
        const v = Number(btn.getAttribute("data-rate"));
        if (!Number.isFinite(v)) return;
        applyPlaybackRate(v);
        setPlaybackRateSelectUI();
        closePlaybackRateDropdown();
      });
    }
    if (qualityTrigger && qualityPanel) {
      qualityTrigger.addEventListener("click", (e) => {
        e.stopPropagation();
        if (qualityPanel.hidden) {
          closePlaybackRateDropdown();
          hidePlayerTooltip();
          qualityPanel.hidden = false;
          qualityTrigger.setAttribute("aria-expanded", "true");
          if (qualityDropdown) qualityDropdown.classList.add("player__dropdown--open");
        } else {
          closeQualityDropdown();
        }
      });
    }
    if (qualityPanel) {
      qualityPanel.addEventListener("click", (e) => {
        const raw = e.target;
        if (!(raw instanceof Element)) return;
        const btn = raw.closest(".player__dropdown-option[data-url]");
        if (!btn) return;
        e.preventDefault();
        const url = btn.getAttribute("data-url");
        if (url) switchProgressiveRendition(url);
        if (qualityLabel) qualityLabel.textContent = (btn.textContent || "").trim() || "—";
        for (const el of qualityPanel.querySelectorAll(".player__dropdown-option[data-url]")) {
          const sel = el === btn;
          el.setAttribute("aria-selected", sel ? "true" : "false");
          el.classList.toggle("player__dropdown-option--selected", sel);
        }
        closeQualityDropdown();
      });
    }
    document.addEventListener("pointerdown", (e) => {
      if (!(e.target instanceof Node)) return;
      if (playbackRateDropdown && playbackRateDropdown.contains(e.target)) return;
      if (qualityDropdown && qualityDropdown.contains(e.target)) return;
      closePlaybackRateDropdown();
      closeQualityDropdown();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape" && e.code !== "Escape") return;
      closePlaybackRateDropdown();
      closeQualityDropdown();
    });
  } else {
    if (playbackRateNative) {
      playbackRateNative.addEventListener("change", () => {
        const v = Number(playbackRateNative.value);
        if (Number.isFinite(v)) {
          applyPlaybackRate(v);
        }
      });
    }
    if (qualitySelectNative) {
      qualitySelectNative.addEventListener("change", () => {
        const url = qualitySelectNative.value;
        if (url) {
          switchProgressiveRendition(url);
        }
        const o = qualitySelectNative.options[qualitySelectNative.selectedIndex];
        if (o && qualityLabel) {
          qualityLabel.textContent = o.text;
        }
      });
    }
  }

  wireHeldChromeButton(rateDownBtn, () => nudgePlaybackRate(-1));
  wireHeldChromeButton(rateUpBtn, () => nudgePlaybackRate(1));

  function targetIsFrameStepControl(node) {
    if (!(node instanceof Node)) return false;
    if (frameBackBtn instanceof Node && frameBackBtn.contains(node)) return true;
    if (frameForwardBtn instanceof Node && frameForwardBtn.contains(node)) return true;
    return false;
  }

  function wireFrameStepButton(btn, direction) {
    if (!(btn instanceof HTMLElement)) return;
    btn.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      try {
        btn.setPointerCapture(e.pointerId);
      } catch (_) {
        /* ignore */
      }
      lastFrameStepViaPointer = true;
      if (direction < 0) {
        framePointerHeldBack = true;
        framePointerHoldRepeatReadyBack = false;
      } else {
        framePointerHeldForward = true;
        framePointerHoldRepeatReadyForward = false;
      }
      const holdDelayMs =
        e.pointerType === "touch"
          ? FRAME_HOLD_REPEAT_DELAY_MS + FRAME_POINTER_HOLD_REPEAT_EXTRA_MS_TOUCH
          : FRAME_HOLD_REPEAT_DELAY_MS;
      armPointerFrameHoldRepeat(direction, holdDelayMs);
      stepByFrame(direction);
    });
    btn.addEventListener("click", (e) => {
      if (lastFrameStepViaPointer) {
        lastFrameStepViaPointer = false;
        return;
      }
      stepByFrame(direction);
    });
    btn.addEventListener("lostpointercapture", () => {
      disarmPointerFrameHoldRepeat(direction);
      if (direction < 0) framePointerHeldBack = false;
      else framePointerHeldForward = false;
      bumpChromeActivity();
    });
    btn.addEventListener("keydown", (e) => {
      if (e.key === " " || e.key === "Enter") lastFrameStepViaPointer = false;
    });
  }

  wireFrameStepButton(frameBackBtn, -1);
  wireFrameStepButton(frameForwardBtn, 1);

  document.addEventListener(
    "pointerdown",
    (e) => {
      if (targetIsFrameStepControl(e.target)) return;
      lastFrameStepViaPointer = false;
    },
    true
  );

  if (goLiveBtn instanceof HTMLElement) {
    goLiveBtn.addEventListener("click", () => {
      if (!isLiveStream()) return;
      // Treat the LIVE button as a full sync: drop whatever the player is
      // currently loading from (which may be a stale playlist window after a
      // pause, a long tab-hidden period, or a brief network hiccup), refetch
      // from the newest fragment, then snap to the edge and resume playback.
      // This is what makes the button behave the same whether we're already at
      // the edge, a few seconds behind, or recovering from a stall.
      if (hlsInstance) {
        try {
          hlsInstance.stopLoad();
          // `startLoad(-1)` tells hls.js to pick the freshest fragment from the
          // next manifest refresh instead of resuming at its old position.
          hlsInstance.startLoad(-1);
        } catch (_) {
          /* noop: fall through to the seek path below */
        }
      }
      requestInitialLiveSeek();
      seekToLiveEdge();
      if (video.paused) {
        attemptPlayWithAutoplayMuteFallback({ live: true });
      }
      syncLiveButtonUI();
      updateTimeDisplay();
      bumpChromeActivity();
    });
  }

  window.addEventListener(
    "pointerup",
    (e) => {
      if (e.button !== 0) return;
      disarmPointerFrameHoldRepeat(-1);
      disarmPointerFrameHoldRepeat(1);
      framePointerHeldBack = false;
      framePointerHeldForward = false;
      disarmAllChromePointerHolds();
      // Do not clear `lastFrameStepViaPointer` here (or in rAF): on mobile WebKit the next
      // animation frame often runs before the synthesized `click`, so the click handler
      // would see a false flag and `stepByFrame` twice per tap. The flag is cleared in the
      // frame button `click` handler when suppressing the duplicate; stale state is reset
      // via `pointerdown` elsewhere and Space/Enter on the buttons (see below).
      requestAnimationFrame(() => {
        bumpChromeActivity();
      });
    },
    true
  );

  video.addEventListener("ratechange", () => {
    applyPlaybackPitchPolicy();
    syncPlaybackRateSelect();
  });

  video.addEventListener("timeupdate", () => {
    if (player.dataset.scrubbing !== "true") syncProgressFromVideo();
    updateTimeDisplay();
    syncLiveButtonUI();
  });

  video.addEventListener("loadedmetadata", () => {
    framePeriodSamples.length = 0;
    lastMediaTime = null;
    applyPlaybackPitchPolicy();
    syncPreviewVideoSrc();
    syncPlaybackRateSelect();
    updateTimeDisplay();
    syncProgressFromVideo();
    // Native HLS (Safari / hls.js not in use): jump to live edge on first load.
    if (!hlsInstance && isLiveDuration()) {
      requestInitialLiveSeek();
      tryConsumeInitialLiveSeek();
    }
    tryConsumeInitialLiveSeek();
    tryPlayLiveMedia();
    syncLiveButtonUI();
  });

  video.addEventListener("loadeddata", () => {
    tryConsumeInitialLiveSeek();
    tryPlayLiveMedia();
    syncLiveButtonUI();
  });

  video.addEventListener("canplay", () => {
    tryConsumeInitialLiveSeek();
    tryPlayLiveMedia();
    syncLiveButtonUI();
  });

  video.addEventListener("playing", () => {
    clearHlsStatus();
    if (isLiveStream()) {
      liveHasEverPlayed = true;
      // Mirror the user's intent: once the stream is actually playing, record
      // that playback is desired so stall-recovery retries work automatically.
      liveUserWantsPlaying = true;
      if (frameBackBtn instanceof HTMLElement) frameBackBtn.hidden = true;
      if (frameForwardBtn instanceof HTMLElement) frameForwardBtn.hidden = true;
    }
    tryConsumeInitialLiveSeek();
    syncLiveButtonUI();
    startLiveClock();
  });

  video.addEventListener("durationchange", syncLiveButtonUI);
  video.addEventListener("progress", syncLiveButtonUI);

  // After a seek completes, retry play() for live streams when the user wants
  // to be playing. This recovers the common Chrome stuck-state where play() is
  // called concurrently with a seek (seekToLiveEdge) and gets aborted — by the
  // time "seeked" fires the position is correct and hls.js has usually already
  // appended data there.
  video.addEventListener("seeked", () => {
    if (player.dataset.scrubbing === "true") return;
    if (isLiveStream() && liveUserWantsPlaying) {
      tryPlayLiveMedia();
    }
  });

  // Chrome-specific: when the MSE buffer runs dry at currentTime, Chrome can
  // leave the video in a "playing but frozen" state (fires `waiting`, not
  // `pause`). Kick hls.js to start loading from the current position if it has
  // gone idle, so BUFFER_APPENDED fires and unblocks playback.
  video.addEventListener("waiting", () => {
    if (!isLiveStream() || !liveUserWantsPlaying) return;
    setHlsStatus("Chrome is waiting for live media. Click to retry playback.");
    if (hlsInstance) {
      try {
        hlsInstance.startLoad(video.currentTime);
      } catch (_) {}
    }
  });

  video.addEventListener("error", () => {
    if (!isLiveStream()) return;
    setHlsStatus(`Media error: ${describeMediaError() || "unknown"}. Click to retry.`);
  });

  video.addEventListener("play", () => {
    setState(true);
    lastMediaTime = null;
    startFramePeriodMeasure();
    startLiveClock();
    if (webAudioVolumeRoute && webAudioCtx) {
      void webAudioCtx.resume();
      /* Pause may zero gain to flush buffered samples; restore loudness when playing again. */
      setWebAudioOutputGainFromControls();
    }
  });

  video.addEventListener("pause", () => {
    setState(false);
    stopFramePeriodMeasure();
    stopLiveClock();
    /*
     * Mobile WebKit: `MediaElementAudioSourceNode` can keep playing decoded audio briefly
     * after `video.pause()`. Force the gain to zero immediately so pause feels silent.
     */
    if (webAudioVolumeRoute && webAudioGain && webAudioCtx) {
      try {
        webAudioGain.gain.setValueAtTime(0, webAudioCtx.currentTime);
      } catch (_) {
        webAudioGain.gain.value = 0;
      }
    }
  });

  video.addEventListener("volumechange", () => {
    if (!webAudioVolumeRoute) {
      volumeSlider.value = String(video.volume);
    }
    setMutedUI();
  });

  function togglePlay() {
    if (video.paused) {
      if (isLiveStream()) {
        liveUserWantsPlaying = true;
        // Do NOT call stopLoad()+startLoad(-1) here. On Chrome that sequence
        // aggressively resets the MSE SourceBuffer and races with play(), causing
        // spurious `pause` events and blocking the muted-autoplay fallback.
        // hls.js detects the seeking event from seekToLiveEdge() automatically
        // and adjusts its load position. The LIVE button uses the full reset
        // for the genuine "far behind live" recovery case.
        requestInitialLiveSeek();
        seekToLiveEdge();
        attemptPlayWithAutoplayMuteFallback({ live: true });
        syncLiveButtonUI();
        updateTimeDisplay();
      } else {
        video.play().catch(() => {});
      }
    } else {
      liveUserWantsPlaying = false;
      video.pause();
    }
  }

  playPause.addEventListener("click", togglePlay);

  function blockNativeVideoDrag(e) {
    e.preventDefault();
  }

  video.addEventListener("dragstart", blockNativeVideoDrag);
  videoViewport.addEventListener("dragstart", blockNativeVideoDrag);
  zoomLayer.addEventListener("dragstart", blockNativeVideoDrag);

  function syncPinchChromeSuppression() {
    const suppress =
      viewportPointers.size >= 2 && isTwoFingerTouchPinch();
    if (suppress) hideScrubPreview();
  }

  function beginPinchFromCurrentDistance() {
    if (pinchState) return true;
    const d = getViewportPinchDistance();
    if (d < PINCH_MIN_START_DIST_PX) return false;
    pinchState = { lastDist: d };
    videoViewport.classList.add("player__viewport--pinch");
    releasePanPointerCapture();
    return true;
  }

  function applyPinchZoomMove(e) {
    if (!pinchState) return;
    const d = getViewportPinchDistance();
    const anchor = getViewportPinchAnchor();
    if (!anchor || pinchState.lastDist <= 0) return;
    let factor = d / pinchState.lastDist;
    factor = Math.max(PINCH_FACTOR_MIN, Math.min(PINCH_FACTOR_MAX, factor));
    setZoomLevel(zoomLevel * factor, anchor);
    pinchState.lastDist = d;
    e.preventDefault();
  }

  videoViewport.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    if (isExternalEmbedSource()) return;
    viewportPointers.set(e.pointerId, {
      clientX: e.clientX,
      clientY: e.clientY,
      pointerType: e.pointerType,
    });

    if (viewportPointers.size === 2 && isTwoFingerTouchPinch()) {
      if (panPointer) panPointer.tapCancelled = true;
      if (beginPinchFromCurrentDistance()) e.preventDefault();
      syncPinchChromeSuppression();
      return;
    }

    if (viewportPointers.size === 2) {
      syncPinchChromeSuppression();
      return;
    }

    player.focus({ preventScroll: true });
    if (zoomLevel > 1.001) {
      e.preventDefault();
    }
    panPointer = {
      id: e.pointerId,
      cx: e.clientX,
      cy: e.clientY,
      ox: panX,
      oy: panY,
      dragged: false,
      tapCancelled: false,
      downT: performance.now(),
    };
    if (zoomLevel > 1.001) {
      try {
        videoViewport.setPointerCapture(e.pointerId);
      } catch (_) {
        /* ignore */
      }
      videoViewport.dataset.panning = "true";
    }
    syncPinchChromeSuppression();
  });

  videoViewport.addEventListener("pointermove", (e) => {
    const tracked = viewportPointers.get(e.pointerId);
    if (tracked) {
      tracked.clientX = e.clientX;
      tracked.clientY = e.clientY;
      tracked.pointerType = e.pointerType;
    }

    if (viewportPointers.size === 2 && isTwoFingerTouchPinch()) {
      if (!pinchState) beginPinchFromCurrentDistance();
      if (pinchState) {
        applyPinchZoomMove(e);
        return;
      }
    }

    if (!panPointer || e.pointerId !== panPointer.id) return;
    const dx = e.clientX - panPointer.cx;
    const dy = e.clientY - panPointer.cy;
    if (
      zoomLevel <= 1.001 &&
      !panPointer.tapCancelled &&
      (Math.abs(dx) > VIEWPORT_TAP_CANCEL_MOVE_PX ||
        Math.abs(dy) > VIEWPORT_TAP_CANCEL_MOVE_PX)
    ) {
      panPointer.tapCancelled = true;
    }
    if (zoomLevel <= 1.001) return;
    if (!panPointer.dragged && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) {
      panPointer.dragged = true;
    }
    if (panPointer.dragged) {
      panX = panPointer.ox + dx;
      panY = panPointer.oy + dy;
      clampPan();
      applyZoomTransform();
    }
  });

  function endViewportPointer(e) {
    const endedByCancel = e.type === "pointercancel";
    viewportPointers.delete(e.pointerId);
    if (viewportPointers.size === 0) {
      requestAnimationFrame(() => bumpChromeActivity());
    }
    syncPinchChromeSuppression();

    if (pinchState && viewportPointers.size < 2) {
      pinchState = null;
      videoViewport.classList.remove("player__viewport--pinch");
      promoteRemainingFingerToPan();
      syncPinchChromeSuppression();
      return;
    }

    if (!panPointer || e.pointerId !== panPointer.id) return;
    const dragged = panPointer.dragged;
    const tapCancelled = panPointer.tapCancelled || endedByCancel;
    const holdMs = performance.now() - (panPointer.downT ?? performance.now());
    panPointer = null;
    try {
      if (videoViewport.hasPointerCapture(e.pointerId)) {
        videoViewport.releasePointerCapture(e.pointerId);
      }
    } catch (_) {
      /* ignore */
    }
    videoViewport.dataset.panning = "false";
    const tapQuickEnough = holdMs <= VIEWPORT_TAP_MAX_DURATION_MS;
    if (!dragged && zoomLevel <= 1.001 && !tapCancelled && tapQuickEnough) togglePlay();
  }

  videoViewport.addEventListener("pointerup", endViewportPointer);
  videoViewport.addEventListener("pointercancel", endViewportPointer);

  const IDLE_UI_MS = usesCoarsePrimaryPointer ? 3800 : 2000;
  let chromeIdleTimer = null;

  /** True while a continuous interaction should keep the HUD up without a running idle timer. */
  function isChromeInteractionHold() {
    if (pinchState) return true;
    if (player.dataset.scrubbing === "true") return true;
    if (frameKeyHeldBack || frameKeyHeldForward) return true;
    if (framePointerHeldBack || framePointerHeldForward) return true;
    if (zoomKbDelayId != null || zoomKbIntervalId != null) return true;
    if (rateKbDelayId != null || rateKbIntervalId != null) return true;
    if (chromePointerHoldDisarms.size > 0) return true;
    return false;
  }

  function clearChromeIdleTimer() {
    if (chromeIdleTimer != null) {
      clearTimeout(chromeIdleTimer);
      chromeIdleTimer = null;
    }
  }

  function exitChromeIdle() {
    player.classList.remove("player--idle");
  }

  function armChromeIdleTimer() {
    if (isChromeInteractionHold()) {
      clearChromeIdleTimer();
      exitChromeIdle();
      return;
    }
    clearChromeIdleTimer();
    exitChromeIdle();
    chromeIdleTimer = setTimeout(() => {
      chromeIdleTimer = null;
      if (isChromeInteractionHold()) {
        return;
      }
      const ae = document.activeElement;
      if (
        ae instanceof HTMLElement &&
        ((chromeEl && chromeEl.contains(ae)) ||
          (cornerTools && cornerTools.contains(ae)) ||
          (cornerVolume && cornerVolume.contains(ae)))
      ) {
        ae.blur();
      }
      requestAnimationFrame(() => {
        if (isChromeInteractionHold()) return;
        player.classList.add("player--idle");
      });
    }, IDLE_UI_MS);
  }

  function bumpChromeActivity() {
    if (isChromeInteractionHold()) {
      clearChromeIdleTimer();
      exitChromeIdle();
      return;
    }
    armChromeIdleTimer();
  }

  /** Mobile: tap outside #player hides chrome immediately (idle timer is too slow). */
  function dismissChromeForOutsideTap() {
    if (!usesCoarsePrimaryPointer) return;
    clearChromeIdleTimer();
    player.classList.add("player--idle");
    player.classList.add("player--pointer-outside");
    const ae = document.activeElement;
    if (
      ae instanceof HTMLElement &&
      player.contains(ae) &&
      ((chromeEl && chromeEl.contains(ae)) ||
        (cornerTools && cornerTools.contains(ae)) ||
        (cornerVolume && cornerVolume.contains(ae)))
    ) {
      ae.blur();
    }
    hideScrubPreview();
  }

  function isClientPointOutsideRect(clientX, clientY, rect) {
    return (
      clientX < rect.left ||
      clientX > rect.right ||
      clientY < rect.top ||
      clientY > rect.bottom
    );
  }

  document.addEventListener(
    "pointerdown",
    (e) => {
      if (!usesCoarsePrimaryPointer || e.button !== 0) return;
      if (!(e.target instanceof Node) || !document.documentElement.contains(e.target)) return;
      if (player.contains(e.target)) return;
      if (player.dataset.scrubbing === "true") return;
      if (isChromeInteractionHold()) return;
      dismissChromeForOutsideTap();
    },
    true
  );

  player.addEventListener("pointermove", bumpChromeActivity);
  player.addEventListener("pointerenter", () => {
    pointerInsidePlayer = true;
    player.classList.remove("player--pointer-outside");
    bumpChromeActivity();
  });
  /* Bubble so videoViewport pointerdown runs first and viewportPointers reflects two-finger pinch. */
  player.addEventListener("pointerdown", (e) => {
    if (e.target instanceof Node && player.contains(e.target)) {
      player.classList.remove("player--pointer-outside");
      if (e.pointerType === "touch") {
        activeTouchPointersOnPlayer.add(e.pointerId);
        pointerInsidePlayer = true;
      }
    }
    bumpChromeActivity();
  });
  function forgetPlayerTouchPointer(e) {
    if (e.pointerType !== "touch") return;
    activeTouchPointersOnPlayer.delete(e.pointerId);
  }
  document.addEventListener("pointerup", forgetPlayerTouchPointer, true);
  document.addEventListener("pointercancel", forgetPlayerTouchPointer, true);
  /** Long-press / synthetic “right click”: capture on `document` so it still runs if a child swallows the event. */
  document.addEventListener(
    "contextmenu",
    (e) => {
      if (!(e.target instanceof Node) || !player.contains(e.target)) return;
      const cap = e.sourceCapabilities;
      const hoverNone =
        typeof window.matchMedia === "function" &&
        window.matchMedia("(hover: none)").matches;
      const touchLike =
        (cap && cap.firesTouchEvents === true) ||
        e.pointerType === "touch" ||
        (activeTouchPointersOnPlayer.size > 0 && hoverNone);
      if (!touchLike) return;
      e.preventDefault();
      e.stopPropagation();
    },
    true
  );
  function onPlayerWheel(e) {
    bumpChromeActivity();
    if (isExternalEmbedSource()) return;
    const pr = player.getBoundingClientRect();
    if (isClientPointOutsideRect(e.clientX, e.clientY, pr)) return;
    if (!e.ctrlKey) return;
    e.preventDefault();
    zoomFromWheel(e.deltaY, e.clientX, e.clientY);
  }

  player.addEventListener("wheel", onPlayerWheel, { passive: false });
  player.addEventListener("focusin", (e) => {
    if (!(e.target instanceof Node)) return;
    const inChrome = chromeEl && chromeEl.contains(e.target);
    const inCorner = cornerTools && cornerTools.contains(e.target);
    const inCornerVolume = cornerVolume && cornerVolume.contains(e.target);
    if (!inChrome && !inCorner && !inCornerVolume) return;
    exitChromeIdle();
    armChromeIdleTimer();
  });

  /** Touch/stylus leave the window as “mouse” moves; only treat real mouse/pen leave as “outside”. */
  player.addEventListener("pointerleave", (e) => {
    pointerInsidePlayer = false;
    if (e.pointerType === "touch") return;
    clearChromeIdleTimer();
    exitChromeIdle();
    player.classList.add("player--pointer-outside");
  });

  wireHeldChromeButton(zoomInBtn, () => adjustZoomByStep(1));
  wireHeldChromeButton(zoomOutBtn, () => adjustZoomByStep(-1));
  zoomResetBtn.addEventListener("click", () => setZoomLevel(1));

  new ResizeObserver(() => {
    clampPan();
    applyZoomTransform();
  }).observe(videoViewport);

  document.addEventListener("pointermove", (e) => {
    if (
      pinchState ||
      (viewportPointers.size >= 2 && isTwoFingerTouchPinch())
    ) {
      return;
    }
    const scrubbing = player.dataset.scrubbing === "true";
    const pr = player.getBoundingClientRect();
    const outsidePlayer = isClientPointOutsideRect(e.clientX, e.clientY, pr);
    if (!outsidePlayer) {
      player.classList.remove("player--pointer-outside");
    } else if (!scrubbing && !isChromeInteractionHold()) {
      clearChromeIdleTimer();
      exitChromeIdle();
      player.classList.add("player--pointer-outside");
    }
    if (outsidePlayer) {
      if (scrubPreviewActive && !scrubbing) hideScrubPreview();
      if (!scrubbing) return;
    }
    syncScrubPreviewToPointer(e.clientX, e.clientY);
  });

  progress.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    pendingInitialLiveSeek = false;
    clearInitialLiveSeekGuard();
    video.pause();
    player.dataset.scrubbing = "true";
    scrubPointerId = e.pointerId;
    try {
      progress.setPointerCapture(e.pointerId);
    } catch (_) {
      /* ignore */
    }
    syncScrubPreviewToPointer(e.clientX, e.clientY);
    bumpChromeActivity();
  });

  progress.addEventListener("pointermove", (e) => {
    if (player.dataset.scrubbing !== "true") return;
    if (scrubPointerId != null && e.pointerId !== scrubPointerId) return;
    syncScrubPreviewToPointer(e.clientX, e.clientY);
    bumpChromeActivity();
  });

  progress.addEventListener("input", () => {
    const end = getEffectiveDuration();
    if (end == null) return;
    video.pause();
    const start = isLiveStream() ? (getSeekableStartTime() ?? 0) : 0;
    const t = start + (Number(progress.value) / 1000) * (end - start);
    video.currentTime = t;
    updateTimeDisplay();
    syncProgressRailFill();
    if (scrubPreviewActive || player.dataset.scrubbing === "true") {
      ensureScrubPreviewVisible();
      updateScrubPreviewFromRatio(Number(progress.value) / 1000);
    }
    if (player.dataset.scrubbing === "true") bumpChromeActivity();
  });

  progress.addEventListener("pointerup", (e) => endProgressScrubIfNeeded(e));
  document.addEventListener("pointerup", (e) => endProgressScrubIfNeeded(e));

  progress.addEventListener("pointercancel", (e) => {
    if (player.dataset.scrubbing !== "true") return;
    if (scrubPointerId != null && e.pointerId !== scrubPointerId) return;
    stopProgressScrubState();
    hideScrubPreview();
  });

  /* Firefox releases pointer capture on native range inputs without firing pointercancel,
     leaving scrubbing stuck. End the scrub here as a safety net. */
  progress.addEventListener("lostpointercapture", (e) => {
    if (player.dataset.scrubbing !== "true") return;
    if (scrubPointerId != null && e.pointerId !== scrubPointerId) return;
    stopProgressScrubState();
    if (!usesCoarsePrimaryPointer && !isPointOverScrubHitZone(e.clientX, e.clientY)) {
      hideScrubPreview();
    }
  });

  progress.addEventListener(
    "touchstart",
    (e) => {
      const ct = e.changedTouches[0];
      if (!(ct.target === progress || progress.contains(ct.target))) return;
      video.pause();
      player.dataset.scrubbing = "true";
      scrubTouchId = ct.identifier;
      syncScrubPreviewToPointer(ct.clientX, ct.clientY);
      bumpChromeActivity();
    },
    { passive: true }
  );

  function touchForActiveScrub(e) {
    if (scrubTouchId != null) {
      const t = [...e.touches].find((x) => x.identifier === scrubTouchId);
      if (t) return t;
    }
    if (scrubPointerId != null && e.touches.length === 1) return e.touches[0];
    return null;
  }

  document.addEventListener(
    "touchmove",
    (e) => {
      if (player.dataset.scrubbing !== "true") return;
      const t = touchForActiveScrub(e);
      if (!t) return;
      e.preventDefault();
      const pr = player.getBoundingClientRect();
      const inside =
        t.clientX >= pr.left &&
        t.clientX <= pr.right &&
        t.clientY >= pr.top &&
        t.clientY <= pr.bottom;
      if (inside) player.classList.remove("player--pointer-outside");
      syncScrubPreviewToPointer(t.clientX, t.clientY);
      bumpChromeActivity();
    },
    { passive: false }
  );

  function endTouchScrubIfLifted(e) {
    if (player.dataset.scrubbing !== "true" || scrubTouchId == null) return;
    for (let i = 0; i < e.changedTouches.length; i += 1) {
      if (e.changedTouches[i].identifier === scrubTouchId) {
        endProgressScrubIfNeeded(e);
        return;
      }
    }
  }

  document.addEventListener("touchend", endTouchScrubIfLifted, true);
  document.addEventListener("touchcancel", endTouchScrubIfLifted, true);

  function onVolumeSliderInteraction() {
    applyVolumeFromSlider();
  }
  volumeSlider.addEventListener("input", onVolumeSliderInteraction);
  volumeSlider.addEventListener("change", onVolumeSliderInteraction);
  if (volumeSlider instanceof HTMLElement) {
    volumeSlider.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      volPointerBaseline = Number(volumeSlider.value);
    });
    volumeSlider.addEventListener("pointerup", () => {
      volPointerBaseline = null;
    });
    volumeSlider.addEventListener("pointercancel", () => {
      volPointerBaseline = null;
    });
  }

  fileInput.addEventListener("change", () => {
    const file = fileInput.files && fileInput.files[0];
    fileInput.value = "";
    if (!file) return;
    loadVideoFromFile(file);
  });

  window.addEventListener("dragover", (e) => {
    if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    e.preventDefault();
  });

  window.addEventListener("drop", (e) => {
    e.preventDefault();
    const dt = e.dataTransfer;
    if (!dt) return;
    if (dt.files && dt.files.length) {
      loadVideoFromFile(dt.files[0]);
      return;
    }
    const uriList = dt.getData("text/uri-list");
    const plain = dt.getData("text/plain");
    const uri = (uriList && uriList.split("\n")[0].trim()) || (plain && plain.trim());
    if (uri) tryLoadFromUrlString(uri);
  });

  function submitUrlField() {
    if (!(urlInput instanceof HTMLInputElement)) return;
    tryLoadFromUrlString(urlInput.value);
  }

  if (loadUrlBtn instanceof HTMLElement) {
    loadUrlBtn.addEventListener("click", submitUrlField);
  }
  if (urlInput instanceof HTMLInputElement) {
    urlInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        submitUrlField();
      }
    });
  }

  muteBtn.addEventListener("click", () => {
    video.muted = !video.muted;
    if (webAudioVolumeRoute && webAudioGain && webAudioCtx) {
      if (!video.muted) {
        let sv = Number(volumeSlider.value);
        if (sv === 0 || !Number.isFinite(sv)) {
          volumeSlider.value = "1";
        }
      }
      setWebAudioOutputGainFromControls();
      void webAudioCtx.resume();
    } else if (!video.muted) {
      const sv = Number(volumeSlider.value);
      if (sv === 0) {
        volumeSlider.value = "1";
        if (elementVolumeControlsOutput) {
          video.volume = 1;
        } else {
          applyVolumeFromSlider();
        }
      }
    }
    setMutedUI();
  });

  function videoSupportsWebKitPresentationMode(mode) {
    try {
      return (
        typeof video.webkitSupportsPresentationMode === "function" &&
        Boolean(video.webkitSupportsPresentationMode(mode))
      );
    } catch (_) {
      return false;
    }
  }

  function pipApiSupported() {
    if (video.disablePictureInPicture === true) return false;
    if (
      videoSupportsWebKitPresentationMode("picture-in-picture") &&
      typeof video.webkitSetPresentationMode === "function"
    ) {
      return true;
    }
    return typeof video.requestPictureInPicture === "function";
  }

  function syncPipVisibility() {
    if (!(pipBtn instanceof HTMLElement)) return;
    if (video.disablePictureInPicture === true) {
      pipBtn.hidden = true;
      return;
    }
    pipBtn.hidden = !pipApiSupported();
  }

  syncPipVisibility();

  pipBtn.addEventListener("click", () => {
    if (video.disablePictureInPicture === true) return;

    if (
      videoSupportsWebKitPresentationMode("picture-in-picture") &&
      typeof video.webkitSetPresentationMode === "function"
    ) {
      try {
        const next =
          video.webkitPresentationMode === "picture-in-picture"
            ? "inline"
            : "picture-in-picture";
        video.webkitSetPresentationMode(next);
        return;
      } catch (_) {
        /* fall through to Picture-in-Picture API */
      }
    }

    if (typeof video.requestPictureInPicture !== "function") return;
    void (async () => {
      try {
        if (document.pictureInPictureElement === video) {
          await document.exitPictureInPicture();
        } else {
          await video.requestPictureInPicture();
        }
      } catch (_) {
        /* user gesture / policy */
      }
    })();
  });

  fullscreenBtn.addEventListener("click", () => {
    /*
     * Match v1.1.10: toggle on #player via the standard Fullscreen API first (works in the site
     * iframe on Windows). Exit both standard and WebKit document fullscreen when needed — using
     * only exitFullscreen() misses webkitFullscreenElement on some builds and left "stuck" toggles.
     */
    if (
      !isExternalEmbedSource() &&
      !document.fullscreenElement &&
      !document.webkitFullscreenElement &&
      video.webkitDisplayingFullscreen === true &&
      typeof video.webkitExitFullscreen === "function"
    ) {
      try {
        video.webkitExitFullscreen();
      } catch (_) {
        /* not allowed */
      }
      syncFullscreenButtonUI();
      return;
    }

    if (
      !isExternalEmbedSource() &&
      typeof video.webkitSetPresentationMode === "function" &&
      video.webkitPresentationMode === "fullscreen"
    ) {
      try {
        video.webkitSetPresentationMode("inline");
      } catch (_) {
        /* not allowed */
      }
      syncFullscreenButtonUI();
      return;
    }

    if (document.fullscreenElement || document.webkitFullscreenElement) {
      void (async () => {
        try {
          if (document.exitFullscreen) await document.exitFullscreen();
        } catch (_) {
          /* not allowed */
        }
        try {
          if (document.webkitExitFullscreen && document.webkitFullscreenElement) {
            await document.webkitExitFullscreen();
          }
        } catch (_) {
          /* not allowed */
        }
        syncFullscreenButtonUI();
      })();
      return;
    }

    /*
     * Mobile WebKit: `requestFullscreen` on our player shell is missing or ineffective. Native
     * fullscreen must run synchronously in the tap handler — `webkitSetPresentationMode` and
     * `webkitEnterFullscreen` both require an active user gesture and are unreliable after `await`.
     */
    if (!isExternalEmbedSource()) {
      const preferNativeMobileFullscreen =
        isIosStyleVolumeLockedPlatform() || isMobileLikePlaybackEnvironment;

      if (
        preferNativeMobileFullscreen &&
        videoSupportsWebKitPresentationMode("fullscreen") &&
        typeof video.webkitSetPresentationMode === "function" &&
        video.webkitPresentationMode !== "fullscreen"
      ) {
        try {
          video.webkitSetPresentationMode("fullscreen");
          syncFullscreenButtonUI();
          return;
        } catch (_) {
          /* fall through */
        }
      }

      try {
        if (
          typeof video.webkitEnterFullscreen === "function" &&
          preferNativeMobileFullscreen
        ) {
          video.webkitEnterFullscreen();
          syncFullscreenButtonUI();
          return;
        }
      } catch (_) {
        /* fall through */
      }
    }

    void (async () => {
      try {
        await player.requestFullscreen();
        syncFullscreenButtonUI();
        return;
      } catch (_) {
        /* not allowed */
      }
      try {
        if (typeof player.webkitRequestFullscreen === "function") {
          await player.webkitRequestFullscreen();
          syncFullscreenButtonUI();
          return;
        }
      } catch (_) {
        /* not allowed */
      }

      if (isExternalEmbedSource()) return;

      try {
        if (typeof video.requestFullscreen === "function") {
          await video.requestFullscreen();
          syncFullscreenButtonUI();
          return;
        }
      } catch (_) {
        /* not allowed */
      }
      if (typeof video.webkitEnterFullscreen === "function") {
        try {
          video.webkitEnterFullscreen();
          syncFullscreenButtonUI();
        } catch (_) {
          /* not allowed */
        }
      }
    })();
  });

  document.addEventListener("fullscreenchange", syncFullscreenButtonUI);
  document.addEventListener("webkitfullscreenchange", syncFullscreenButtonUI);
  video.addEventListener("webkitbeginfullscreen", syncFullscreenButtonUI);
  video.addEventListener("webkitendfullscreen", syncFullscreenButtonUI);
  video.addEventListener("webkitpresentationmodechanged", syncFullscreenButtonUI);
  syncFullscreenButtonUI();

  function isEditableFocusOutsidePlayer() {
    const ae = document.activeElement;
    if (!(ae instanceof HTMLElement)) return false;
    if (player.contains(ae)) return false;
    if (ae.isContentEditable) return true;
    const tag = ae.tagName;
    if (tag === "TEXTAREA") return true;
    if (tag === "SELECT") return true;
    if (tag === "INPUT") {
      const type = (ae.type || "text").toLowerCase();
      if (
        type === "button" ||
        type === "checkbox" ||
        type === "radio" ||
        type === "file" ||
        type === "range" ||
        type === "color" ||
        type === "submit" ||
        type === "reset" ||
        type === "hidden"
      ) {
        return false;
      }
      return true;
    }
    return false;
  }

  function shouldHandlePlayerKeyboard(e) {
    if (isExternalEmbedSource()) return false;
    const t = e.target;
    if (t === player || (t instanceof Node && player.contains(t))) return true;
    if (!pointerInsidePlayer) return false;
    if (isEditableFocusOutsidePlayer()) return false;
    return true;
  }

  function onPlayerKeydown(e) {
    if (!shouldHandlePlayerKeyboard(e)) return;
    bumpChromeActivity();
    if (e.code === "BracketLeft") {
      e.preventDefault();
      if (e.repeat) return;
      rateKbKeydown(-1);
      return;
    }
    if (e.code === "BracketRight") {
      e.preventDefault();
      if (e.repeat) return;
      rateKbKeydown(1);
      return;
    }
    if (isZoomInKeyEvent(e)) {
      e.preventDefault();
      if (e.repeat) return;
      zoomKbKeydown(1);
      return;
    }
    if (isZoomOutKeyEvent(e)) {
      e.preventDefault();
      if (e.repeat) return;
      zoomKbKeydown(-1);
      return;
    }
    const frameDir = frameStepDirectionFromKeyEvent(e);
    if (frameDir != null) {
      e.preventDefault();
      if (e.repeat) return;
      if (frameDir === -1) {
        frameKeyHeldBack = true;
        frameKeyHoldRepeatReadyBack = false;
      } else {
        frameKeyHeldForward = true;
        frameKeyHoldRepeatReadyForward = false;
      }
      armKeyboardFrameHoldRepeat(frameDir);
      stepByFrame(frameDir);
      return;
    }
    const step = 5;
    switch (e.key) {
      case " ":
        e.preventDefault();
        togglePlay();
        break;
      case "ArrowLeft":
        e.preventDefault();
        video.currentTime = Math.max(0, video.currentTime - step);
        break;
      case "ArrowRight":
        e.preventDefault();
        video.currentTime = Math.min(
          video.duration || Infinity,
          video.currentTime + step
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        bumpVolumeKeyboard(0.1);
        break;
      case "ArrowDown":
        e.preventDefault();
        bumpVolumeKeyboard(-0.1);
        break;
      case "m":
      case "M":
        e.preventDefault();
        muteBtn.click();
        break;
      case "f":
      case "F":
        e.preventDefault();
        fullscreenBtn.click();
        break;
      case "0":
        e.preventDefault();
        if (!e.repeat) setZoomLevel(1);
        break;
      default:
        break;
    }
  }

  function onPlayerKeyup(e) {
    if (!shouldHandlePlayerKeyboard(e)) return;
    const frameDir = frameStepDirectionFromKeyEvent(e);
    if (frameDir != null) {
      clearFrameKeyboardHoldDirection(frameDir);
      bumpChromeActivity();
    }
    if (e.code === "BracketLeft") rateKbKeyup(-1);
    if (e.code === "BracketRight") rateKbKeyup(1);
    if (isZoomInKeyEvent(e)) zoomKbKeyup(1);
    if (isZoomOutKeyEvent(e)) zoomKbKeyup(-1);
  }

  document.addEventListener("keydown", onPlayerKeydown, true);
  document.addEventListener("keyup", onPlayerKeyup, true);

  window.addEventListener("blur", () => {
    clearAllFrameHold();
    disarmZoomRateKeyboardHolds();
    disarmAllChromePointerHolds();
    pointerInsidePlayer = false;
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      clearAllFrameHold();
      disarmZoomRateKeyboardHolds();
      disarmAllChromePointerHolds();
    }
  });

  player.tabIndex = 0;

  if (tooltipLayer) {
    function hideTooltip() {
      tooltipLayer.hidden = true;
      tooltipLayer.textContent = "";
    }
    hidePlayerTooltip = hideTooltip;

    function tooltipHostHasOpenDropdown(host) {
      if (!host || !(host instanceof Element)) return false;
      if (host.querySelector(".player__dropdown--open") != null) return true;
      if (host.querySelector('.player__dropdown-trigger[aria-expanded="true"]') != null) {
        return true;
      }
      return false;
    }

    /** True if `node` is inside the interactive subtree of a `[data-tooltip]` host (not just a DOM ancestor). */
    function isPointerOverTooltipHost(node) {
      if (!(node instanceof Element)) return false;
      const host = node.closest("[data-tooltip]");
      if (!host) return false;
      if (host.closest("#player")) {
        const tag = host.tagName;
        if (tag === "BUTTON" || tag === "LABEL" || tag === "SELECT") return true;
        if (
          host.matches(
            ".player__rate-select-wrap, .player__quality-select-wrap, .player__dropdown"
          )
        ) {
          return true;
        }
        return false;
      }
      return true;
    }

    function showTooltipFor(el) {
      const text = el.getAttribute("data-tooltip");
      if (!text) {
        hideTooltip();
        return;
      }
      if (tooltipHostHasOpenDropdown(el)) {
        hideTooltip();
        return;
      }
      const hostPlayer = el.closest("#player");
      if (hostPlayer instanceof HTMLElement) {
        const probe =
          playPause instanceof HTMLElement ? playPause : hostPlayer.querySelector(".player__btn");
        if (probe instanceof HTMLElement) {
          tooltipLayer.style.fontSize = getComputedStyle(probe).fontSize;
        } else {
          tooltipLayer.style.removeProperty("font-size");
        }
      } else {
        tooltipLayer.style.removeProperty("font-size");
      }
      tooltipLayer.textContent = text;
      tooltipLayer.hidden = false;
      const r = el.getBoundingClientRect();
      const marginEm = 0.55;
      const fs = parseFloat(getComputedStyle(tooltipLayer).fontSize) || 14;
      const margin = Math.max(6, Math.round(fs * marginEm));
      const w = tooltipLayer.offsetWidth;
      const h = tooltipLayer.offsetHeight;
      let top = r.top - h - margin;
      let left = r.left + (r.width - w) / 2;
      if (top < margin) top = r.bottom + margin;
      left = Math.max(margin, Math.min(left, window.innerWidth - w - margin));
      tooltipLayer.style.left = `${Math.round(left)}px`;
      tooltipLayer.style.top = `${Math.round(top)}px`;
    }

    document.addEventListener(
      "pointerover",
      (e) => {
        if (!(e.target instanceof Element)) return;
        if (!isPointerOverTooltipHost(e.target)) {
          hideTooltip();
          return;
        }
        const el = e.target.closest("[data-tooltip]");
        if (!el) {
          hideTooltip();
          return;
        }
        if (tooltipHostHasOpenDropdown(el)) {
          hideTooltip();
          return;
        }
        showTooltipFor(el);
      },
      true
    );

    document.addEventListener(
      "pointerout",
      (e) => {
        if (!(e.target instanceof Element)) return;
        const host = e.target.closest("[data-tooltip]");
        if (!host) return;
        const rt = e.relatedTarget;
        if (rt instanceof Node && host.contains(rt)) return;
        if (rt instanceof Element) {
          const nextHost = rt.closest("[data-tooltip]");
          if (nextHost && nextHost !== host) return;
        }
        hideTooltip();
      },
      true
    );

    player.addEventListener("pointerleave", hideTooltip);

    document.addEventListener("scroll", hideTooltip, true);
    window.addEventListener("resize", hideTooltip);

    document.addEventListener("focusin", (e) => {
      if (!(e.target instanceof Element)) return;
      if (e.target.closest("#player")) return;
      const el = e.target.closest("[data-tooltip]");
      if (el) showTooltipFor(el);
      else hideTooltip();
    });

    document.addEventListener("focusout", () => {
      requestAnimationFrame(() => {
        const a = document.activeElement;
        if (!(a instanceof Element)) {
          hideTooltip();
          return;
        }
        if (a.closest("#player")) {
          hideTooltip();
          return;
        }
        const host = a.closest("[data-tooltip]");
        if (!host) hideTooltip();
        else showTooltipFor(host);
      });
    });
  }

  window.addEventListener("pagehide", (e) => {
    clearChromeIdleTimer();
    exitChromeIdle();
    stopFramePeriodMeasure();
    setScrubPreviewVisible(false);
    if (tooltipLayer) {
      tooltipLayer.hidden = true;
      tooltipLayer.textContent = "";
    }
    if (!e.persisted) {
      exitYoutubeMode();
      revokeBlobUrl();
      hasCustomSource = false;
      expectsLiveHlsPlayback = false;
      clearInitialLiveSeekGuard();
      pendingInitialLiveSeek = false;
    }
  });

  window.addEventListener("pageshow", () => {
    if (!isLiveStream()) return;
    requestInitialLiveSeek();
    requestAnimationFrame(() => {
      tryConsumeInitialLiveSeek();
      tryPlayLiveMedia();
    });
    syncLiveButtonUI();
  });

  volumeSlider.value = String(video.volume);
  /* Browsers / tab-restore sometimes leave a range input focused; that paints a focus ring. */
  requestAnimationFrame(() => {
    const ae = document.activeElement;
    if (ae === volumeSlider || ae === progress) {
      if (ae instanceof HTMLElement) ae.blur();
      try {
        player.focus({ preventScroll: true });
      } catch (_) {
        /* ignore */
      }
    }
  });
  syncVolumeSliderLockedUI();
  syncPlaybackRateOptionsUI();
  applyPlaybackRate(video.playbackRate || 1);
  applyPlaybackPitchPolicy();
  setMutedUI();
  setState(!video.paused);
  syncPreviewVideoSrc();
  syncPlaybackRateSelect();
  applyZoomTransform();
  updateTimeDisplay();
  syncLiveButtonUI();

  if (typeof ResizeObserver !== "undefined") {
    const ro = new ResizeObserver(() => {
      syncRatePillWidthToZoom();
      if (scrubPreviewActive && lastPreviewClientX != null) {
        positionScrubPreview(lastPreviewClientX);
      }
    });
    ro.observe(player);
    if (zoomGroup instanceof HTMLElement) ro.observe(zoomGroup);
    if (cornerTools instanceof HTMLElement) ro.observe(cornerTools);
  }
  window.addEventListener("resize", syncRatePillWidthToZoom);

  /** TESIL app thumbnail picker (parent page embed): report duration. */
  function postMetaToHostBridgeParent() {
    if (window.parent === window) return;
    if (isExternalEmbedSource()) return;
    if (isLiveStream()) {
      if (video.duration === Infinity) return;
      if (!Number.isFinite(video.duration)) return;
    }
    const d = video.duration;
    if (!Number.isFinite(d) || d <= 0) return;
    try {
      window.parent.postMessage(
        { type: "tesil-embed-meta", durationSec: Math.round(d) },
        "*"
      );
    } catch (_) {
      /* noop */
    }
  }

  video.addEventListener("loadedmetadata", postMetaToHostBridgeParent);

  const THUMB_JPEG_MAX_W = 1280;
  const THUMB_JPEG_Q = 0.92;

  window.addEventListener("message", (e) => {
    if (e.source !== window.parent) return;
    if (!e.data || typeof e.data.type !== "string") return;
    if (e.origin && e.origin !== window.location.origin) return;
    if (e.data.type === "tesil-embed-set-file") {
      if (e.data.file instanceof File) {
        loadVideoFromFile(e.data.file);
      }
      return;
    }
    if (e.data.type !== "tesil-embed-capture-frame") return;
    const id = e.data.id;
    const respond = (payload) => {
      try {
        window.parent.postMessage(
          { type: "tesil-embed-capture-frame-result", id, ...payload },
          "*"
        );
      } catch (_) {
        /* noop */
      }
    };
    if (isExternalEmbedSource()) {
      respond({
        ok: false,
        error:
          "Thumbnails can’t be captured from this player mode. Use a direct video (MP4, WebM, …) on this site, or choose an image file.",
      });
      return;
    }
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) {
      respond({
        ok: false,
        error: "No frame yet — wait for the video to show a picture, then try again.",
      });
      return;
    }
    let w = vw;
    let h = vh;
    if (w > THUMB_JPEG_MAX_W) {
      h = Math.round((vh * THUMB_JPEG_MAX_W) / vw);
      w = THUMB_JPEG_MAX_W;
    }
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d");
    if (!ctx) {
      respond({ ok: false, error: "Could not read pixels from this video." });
      return;
    }
    try {
      ctx.drawImage(video, 0, 0, w, h);
    } catch (_err) {
      respond({
        ok: false,
        error:
          "This video can’t be captured (browser security). Use a still image, or a file from this site.",
      });
      return;
    }
    c.toBlob(
      (blob) => {
        if (!blob) {
          respond({ ok: false, error: "Could not encode thumbnail." });
          return;
        }
        respond({ ok: true, blob });
      },
      "image/jpeg",
      THUMB_JPEG_Q
    );
  });

  if (typeof window.videoPlayerNative !== "undefined") {
    pendingNativeInitial = true;
    window.videoPlayerNative
      .getInitialVideoPayload()
      .then((payload) => {
        pendingNativeInitial = false;
        if (payload && payload.url) {
          loadVideoFromNativePayload(payload);
          return;
        }
        applyDemoSampleIfNeeded();
      })
      .catch(() => {
        pendingNativeInitial = false;
        applyDemoSampleIfNeeded();
      });

    window.videoPlayerNative.onOpenVideoPayload((payload) => {
      if (payload && payload.url) loadVideoFromNativePayload(payload);
    });
  }
})();
