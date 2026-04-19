"use client";

import { useMemo, useState } from "react";

type Props = {
  slug: string;
  isLive: boolean;
  hasStreamKey: boolean;
};

type KeyResponse = {
  ok?: boolean;
  streamKey?: string;
  slug?: string;
  isLive?: boolean;
  error?: string;
};

const SERVER_URL = "rtmp://localhost:1935/live";

export function GoLiveCard({ slug, isLive, hasStreamKey }: Props) {
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [loadingKey, setLoadingKey] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "copied">("idle");
  const [error, setError] = useState<string | null>(null);
  const [liveState, setLiveState] = useState(isLive);

  const streamTarget = useMemo(() => {
    const key = revealedKey ?? "••••••••••••••••";
    return `${slug}?key=${key}`;
  }, [revealedKey, slug]);

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
    } catch (err) {
      console.error(err);
      setError("Network error while rotating stream key.");
    } finally {
      setRotating(false);
    }
  }

  async function copyToClipboard(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopyState("copied");
      setTimeout(() => setCopyState("idle"), 1_500);
    } catch (err) {
      console.error(err);
      setError("Could not copy to clipboard.");
    }
  }

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">Go live with OBS</h2>
          <p className="mt-1 text-xs text-muted">
            Start OBS on your machine and publish directly to Tesil over RTMP.
          </p>
        </div>
        {liveState ? (
          <span className="inline-flex items-center gap-1 rounded bg-live px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-white">
            <span className="live-pulse inline-block h-1.5 w-1.5 rounded-full bg-white" />
            Live
          </span>
        ) : (
          <span className="rounded bg-surface-2 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-muted">
            Offline
          </span>
        )}
      </div>

      {error ? (
        <div className="mb-3 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">
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
          <div className="mt-1 flex flex-col gap-2 sm:flex-row">
            <input
              readOnly
              value={streamTarget}
              className="min-w-0 flex-1 rounded-md border border-border bg-bg px-3 py-1.5 text-sm text-text"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  if (revealedKey) return;
                  void fetchKey();
                }}
                disabled={loadingKey || rotating}
                className="rounded-md border border-border bg-surface-2 px-3 py-1.5 text-sm hover:bg-surface disabled:opacity-60"
              >
                {revealedKey ? "Revealed" : loadingKey ? "Loading…" : hasStreamKey ? "Reveal" : "Create"}
              </button>
              <button
                type="button"
                onClick={() => copyToClipboard(streamTarget)}
                disabled={!revealedKey}
                className="rounded-md border border-border bg-surface-2 px-3 py-1.5 text-sm hover:bg-surface disabled:opacity-60"
              >
                {copyState === "copied" ? "Copied" : "Copy"}
              </button>
              <button
                type="button"
                onClick={() => void rotateKey()}
                disabled={rotating || loadingKey}
                className="rounded-md border border-border bg-surface-2 px-3 py-1.5 text-sm hover:bg-surface disabled:opacity-60"
              >
                {rotating ? "Regenerating…" : "Regenerate"}
              </button>
            </div>
          </div>
        </label>
      </div>

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
  );
}
