"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Props = {
  slug: string;
  isLive: boolean;
  ingestActive: boolean;
  hasStreamKey: boolean;
};

type KeyResponse = {
  ok?: boolean;
  streamKey?: string;
  slug?: string;
  isLive?: boolean;
  ingestActive?: boolean;
  error?: string;
};

const SERVER_URL = "rtmp://localhost:1935/live";

type SetupResponse = {
  ok?: boolean;
  stream?: {
    ingestActive?: boolean;
    isLive?: boolean;
  };
};

export function GoLiveCard({ slug, isLive, ingestActive, hasStreamKey }: Props) {
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [loadingKey, setLoadingKey] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "copied">("idle");
  const [error, setError] = useState<string | null>(null);
  const [liveState, setLiveState] = useState(isLive);
  const [ingestState, setIngestState] = useState(ingestActive);
  const [expanded, setExpanded] = useState(false);

  const streamTarget = useMemo(() => {
    const key = revealedKey ?? "••••••••••••••••";
    return `${slug}?key=${key}`;
  }, [revealedKey, slug]);

  useEffect(() => {
    if (!expanded) return;
    let cancelled = false;

    const poll = async () => {
      try {
        const res = await fetch("/api/stream/setup", { cache: "no-store" });
        const data = (await res.json().catch(() => ({}))) as SetupResponse;
        if (cancelled || !res.ok || !data.stream) return;
        setIngestState(Boolean(data.stream.ingestActive));
        setLiveState(Boolean(data.stream.isLive));
      } catch {
        // Ignore transient polling failures.
      }
    };

    void poll();
    const interval = setInterval(() => {
      void poll();
    }, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [expanded]);

  async function fetchKey() {
    setError(null);
    setLoadingKey(true);
    try {
      const res = await fetch("/api/stream/key", { method: "GET" });
      const data = (await res.json().catch(() => ({}))) as KeyResponse;
      if (!res.ok || !data.streamKey) {
        setError(data.error ?? `Failed to load key (HTTP ${res.status}).`);
        return;
      }
      setRevealedKey(data.streamKey);
      if (typeof data.isLive === "boolean") setLiveState(data.isLive);
      if (typeof data.ingestActive === "boolean") setIngestState(data.ingestActive);
    } catch (err) {
      console.error(err);
      setError("Network error while loading stream key.");
    } finally {
      setLoadingKey(false);
    }
  }

  async function rotateKey() {
    setError(null);
    setRotating(true);
    try {
      const res = await fetch("/api/stream/key", { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as KeyResponse;
      if (!res.ok || !data.streamKey) {
        setError(data.error ?? `Failed to rotate key (HTTP ${res.status}).`);
        return;
      }
      setRevealedKey(data.streamKey);
      if (typeof data.isLive === "boolean") setLiveState(data.isLive);
      if (typeof data.ingestActive === "boolean") setIngestState(data.ingestActive);
    } catch (err) {
      console.error(err);
      setError("Network error while rotating stream key.");
    } finally {
      setRotating(false);
    }
  }

  function copyWithExecCommand(value: string): boolean {
    const ta = document.createElement("textarea");
    ta.value = value;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    ta.style.top = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, value.length);
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } finally {
      document.body.removeChild(ta);
    }
    return ok;
  }

  async function copyToClipboard(value: string) {
    setError(null);
    let copied = false;
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
        copied = true;
      }
    } catch (err) {
      console.error(err);
    }
    if (!copied) {
      try {
        copied = copyWithExecCommand(value);
      } catch (err) {
        console.error(err);
      }
    }
    if (!copied) {
      setError("Could not copy to clipboard.");
      return;
    }
    setCopyState("copied");
    setTimeout(() => setCopyState("idle"), 1_500);
  }

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <button
        type="button"
        id="go-live-heading"
        className="flex w-full items-start justify-between gap-3 rounded-md px-1 py-0.5 text-left outline-none ring-accent hover:bg-surface-2/50 focus-visible:ring-2"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-controls="go-live-panel"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-base font-semibold">Go live with OBS</span>
          {!expanded ? (
            <span className="mt-1 block text-xs text-muted">
              Expand to configure RTMP server and stream key.
            </span>
          ) : null}
        </span>
        <span className="flex shrink-0 items-center gap-2 pt-0.5">
          {liveState ? (
            <span className="inline-flex items-center gap-1 rounded bg-live px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-white">
              <span className="live-pulse inline-block h-1.5 w-1.5 rounded-full bg-white" />
              Live
            </span>
          ) : ingestState ? (
            <span className="rounded bg-accent px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-on-accent">
              Preview ready
            </span>
          ) : (
            <span className="rounded bg-surface-2 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-muted">
              Offline
            </span>
          )}
          <svg
            className={`h-5 w-5 shrink-0 text-muted transition-transform ${expanded ? "rotate-180" : ""}`}
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden
          >
            <path
              fillRule="evenodd"
              d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.25a.75.75 0 01-1.06 0L5.21 8.29a.75.75 0 01.02-1.08z"
              clipRule="evenodd"
            />
          </svg>
        </span>
      </button>

      {expanded ? (
        <div
          id="go-live-panel"
          role="region"
          aria-labelledby="go-live-heading"
          className="mt-3 border-t border-border pt-3"
        >
          {error ? (
            <div className="mb-3 rounded-md border border-danger-border bg-danger-bg px-3 py-2 text-xs text-danger">
              {error}
            </div>
          ) : null}

          <div className="space-y-3">
            <label className="block text-xs text-muted">
              Server
              <div className="mt-1 flex gap-2">
                <input
                  readOnly
                  value={SERVER_URL}
                  className="min-w-0 flex-1 rounded-md border border-border bg-bg px-3 py-1.5 text-sm text-text"
                />
                <button
                  type="button"
                  onClick={() => copyToClipboard(SERVER_URL)}
                  className="shrink-0 rounded-md border border-border bg-surface-2 px-3 py-1.5 text-sm hover:bg-surface"
                >
                  Copy
                </button>
              </div>
            </label>

            <label className="block text-xs text-muted">
              Stream key
              <div className="mt-1 space-y-2">
                <input
                  readOnly
                  value={streamTarget}
                  className="w-full min-w-0 rounded-md border border-border bg-bg px-3 py-1.5 text-sm text-text"
                />
                <div className="grid w-full grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (revealedKey) {
                        setRevealedKey(null);
                        return;
                      }
                      void fetchKey();
                    }}
                    disabled={loadingKey || rotating}
                    className="min-w-0 rounded-md border border-border bg-surface-2 px-2 py-1.5 text-center text-sm hover:bg-surface disabled:opacity-60"
                  >
                    {revealedKey
                      ? "Hide"
                      : loadingKey
                        ? "Loading…"
                        : hasStreamKey
                          ? "Reveal"
                          : "Create"}
                  </button>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(streamTarget)}
                    disabled={!revealedKey}
                    className="min-w-0 rounded-md border border-border bg-surface-2 px-2 py-1.5 text-center text-sm hover:bg-surface disabled:opacity-60"
                  >
                    {copyState === "copied" ? "Copied" : "Copy"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void rotateKey()}
                    disabled={rotating || loadingKey}
                    className="min-w-0 rounded-md border border-border bg-surface-2 px-2 py-1.5 text-center text-sm hover:bg-surface disabled:opacity-60"
                  >
                    {rotating ? "Regenerating…" : "Regenerate"}
                  </button>
                </div>
              </div>
            </label>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Link
              href="/me/live"
              className="rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-on-accent hover:bg-accent-hover"
            >
              Open pre-stream setup
            </Link>
            <Link
              href={`/live/${slug}`}
              className="rounded-full border border-border bg-surface px-3 py-1.5 text-xs hover:bg-surface-2"
            >
              Open public page
            </Link>
          </div>

          {!liveState && ingestState ? (
            <p className="mt-2 text-xs text-muted">
              OBS is publishing, but viewers are still in the waiting room until
              you press <strong>Go live</strong> in pre-stream setup.
            </p>
          ) : null}

          <details className="mt-3 rounded-md border border-border bg-surface-2 px-3 py-2 text-xs text-muted">
            <summary className="cursor-pointer text-sm font-medium text-text">
              How to set up OBS
            </summary>
            <ol className="mt-2 list-decimal space-y-1 pl-5">
              <li>Open OBS and go to Settings, then Stream.</li>
              <li>Choose Service: Custom.</li>
              <li>Set Server to {SERVER_URL}.</li>
              <li>Set Stream Key to the value shown above.</li>
              <li>Click Start Streaming. Your live page updates automatically.</li>
            </ol>
          </details>
        </div>
      ) : null}
    </div>
  );
}
