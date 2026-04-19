"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import {
  CONTENT_RATINGS,
  ContentRating,
  RATING_META,
} from "@/lib/ratings";

type Props = {
  initialHidden: ContentRating[];
};

export function ContentFilterCard({ initialHidden }: Props) {
  const router = useRouter();
  const [hidden, setHidden] = useState<Set<ContentRating>>(
    new Set(initialHidden),
  );
  const [savedHidden, setSavedHidden] = useState<Set<ContentRating>>(
    new Set(initialHidden),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const dirty =
    hidden.size !== savedHidden.size ||
    [...hidden].some((r) => !savedHidden.has(r));

  function toggle(r: ContentRating) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(r)) next.delete(r);
      else next.add(r);
      return next;
    });
    setOk(false);
    setError(null);
  }

  async function save() {
    setSaving(true);
    setError(null);
    setOk(false);
    try {
      const res = await fetch("/api/me/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hiddenRatings: [...hidden] }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        hiddenRatings?: ContentRating[];
      };
      if (!res.ok) {
        setError(data.error ?? `Save failed (HTTP ${res.status}).`);
        setSaving(false);
        return;
      }
      const saved = new Set<ContentRating>(data.hiddenRatings ?? [...hidden]);
      setSavedHidden(saved);
      setHidden(new Set(saved));
      setOk(true);
      setSaving(false);
      router.refresh();
    } catch (err) {
      console.error(err);
      setError("Network error.");
      setSaving(false);
    }
  }

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <button
        type="button"
        id="content-filter-heading"
        className="flex w-full items-start justify-between gap-3 rounded-md px-1 py-0.5 text-left outline-none ring-accent hover:bg-surface-2/50 focus-visible:ring-2"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-controls="content-filter-panel"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-base font-semibold">Content filter</span>
          {!expanded ? (
            <span className="mt-1 block text-xs text-muted">
              Expand to choose which ratings you want to see across the site.
            </span>
          ) : null}
        </span>
        <span className="flex shrink-0 items-center gap-2 pt-0.5">
          {dirty ? (
            <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[11px] font-medium text-amber-100">
              Unsaved
            </span>
          ) : null}
          <span className="text-xs text-muted tabular-nums">
            {CONTENT_RATINGS.length - hidden.size} visible /{" "}
            {CONTENT_RATINGS.length}
          </span>
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
          id="content-filter-panel"
          role="region"
          aria-labelledby="content-filter-heading"
          className="mt-3 border-t border-border pt-3"
        >
          {error ? (
            <div className="mb-3 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">
              {error}
            </div>
          ) : null}
          {ok ? (
            <div className="mb-3 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
              Preferences saved.
            </div>
          ) : null}

          <ul className="mb-3 flex flex-col gap-2">
            {CONTENT_RATINGS.map((r) => {
              const meta = RATING_META[r];
              const isHidden = hidden.has(r);
              const isVisible = !isHidden;
              return (
                <li key={r}>
                  <label className="flex cursor-pointer items-start gap-3 rounded-md border border-border bg-surface-2/60 px-3 py-2 hover:bg-surface-2">
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={isVisible}
                      onChange={() => toggle(r)}
                      disabled={saving}
                      aria-label={`Show ${meta.label} content`}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="mb-0.5 flex items-center gap-2">
                        <span
                          className={`inline-flex items-center justify-center rounded px-1.5 py-0.5 font-display text-[11px] uppercase tracking-wider ${meta.badgeClass}`}
                        >
                          {meta.label}
                        </span>
                        <span className="text-xs text-muted">
                          {isHidden ? "Hidden" : "Visible"}
                        </span>
                      </span>
                      <span className="block text-xs text-muted">
                        {meta.description}
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>

          <button
            type="button"
            onClick={save}
            disabled={saving || !dirty}
            className="w-full rounded-md bg-accent px-3 py-2 text-sm font-semibold text-bg hover:bg-accent-hover disabled:opacity-60"
          >
            {saving ? "Saving…" : dirty ? "Save filter" : "Saved"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
