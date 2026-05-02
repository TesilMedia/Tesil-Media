"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";

import { ViewportFittedPlayerFrame } from "@/components/ViewportFittedPlayerFrame";

/**
 * `LivePlayer` is tuned for the MediaMTX fMP4 HLS pipeline (see mediamtx.yml:
 * default `hlsVariant: fmp4` for iOS-safe CMAF segments; optional `lowLatency`
 * for LL-HLS on LANs with stable OBS keyframes). Chrome / Edge / Firefox use
 * hls.js (1.6+); Safari / iOS use native HLS.
 *
 * Why a separate component (vs. the iframe `VideoPlayer`):
 *   - The iframe loads the bundled vanilla-JS player which targets VOD +
 *     classic HLS; bolting LL-HLS onto it would force the rest of that player
 *     to know about live-only paths.
 *   - LL-HLS in MSE is finicky — a dedicated component lets us surface
 *     failures to the page (codec mismatch, MSE refusal) instead of swallowing
 *     them inside the iframe.
 *   - Live needs exactly one `<video>`; no preview canvas, no scrub, no
 *     quality ladder — so the simpler the wrapper, the fewer code paths to go
 *     wrong.
 */

type LivePlayerProps = {
  /** Manifest URL. Typically `/hls/<slug>/index.m3u8` (proxied to MediaMTX). */
  src: string;
  title?: string;
  className?: string;
  /**
   * Wall-clock instant the broadcast went public (`LiveStream.startedAt`).
   * Drives the LIVE pill timer. The HLS manifest's PROGRAM-DATE-TIME alone
   * only covers the rolling window, so we need the absolute start to derive
   * "time since broadcast began".
   */
  liveStartedAt?: Date | string | null;
  /**
   * `true` once the broadcaster has clicked "Go live"; controls whether we
   * render the LIVE pill / time. Pre-stream previews keep the player visible
   * but suppress the pill so viewers don't think the broadcast has started.
   */
  isLive: boolean;
};

type ErrorInfo = {
  message: string;
  /** Diagnostic detail shown in a foldable section. */
  detail?: string;
  /** Hint nudging the user toward a remediation. */
  hint?: string;
};

const PLAYER_AUTOHIDE_MS = 2200;
const FAR_BEHIND_THRESHOLD_S = 6;
/**
 * How often to re-poll the manifest when MediaMTX returns 404 (stream is
 * offline). Keep this loose enough that an offline stream doesn't hammer
 * the server but tight enough that going-live-while-watching resumes within
 * a few seconds.
 */
const OFFLINE_RETRY_INTERVAL_MS = 4000;

/**
 * Android (and rare non‑iOS mobile browsers that still hit the MSE path) tend
 * to struggle with LL‑HLS part pacing over cellular — tiny buffers underrun in
 * a tight loop and the `<video>` can sit in `waiting` forever. Desktop keeps
 * the low‑latency profile; these UAs get a more forgiving transport config.
 */
function prefersMobileLiveReliability(ua: string): boolean {
  return /Android/i.test(ua);
}

function formatElapsed(totalSeconds: number) {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) totalSeconds = 0;
  const s = Math.floor(totalSeconds);
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function describeMediaError(video: HTMLMediaElement): string {
  const err = video.error;
  if (!err) return "MediaError: <none>";
  const codes: Record<number, string> = {
    1: "MEDIA_ERR_ABORTED",
    2: "MEDIA_ERR_NETWORK",
    3: "MEDIA_ERR_DECODE",
    4: "MEDIA_ERR_SRC_NOT_SUPPORTED",
  };
  const name = codes[err.code] ?? `code=${err.code}`;
  return err.message ? `${name}: ${err.message}` : name;
}

export function LivePlayer({
  src,
  title,
  className,
  liveStartedAt,
  isLive,
}: LivePlayerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const startedAtMs = useMemo(() => {
    if (!liveStartedAt) return null;
    const d = liveStartedAt instanceof Date ? liveStartedAt : new Date(liveStartedAt);
    return Number.isNaN(d.getTime()) ? null : d.getTime();
  }, [liveStartedAt]);

  const [paused, setPaused] = useState(true);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [pipSupported, setPipSupported] = useState(false);
  const [pipActive, setPipActive] = useState(false);
  const [waiting, setWaiting] = useState(true);
  const [hasFirstFrame, setHasFirstFrame] = useState(false);
  const [behindSeconds, setBehindSeconds] = useState(0);
  const [contentTimeMs, setContentTimeMs] = useState<number | null>(null);
  const [hudVisible, setHudVisible] = useState(true);
  const [error, setError] = useState<ErrorInfo | null>(null);
  /**
   * Manifest 404 → MediaMTX has nothing to publish (stream offline / OBS not
   * connected). We keep retrying the manifest on a slow timer so going-live
   * while the page is open resumes playback automatically.
   *
   * Mirrored into `offlineRef` so the hls.js error handler (which captures
   * its closure at effect-mount time) can deduplicate per-retry log spam
   * without re-running on every state change.
   */
  const [offline, setOffline] = useState(false);
  const offlineRef = useRef(false);
  useEffect(() => {
    offlineRef.current = offline;
  }, [offline]);
  /**
   * Bumped to force a full transport reattach (destroy + recreate hls.js
   * instance). Used when the user clicks "Retry" after a fatal MSE error.
   */
  const [retryToken, setRetryToken] = useState(0);

  // -------------------- Transport (hls.js / native HLS) --------------------

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let cancelled = false;
    let hlsInstance: import("hls.js").default | null = null;
    let detachLiveRecovery = () => {};

    /**
     * Pull the freshest LL-HLS edge whenever the player has fallen too far
     * behind. With LL-HLS hls.js usually self-corrects via PART-HOLD-BACK,
     * but heavy GC pauses, tab throttling, or a brief network blip can leave
     * the buffer trailing the live edge by 5+ seconds. Cheaper than a full
     * stopLoad/startLoad, doesn't drop the MSE source.
     */
    const snapToLiveEdge = () => {
      if (!video || cancelled) return;
      const seekable = video.seekable;
      if (seekable.length === 0) return;
      const edge = seekable.end(seekable.length - 1);
      const target =
        hlsInstance && Number.isFinite(hlsInstance.liveSyncPosition ?? NaN)
          ? (hlsInstance.liveSyncPosition as number)
          : Math.max(0, edge - 0.5);
      if (target - video.currentTime > 0.25) {
        try {
          video.currentTime = target;
        } catch {
          /* ignore — happens if the source was just re-attached */
        }
      }
    };

    /**
     * First paint should match the "Go live" / LIVE control: seek to the end of
     * the native seekable range. `snapToLiveEdge()` prefers `liveSyncPosition`,
     * which follows hls.js's safe sync point and can sit ~10s behind; users
     * only get the tighter edge after clicking live — duplicate that once on load.
     */
    let didInitialUserLiveSnap = false;
    const tryInitialUserLiveSnap = () => {
      if (cancelled || didInitialUserLiveSnap || !video) return;
      const seekable = video.seekable;
      if (seekable.length === 0) return;
      didInitialUserLiveSnap = true;
      try {
        video.currentTime = Math.max(0, seekable.end(seekable.length - 1) - 0.3);
      } catch {
        /* ignore — source may still be attaching */
      }
    };

    /**
     * After a tab is backgrounded, timers (including hls.js playlist refresh)
     * are throttled, so the MSE buffer can trail the true live edge. Seeking
     * alone only moves within the already-loaded seekable range. Match the
     * bundled player's "Go live" control: drop the stale load state and
     * refetch from the freshest fragment, then snap.
     */
    const resyncLiveEdge = () => {
      if (!video || cancelled) return;
      if (hlsInstance) {
        try {
          hlsInstance.stopLoad();
          hlsInstance.startLoad(-1);
        } catch {
          /* ignore — transport may be mid-teardown */
        }
      }
      snapToLiveEdge();
    };

    /**
     * iOS uses native HLS (no hls.js), so it never inherited the MSE stall
     * loop. Android MSE uses hls.js but both benefit from the same nudge when
     * returning from a backgrounded tab.
     */
    const startLiveRecoveryWatch = () => {
      let stallSince: number | null = null;
      const stallTimer = window.setInterval(() => {
        if (cancelled || !video || video.paused) {
          stallSince = null;
          return;
        }
        const seekable = video.seekable;
        if (seekable.length === 0) return;
        const edge = seekable.end(seekable.length - 1);
        const lag = edge - video.currentTime;
        if (lag > FAR_BEHIND_THRESHOLD_S) {
          if (stallSince == null) stallSince = Date.now();
          else if (Date.now() - stallSince > 500) {
            resyncLiveEdge();
            stallSince = null;
          }
        } else {
          stallSince = null;
        }
      }, 500);
      const onVisibility = () => {
        if (cancelled || document.visibilityState !== "visible") return;
        resyncLiveEdge();
        void attemptPlay();
      };
      document.addEventListener("visibilitychange", onVisibility);
      return () => {
        window.clearInterval(stallTimer);
        document.removeEventListener("visibilitychange", onVisibility);
      };
    };

    const attemptPlay = async () => {
      if (cancelled) return;
      try {
        await video.play();
      } catch {
        // First-load autoplay-without-mute is blocked in Chrome unless the
        // origin has a user-activation history. Fall back to muted playback so
        // the picture starts; the user can unmute via the HUD.
        if (!video.muted) {
          video.muted = true;
          setMuted(true);
          try {
            await video.play();
          } catch {
            // Still blocked — the page-level click overlay handles it.
          }
        }
      }
    };

    setError(null);
    setOffline(false);
    setWaiting(true);
    setHasFirstFrame(false);

    // Browser routing:
    //   - iOS Safari / iPadOS / iOS Chrome (which is also WebKit) lack working
    //     MSE for fMP4 LL-HLS, so we MUST use the native HLS player there.
    //   - Everywhere else (desktop Chrome/Edge/Firefox, macOS Safari) we want
    //     hls.js + MSE because hls.js's LL-HLS implementation works uniformly
    //     across them. Note: modern desktop Chrome on Windows now returns
    //     "maybe" from canPlayType("application/vnd.apple.mpegurl"), so the
    //     old `canNativeHls` heuristic falsely routed Chrome through the
    //     native branch and into the HEAD probe below.
    const canNativeHls = video.canPlayType("application/vnd.apple.mpegurl") !== "";
    const ua = typeof navigator === "undefined" ? "" : navigator.userAgent;
    const isIosWebkit = /iPad|iPhone|iPod/.test(ua) || (ua.includes("Mac") && "ontouchend" in document);
    const useNativeHls = canNativeHls && isIosWebkit;
    const mobileLiveReliability = prefersMobileLiveReliability(ua);

    const onLoadedMetadata = () => {
      // Native WebKit already chooses a sane live start; snapping here can
      // seek ahead of the first decodable buffer on marginal networks.
      if (!useNativeHls) tryInitialUserLiveSnap();
    };
    const onLoadedData = () => {
      setWaiting(false);
    };
    const onCanPlay = () => {
      setWaiting(false);
      if (!useNativeHls) tryInitialUserLiveSnap();
      void attemptPlay();
    };
    const onPlaying = () => {
      if (!useNativeHls) tryInitialUserLiveSnap();
      setHasFirstFrame(true);
      setWaiting(false);
    };
    const onWaiting = () => setWaiting(true);
    const onStalled = () => setWaiting(true);
    /**
     * Native live HLS (especially iOS) can fire `waiting` on routine segment
     * boundary work without a follow-up `canplay`. Playback is fine but our
     * spinner would latch on forever. Any `timeupdate` / `progress` while
     * actually playing means we're past that micro-stall.
     */
    const onProgressOrTimeUpdate = () => {
      if (cancelled || !video || video.paused || video.seeking) return;
      setWaiting(false);
    };
    const onVideoError = () => {
      if (cancelled || !video.error) return;
      if (!useNativeHls) {
        // hls.js reports fatal issues via Hls.Events.ERROR; the element often
        // mirrors the same failure and would duplicate our overlay.
        return;
      }
      setWaiting(false);
      setError({
        message: "Live playback failed.",
        detail: describeMediaError(video),
        hint:
          "Try refreshing. If this persists on iPhone, the HLS feed may be incompatible — ensure MediaMTX uses `hlsVariant: fmp4` and OBS keyframe interval is 1s.",
      });
    };

    video.addEventListener("loadedmetadata", onLoadedMetadata);
    video.addEventListener("loadeddata", onLoadedData);
    video.addEventListener("canplay", onCanPlay);
    video.addEventListener("playing", onPlaying);
    video.addEventListener("waiting", onWaiting);
    video.addEventListener("stalled", onStalled);
    video.addEventListener("timeupdate", onProgressOrTimeUpdate);
    video.addEventListener("progress", onProgressOrTimeUpdate);
    video.addEventListener("error", onVideoError);

    if (useNativeHls) {
      // iOS — native HLS (classic fMP4 sliding window or LL-HLS, depending on
      // MediaMTX `hlsVariant`).
      //
      // Probe before pointing video.src at the manifest so we can show the
      // "offline" placeholder gracefully when MediaMTX returns 404. Without
      // this, the native HTMLMediaElement surfaces a generic
      // MEDIA_ERR_SRC_NOT_SUPPORTED and our diagnostic overlay would fire
      // for the offline case.
      //
      // We must use GET (not HEAD) here: MediaMTX's HLS handler returns 404
      // for HEAD requests on `index.m3u8` even when the muxer is healthy and
      // the same URL responds 200 to GET. Read the tiny body to completion —
      // aborting mid-request has caused Safari to skip assigning `video.src`
      // (infinite spinner with no MEDIA_ERR surface).
      let nativeOfflineRetry: number | null = null;

      const tryLoad = async () => {
        if (cancelled) return;
        try {
          const probe = await fetch(src, {
            method: "GET",
            cache: "no-store",
          });
          if (cancelled) return;
          if (probe.status === 404) {
            setOffline(true);
            setWaiting(false);
            nativeOfflineRetry = window.setTimeout(tryLoad, OFFLINE_RETRY_INTERVAL_MS);
            return;
          }
          if (!probe.ok) {
            setError({
              message: "Live manifest is unavailable.",
              detail: `HTTP ${probe.status} from ${src}`,
            });
            return;
          }
          // Consume body so the connection closes cleanly (m3u8 is small).
          await probe.text();
          if (cancelled) return;
          setOffline(false);
          if (video.src !== src) video.src = src;
          void attemptPlay();
        } catch (err) {
          if (cancelled) return;
          setOffline(true);
          setWaiting(false);
          if (process.env.NODE_ENV !== "production") {
            // eslint-disable-next-line no-console
            console.debug("[live] manifest probe failed", err);
          }
          nativeOfflineRetry = window.setTimeout(tryLoad, OFFLINE_RETRY_INTERVAL_MS);
        }
      };
      void tryLoad();
      detachLiveRecovery = startLiveRecoveryWatch();

      return () => {
        cancelled = true;
        detachLiveRecovery();
        if (nativeOfflineRetry != null) window.clearTimeout(nativeOfflineRetry);
        video.removeEventListener("loadedmetadata", onLoadedMetadata);
        video.removeEventListener("loadeddata", onLoadedData);
        video.removeEventListener("canplay", onCanPlay);
        video.removeEventListener("playing", onPlaying);
        video.removeEventListener("waiting", onWaiting);
        video.removeEventListener("stalled", onStalled);
        video.removeEventListener("timeupdate", onProgressOrTimeUpdate);
        video.removeEventListener("progress", onProgressOrTimeUpdate);
        video.removeEventListener("error", onVideoError);
        try {
          video.pause();
          video.removeAttribute("src");
          video.load();
        } catch {
          /* noop */
        }
      };
    }

    // Chrome / Edge / Firefox / macOS Safari via hls.js + MSE.
    let offlineRetryTimer: number | null = null;

    void (async () => {
      const HlsModule = await import("hls.js");
      if (cancelled) return;
      const Hls = HlsModule.default;

      if (!Hls.isSupported()) {
        setError({
          message: "This browser doesn't support Media Source Extensions.",
          hint:
            "Update to a modern Chrome, Edge, Firefox, or Safari build to play live streams.",
        });
        return;
      }

      hlsInstance = new Hls({
        // Android / cellular: LL-HLS part chasing keeps the buffer so shallow
        // that underruns devolve into endless `waiting`. Trade a little latency
        // for a steadier edge; desktop keeps LL mode + workers.
        ...(mobileLiveReliability
          ? {
              lowLatencyMode: false,
              enableWorker: false,
              liveSyncDurationCount: 5,
              liveMaxLatencyDurationCount: 14,
              maxLiveSyncPlaybackRate: 1.75,
              fragLoadingTimeOut: 12000,
              manifestLoadingTimeOut: 12000,
              levelLoadingTimeOut: 12000,
              startFragPrefetch: true,
              maxBufferHole: 0.25,
            }
          : {
              lowLatencyMode: true,
              enableWorker: true,
              fragLoadingTimeOut: 4000,
              manifestLoadingTimeOut: 4000,
              levelLoadingTimeOut: 4000,
            }),
        // Required so seeking back to a known PROGRAM-DATE-TIME works even
        // outside `seekable` — used by snapToLiveEdge after long stalls.
        liveDurationInfinity: true,
        // Slightly deeper back-buffer on mobile gives the demuxer room when
        // the network jitters; desktop stays tight for memory.
        backBufferLength: mobileLiveReliability ? 8 : 4,
        // The previous fMP4-on-Chrome failure usually came down to AAC codec
        // strings: OBS sometimes negotiates HE-AAC v1 which Chrome's MSE
        // rejects ("unsupported source"). Forcing LC-AAC here prevents
        // hls.js from probing a codec the runtime can't decode.
        defaultAudioCodec: "mp4a.40.2",
      });

      hlsInstance.on(Hls.Events.MEDIA_ATTACHED, () => {
        // hls.js attaches a MediaSource blob URL; nothing to do, but log so
        // the failure / success boundary is obvious in the console when
        // diagnosing the Chrome MSE path.
        if (process.env.NODE_ENV !== "production") {
          // eslint-disable-next-line no-console
          console.debug("[live] MSE attached", { src });
        }
      });

      hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
        if (cancelled) return;
        // Manifest came back — clear any pending offline poll and resume.
        if (offlineRetryTimer != null) {
          window.clearTimeout(offlineRetryTimer);
          offlineRetryTimer = null;
        }
        setOffline(false);
        tryInitialUserLiveSnap();
        void attemptPlay();
      });

      const scheduleManifestRetry = () => {
        if (cancelled || !hlsInstance) return;
        if (offlineRetryTimer != null) return; // already scheduled
        offlineRetryTimer = window.setTimeout(() => {
          offlineRetryTimer = null;
          if (cancelled || !hlsInstance) return;
          try {
            hlsInstance.loadSource(src);
          } catch {
            // If hls.js is in a state where loadSource throws, schedule
            // another attempt; we'll keep polling until either the manifest
            // succeeds or the component unmounts.
            scheduleManifestRetry();
          }
        }, OFFLINE_RETRY_INTERVAL_MS);
      };

      hlsInstance.on(Hls.Events.ERROR, (_evt, data) => {
        if (cancelled || !hlsInstance) return;
        const fatal = data.fatal === true;

        // Manifest 404 / "stream not found" is the canonical "offline" signal
        // from MediaMTX (it returns 404 until a publisher connects). Surface
        // a calm placeholder instead of the diagnostic overlay, and re-poll
        // the manifest on a slow timer so a mid-page go-live resumes
        // playback automatically.
        const networkResponseStatus =
          data.networkDetails?.status ??
          (data.response as { code?: number } | undefined)?.code ??
          null;
        const isManifestMiss =
          data.details === Hls.ErrorDetails.MANIFEST_LOAD_ERROR &&
          (networkResponseStatus === 404 || networkResponseStatus === 0);

        if (isManifestMiss) {
          // Expected during pre-stream / offline windows. Don't log per-retry;
          // it would spam the console every OFFLINE_RETRY_INTERVAL_MS.
          if (!offlineRef.current) {
            setOffline(true);
            setWaiting(false);
          }
          scheduleManifestRetry();
          return;
        }

        if (!fatal) {
          // Non-fatal: hls.js will retry transparently. Don't log — LL-HLS
          // emits these every few seconds (preload-hint timeouts, partial
          // load misses) and noise drowns out anything actionable.
          return;
        }

        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          // Other NETWORK_ERRORs (timeout, transient 5xx) — nudge hls.js to
          // recover before giving up.
          try {
            hlsInstance.startLoad();
            return;
          } catch {
            /* fall through to surfaced error */
          }
        }
        if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
          try {
            hlsInstance.recoverMediaError();
            return;
          } catch {
            /* fall through */
          }
        }

        // We're about to surface an error to the user — log the full data
        // object so the developer console shows exactly what hls.js
        // reported (codec strings, status codes, frag URLs, etc.).
        if (process.env.NODE_ENV !== "production") {
          // eslint-disable-next-line no-console
          console.warn("[live] hls error (fatal, surfacing to user)", {
            type: data.type,
            details: data.details,
            reason: data.reason,
            error: data.error?.message,
            response: data.response,
            networkStatus: networkResponseStatus,
            mediaError: describeMediaError(video),
          });
        }

        // Truly unrecoverable. Surface enough context to debug Chrome-specific
        // codec rejections in the field.
        const codecBits = [
          data.frag?.levelkeys ? "encrypted" : null,
          data.frag?.type ? `frag.type=${data.frag.type}` : null,
          data.mimeType ? `mime=${data.mimeType}` : null,
        ]
          .filter(Boolean)
          .join(" ");
        const detail = [
          `${data.type} / ${data.details}`,
          data.reason ?? data.error?.message ?? null,
          describeMediaError(video),
          codecBits || null,
        ]
          .filter(Boolean)
          .join("\n");
        setError({
          message:
            data.details === "bufferIncompatibleCodecsError" ||
            data.details === "bufferAddCodecError" ||
            data.details === "manifestIncompatibleCodecsError"
              ? "Browser refused this stream's audio/video codec."
              : "Live stream playback failed.",
          detail,
          hint:
            "Click retry below. If this keeps happening in Chrome, the broadcaster's audio is likely HE-AAC — switch OBS to AAC-LC.",
        });
      });

      hlsInstance.attachMedia(video);
      hlsInstance.loadSource(src);

      if (!cancelled) {
        detachLiveRecovery = startLiveRecoveryWatch();
      }
    })();

    return () => {
      cancelled = true;
      detachLiveRecovery();
      if (offlineRetryTimer != null) {
        window.clearTimeout(offlineRetryTimer);
        offlineRetryTimer = null;
      }
      video.removeEventListener("loadedmetadata", onLoadedMetadata);
      video.removeEventListener("loadeddata", onLoadedData);
      video.removeEventListener("canplay", onCanPlay);
      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("waiting", onWaiting);
      video.removeEventListener("stalled", onStalled);
      video.removeEventListener("timeupdate", onProgressOrTimeUpdate);
      video.removeEventListener("progress", onProgressOrTimeUpdate);
      video.removeEventListener("error", onVideoError);
      if (hlsInstance) {
        try {
          hlsInstance.destroy();
        } catch {
          /* noop */
        }
        hlsInstance = null;
      }
      try {
        video.pause();
        video.removeAttribute("src");
        video.load();
      } catch {
        /* noop */
      }
    };
  }, [src, retryToken]);

  // -------------------- Wall-clock / latency tracking --------------------

  /**
   * Drives the LIVE pill timer + behind-live indicator. We tick on `rAF` so
   * the readout follows the real video clock, not just whole-second `timeupdate`
   * events (which fire ~4 Hz and look choppy at low latencies).
   */
  useEffect(() => {
    if (!isLive) {
      setContentTimeMs(null);
      setBehindSeconds(0);
      return;
    }
    const video = videoRef.current;
    if (!video) return;

    let raf = 0;

    const readPlayingDate = (): number | null => {
      // hls.js exposes the active fragment's PROGRAM-DATE-TIME via a getter on
      // the instance. Native HLS surfaces it via `getStartDate()` + currentTime.
      // We grab it through the `<video>` for both code paths because the hls.js
      // instance lives in the effect closure above; reaching it from here would
      // mean storing it in a ref and racing the cleanup.
      try {
        const startDate = (video as HTMLVideoElement & {
          getStartDate?: () => Date;
        }).getStartDate?.();
        if (startDate && !Number.isNaN(startDate.getTime())) {
          return startDate.getTime() + video.currentTime * 1000;
        }
      } catch {
        /* getStartDate throws before metadata loads */
      }
      return null;
    };

    const tick = () => {
      const playingDateMs = readPlayingDate();
      if (playingDateMs != null && startedAtMs != null) {
        setContentTimeMs(playingDateMs - startedAtMs);
        const lag = (Date.now() - playingDateMs) / 1000;
        setBehindSeconds(lag > 0 ? lag : 0);
      } else if (startedAtMs != null) {
        // Fallback: count from broadcast start with no PDT correction. This is
        // the same path the iframe player uses when MediaMTX hasn't tagged the
        // segment with PROGRAM-DATE-TIME yet.
        setContentTimeMs(Date.now() - startedAtMs);
      }
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [isLive, startedAtMs, retryToken]);

  // -------------------- HUD auto-hide --------------------

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let timer: number | null = null;
    const showHud = () => {
      setHudVisible(true);
      if (timer != null) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const video = videoRef.current;
        if (video && !video.paused) setHudVisible(false);
      }, PLAYER_AUTOHIDE_MS);
    };

    showHud();
    container.addEventListener("pointermove", showHud);
    container.addEventListener("pointerdown", showHud);
    container.addEventListener("focusin", showHud);

    return () => {
      if (timer != null) window.clearTimeout(timer);
      container.removeEventListener("pointermove", showHud);
      container.removeEventListener("pointerdown", showHud);
      container.removeEventListener("focusin", showHud);
    };
  }, []);

  // Force HUD visible whenever the player isn't playing.
  useEffect(() => {
    if (paused || waiting || error) setHudVisible(true);
  }, [paused, waiting, error]);

  // -------------------- Video element state mirrors --------------------

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const sync = () => {
      setPaused(video.paused);
      setMuted(video.muted);
      setVolume(video.volume);
    };
    sync();

    const onPlay = () => setPaused(false);
    const onPause = () => setPaused(true);
    const onVolumeChange = () => {
      setMuted(video.muted);
      setVolume(video.volume);
    };
    const onEnterPip = () => setPipActive(true);
    const onLeavePip = () => setPipActive(false);

    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("volumechange", onVolumeChange);
    video.addEventListener("enterpictureinpicture", onEnterPip);
    video.addEventListener("leavepictureinpicture", onLeavePip);

    setPipSupported(
      typeof document !== "undefined" &&
        "pictureInPictureEnabled" in document &&
        Boolean(document.pictureInPictureEnabled) &&
        typeof video.requestPictureInPicture === "function",
    );

    return () => {
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("volumechange", onVolumeChange);
      video.removeEventListener("enterpictureinpicture", onEnterPip);
      video.removeEventListener("leavepictureinpicture", onLeavePip);
    };
  }, [retryToken]);

  // Fullscreen state.
  useEffect(() => {
    const update = () => setIsFullscreen(document.fullscreenElement === containerRef.current);
    document.addEventListener("fullscreenchange", update);
    return () => document.removeEventListener("fullscreenchange", update);
  }, []);

  // -------------------- HUD actions --------------------

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      void video.play().catch(() => {
        if (!video.muted) {
          video.muted = true;
          setMuted(true);
          void video.play().catch(() => {});
        }
      });
    } else {
      video.pause();
    }
  }, []);

  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    if (!video.muted && video.volume === 0) {
      video.volume = 1;
    }
  }, []);

  const onVolumeInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current;
    if (!video) return;
    const v = Number(e.target.value);
    video.volume = v;
    video.muted = v === 0;
  }, []);

  const toggleFullscreen = useCallback(async () => {
    const container = containerRef.current;
    if (!container) return;
    if (document.fullscreenElement === container) {
      try {
        await document.exitFullscreen();
      } catch {
        /* noop */
      }
    } else {
      try {
        await container.requestFullscreen();
      } catch {
        /* noop */
      }
    }
  }, []);

  const togglePip = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;
    try {
      if (document.pictureInPictureElement === video) {
        await document.exitPictureInPicture();
      } else {
        await video.requestPictureInPicture();
      }
    } catch {
      /* noop — likely PiP disabled by user agent */
    }
  }, []);

  const goLiveEdge = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    const seekable = video.seekable;
    if (seekable.length === 0) return;
    try {
      video.currentTime = Math.max(0, seekable.end(seekable.length - 1) - 0.3);
    } catch {
      /* noop */
    }
    if (video.paused) void video.play().catch(() => {});
  }, []);

  const retry = useCallback(() => {
    setError(null);
    setRetryToken((t) => t + 1);
  }, []);

  // -------------------- Render --------------------

  const elapsedLabel =
    isLive && contentTimeMs != null ? formatElapsed(contentTimeMs / 1000) : null;
  const showBehind = isLive && hasFirstFrame && behindSeconds > 1.2;
  const farBehind = behindSeconds > FAR_BEHIND_THRESHOLD_S;

  const containerStyle: CSSProperties = {
    cursor: hudVisible || paused ? "default" : "none",
  };

  return (
    <ViewportFittedPlayerFrame className={className}>
      <div
        ref={containerRef}
        className="absolute inset-0 flex h-full w-full items-center justify-center bg-black"
        style={containerStyle}
        data-hud={hudVisible ? "visible" : "hidden"}
        data-paused={paused ? "true" : "false"}
      >
        <video
          ref={videoRef}
          className="absolute inset-0 h-full w-full object-contain"
          playsInline
          preload="auto"
          autoPlay
          muted={muted}
          aria-label={title ?? "Live stream"}
          onClick={togglePlay}
          onDoubleClick={() => void toggleFullscreen()}
        />

        {/* Loading spinner */}
        {waiting && !error && !offline ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="block h-12 w-12 animate-spin rounded-full border-2 border-white/30 border-t-white/90" />
          </div>
        ) : null}

        {/* Offline placeholder. Calmer than the error overlay because this is
            the expected state between broadcasts. Auto-resumes once the
            manifest comes back online. */}
        {offline && !error ? (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/60 text-center text-white">
            <span className="text-base font-semibold">Stream is offline</span>
            <span className="text-xs text-white/70">
              {isLive
                ? "Waiting for the broadcaster to reconnect…"
                : "We'll start playing as soon as the broadcaster goes live."}
            </span>
          </div>
        ) : null}

        {/* Center play affordance when paused (also catches the autoplay-blocked case) */}
        {paused && !error && !offline && !waiting ? (
          <button
            type="button"
            onClick={togglePlay}
            aria-label="Play"
            className="absolute inset-0 flex items-center justify-center bg-black/30 transition hover:bg-black/40"
          >
            <span className="flex h-20 w-20 items-center justify-center rounded-full bg-white/90 text-black shadow-lg">
              <svg viewBox="0 0 24 24" width="36" height="36" aria-hidden="true">
                <path fill="currentColor" d="M7 5l12 7-12 7V5z" />
              </svg>
            </span>
          </button>
        ) : null}

        {/* Error overlay */}
        {error ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/85 p-4 text-center text-white">
            <p className="max-w-md text-base font-semibold">{error.message}</p>
            {error.hint ? (
              <p className="max-w-md text-sm text-white/75">{error.hint}</p>
            ) : null}
            <div className="mt-1 flex items-center gap-2">
              <button
                type="button"
                onClick={retry}
                className="rounded-full bg-white px-4 py-1.5 text-sm font-semibold text-black hover:bg-white/90"
              >
                Retry
              </button>
            </div>
            {error.detail ? (
              <details className="mt-2 max-w-md text-xs text-white/60">
                <summary className="cursor-pointer select-none">
                  Diagnostics
                </summary>
                <pre className="mt-2 whitespace-pre-wrap break-words text-left font-mono text-[11px]">
                  {error.detail}
                </pre>
              </details>
            ) : null}
          </div>
        ) : null}

        {/* HUD: top-right LIVE pill + behind-live readout */}
        {(isLive || showBehind) && !error ? (
          <div
            className="pointer-events-none absolute left-3 top-3 flex items-center gap-2 transition-opacity"
            style={{ opacity: hudVisible || paused ? 1 : 0 }}
          >
            {isLive ? (
              <button
                type="button"
                onClick={goLiveEdge}
                className={`pointer-events-auto inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider text-white shadow ${
                  farBehind
                    ? "bg-black/70 hover:bg-black/80"
                    : "bg-live"
                }`}
                aria-label={farBehind ? "Jump to live" : "Live"}
                title={farBehind ? "Jump to live" : "Live"}
              >
                <span
                  className={`inline-block h-1.5 w-1.5 rounded-full ${
                    farBehind ? "bg-white/80" : "bg-white live-pulse"
                  }`}
                />
                {farBehind ? "Go live" : "Live"}
                {elapsedLabel ? (
                  <span className="ml-1 font-mono text-[11px] opacity-90">
                    {elapsedLabel}
                  </span>
                ) : null}
              </button>
            ) : null}
            {showBehind && !farBehind ? (
              <span className="rounded bg-black/55 px-2 py-0.5 font-mono text-[11px] text-white/80">
                −{behindSeconds.toFixed(1)}s
              </span>
            ) : null}
          </div>
        ) : null}

        {/* HUD: bottom controls */}
        {!error ? (
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center gap-2 bg-gradient-to-t from-black/70 via-black/30 to-transparent px-3 py-2 transition-opacity"
            style={{ opacity: hudVisible || paused ? 1 : 0 }}
          >
            <button
              type="button"
              onClick={togglePlay}
              className="pointer-events-auto inline-flex h-9 w-9 items-center justify-center rounded-full text-white hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
              aria-label={paused ? "Play" : "Pause"}
            >
              {paused ? (
                <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                  <path fill="currentColor" d="M7 5l12 7-12 7V5z" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                  <path fill="currentColor" d="M6 5h4v14H6zM14 5h4v14h-4z" />
                </svg>
              )}
            </button>

            <div className="pointer-events-auto group flex items-center">
              <button
                type="button"
                onClick={toggleMute}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full text-white hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
                aria-label={muted || volume === 0 ? "Unmute" : "Mute"}
              >
                {muted || volume === 0 ? (
                  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                    <path fill="currentColor" d="M3 9v6h4l5 5V4L7 9H3z" />
                    <path
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      d="M14.5 9l8 8M22.5 9l-8 8"
                    />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                    <path fill="currentColor" d="M3 9v6h4l5 5V4L7 9H3z" />
                    <path
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      d="M16 9.5a3.5 3.5 0 0 1 0 5M18.5 7a6 6 0 0 1 0 10"
                    />
                  </svg>
                )}
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={muted ? 0 : volume}
                onChange={onVolumeInput}
                className="ml-1 w-0 max-w-0 origin-left scale-x-0 opacity-0 transition-all duration-150 ease-out hover:w-24 hover:max-w-24 hover:scale-x-100 hover:opacity-100 group-hover:w-24 group-hover:max-w-24 group-hover:scale-x-100 group-hover:opacity-100 focus-visible:w-24 focus-visible:max-w-24 focus-visible:scale-x-100 focus-visible:opacity-100"
                aria-label="Volume"
              />
            </div>

            <div className="pointer-events-none flex-1" />

            {pipSupported ? (
              <button
                type="button"
                onClick={() => void togglePip()}
                className="pointer-events-auto inline-flex h-9 w-9 items-center justify-center rounded-full text-white hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
                aria-label="Picture-in-Picture"
                aria-pressed={pipActive}
              >
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
                  <rect
                    x="2"
                    y="2"
                    width="20"
                    height="20"
                    rx="2.5"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinejoin="round"
                  />
                  <rect
                    x="12"
                    y="12"
                    width="7"
                    height="7"
                    rx="1.5"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            ) : null}

            <button
              type="button"
              onClick={() => void toggleFullscreen()}
              className="pointer-events-auto inline-flex h-9 w-9 items-center justify-center rounded-full text-white hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
              aria-label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
              aria-pressed={isFullscreen}
            >
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
                <polyline
                  points="15 3 21 3 21 9"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <polyline
                  points="9 21 3 21 3 15"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <polyline
                  points="21 15 21 21 15 21"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <polyline
                  points="3 9 3 3 9 3"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
        ) : null}
      </div>
    </ViewportFittedPlayerFrame>
  );
}
