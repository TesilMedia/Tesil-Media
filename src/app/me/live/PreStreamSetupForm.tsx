"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";

import { CategoryPicker } from "@/components/CategoryPicker";
import { LivePlayerToggle } from "@/components/LivePlayerToggle";
import { VideoCategory, categoriesFromDb } from "@/lib/categories";
import {
  CONTENT_RATINGS,
  ContentRating,
  DEFAULT_VIDEO_RATING,
  RATING_META,
} from "@/lib/ratings";

type StreamState = {
  title: string;
  category: string | null;
  category2: string | null;
  rating: string;
  thumbnail: string | null;
  ingestActive: boolean;
  waitingRoomOpen: boolean;
  isLive: boolean;
  startedAt: string | null;
  vodVideoId?: string | null;
};

type SetupResponse = {
  ok?: boolean;
  error?: string;
  slug?: string;
  stream?: StreamState;
};

type Props = {
  slug: string;
  initialTitle: string;
  initialCategory: string | null;
  initialCategory2: string | null;
  initialRating: string;
  initialThumbnail: string | null;
  initialIngestActive: boolean;
  initialWaitingRoomOpen: boolean;
  initialIsLive: boolean;
  initialStartedAt: Date | string | null;
  initialVodVideoId: string | null;
};

function normalizeRating(value: string): ContentRating {
  const upper = value.toUpperCase();
  if (upper === "PG-13") return "PG13";
  return (CONTENT_RATINGS as readonly string[]).includes(upper)
    ? (upper as ContentRating)
    : DEFAULT_VIDEO_RATING;
}

export function PreStreamSetupForm({
  slug,
  initialTitle,
  initialCategory,
  initialCategory2,
  initialRating,
  initialThumbnail,
  initialIngestActive,
  initialWaitingRoomOpen,
  initialIsLive,
  initialStartedAt,
  initialVodVideoId,
}: Props) {
  const router = useRouter();
  const [title, setTitle] = useState(initialTitle);
  const [categories, setCategories] = useState<VideoCategory[]>(() =>
    categoriesFromDb(initialCategory, initialCategory2),
  );
  const [rating, setRating] = useState<ContentRating>(
    normalizeRating(initialRating),
  );
  const [thumbnail, setThumbnail] = useState<string | null>(initialThumbnail);
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [removeThumbnail, setRemoveThumbnail] = useState(false);
  const [ingestActive, setIngestActive] = useState(initialIngestActive);
  const [waitingRoomOpen, setWaitingRoomOpen] = useState(initialWaitingRoomOpen);
  const [isLive, setIsLive] = useState(initialIsLive);
  const [vodVideoId, setVodVideoId] = useState<string | null>(initialVodVideoId);
  const [startedAt, setStartedAt] = useState<string | null>(
    initialStartedAt instanceof Date
      ? initialStartedAt.toISOString()
      : initialStartedAt,
  );
  const [saving, setSaving] = useState(false);
  const [wrBusy, setWrBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function refreshState() {
    try {
      const res = await fetch("/api/stream/setup", { cache: "no-store" });
      const data = (await res.json().catch(() => ({}))) as SetupResponse;
      if (!res.ok || !data.stream) return;
      setIngestActive(Boolean(data.stream.ingestActive));
      setWaitingRoomOpen(Boolean(data.stream.waitingRoomOpen));
      setIsLive(Boolean(data.stream.isLive));
      setStartedAt(data.stream.startedAt ?? null);
      setVodVideoId(data.stream.vodVideoId ?? null);
      if (!thumbnailFile && !removeThumbnail) {
        setThumbnail(data.stream.thumbnail ?? null);
      }
    } catch {
      // Ignore transient status refresh failures.
    }
  }

  async function patchWaitingRoom(open: boolean) {
    if (isLive) return;
    setError(null);
    setSuccess(null);
    setWrBusy(true);
    try {
      const formData = new FormData();
      formData.set("waitingRoomOpen", open ? "1" : "0");
      const res = await fetch("/api/stream/setup", {
        method: "PATCH",
        body: formData,
      });
      const data = (await res.json().catch(() => ({}))) as SetupResponse;
      if (!res.ok || !data.stream) {
        setError(
          data.error ?? `Failed to update waiting room (HTTP ${res.status}).`,
        );
        return;
      }
      setWaitingRoomOpen(Boolean(data.stream.waitingRoomOpen));
      setVodVideoId(data.stream.vodVideoId ?? null);
      router.refresh();
    } catch {
      setError("Network error while updating waiting room.");
    } finally {
      setWrBusy(false);
    }
  }

  async function saveSetup(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError("Title is required.");
      return;
    }
    if (categories.length === 0) {
      setError("Please choose at least one category.");
      return;
    }

    setSaving(true);
    try {
      const formData = new FormData();
      formData.set("title", trimmedTitle);
      formData.set("category", categories[0] ?? "");
      formData.set("category2", categories[1] ?? "");
      formData.set("rating", rating);
      if (thumbnailFile) {
        formData.set("thumbnail", thumbnailFile);
      }
      if (removeThumbnail) {
        formData.set("removeThumbnail", "1");
      }

      const res = await fetch("/api/stream/setup", {
        method: "PATCH",
        body: formData,
      });
      const data = (await res.json().catch(() => ({}))) as SetupResponse;
      if (!res.ok || !data.stream) {
        setError(data.error ?? `Failed to save setup (HTTP ${res.status}).`);
        return;
      }

      setTitle(data.stream.title);
      setCategories(
        categoriesFromDb(data.stream.category, data.stream.category2),
      );
      setRating(normalizeRating(data.stream.rating));
      setThumbnail(data.stream.thumbnail ?? null);
      setThumbnailFile(null);
      setRemoveThumbnail(false);
      setIngestActive(Boolean(data.stream.ingestActive));
      setWaitingRoomOpen(Boolean(data.stream.waitingRoomOpen));
      setIsLive(Boolean(data.stream.isLive));
      setStartedAt(data.stream.startedAt ?? null);
      setVodVideoId(data.stream.vodVideoId ?? null);
      setSuccess("Setup saved.");
      router.refresh();
    } catch {
      setError("Network error while saving setup.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {error ? (
        <div className="rounded-md border border-danger-border bg-danger-bg px-3 py-2 text-sm text-danger">
          {error}
        </div>
      ) : null}
      {success ? (
        <div className="rounded-md border border-success-border bg-success-bg px-3 py-2 text-sm text-success">
          {success}
        </div>
      ) : null}

      <section className="space-y-3">
        <LivePlayerToggle
          slug={slug}
          isLive={isLive}
          title={title}
          startedAt={startedAt}
          vodVideoId={vodVideoId}
        />
        <div className="flex flex-wrap items-center gap-2">
          {isLive ? (
            <span className="rounded bg-live px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-white">
              Live
            </span>
          ) : ingestActive ? (
            <span className="rounded bg-accent px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-on-accent">
              Ingest active
            </span>
          ) : (
            <span className="rounded bg-surface-2 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-muted">
              Waiting for OBS
            </span>
          )}
          <button
            type="button"
            onClick={() => void refreshState()}
            className="rounded-full border border-border bg-surface px-3 py-1 text-xs hover:bg-surface-2"
          >
            Refresh status
          </button>
          <Link
            href={vodVideoId && isLive ? `/watch/${vodVideoId}` : `/live/${slug}`}
            className="rounded-full border border-border bg-surface px-3 py-1 text-xs hover:bg-surface-2"
          >
            Open public page
          </Link>
        </div>
        <p className="text-xs text-muted">
          Save your setup, then start streaming in OBS. The stream goes live
          automatically the moment OBS connects.
        </p>
      </section>

      <section className="rounded-lg border border-border bg-surface p-4">
        <h2 className="text-sm font-semibold text-text">Viewer waiting room</h2>
        <p className="mt-1 text-xs text-muted">
          When on, your public live URL shows a &quot;Starting soon&quot; page
          until OBS starts streaming. Turn this on before OBS if you want
          viewers waiting while you finish title, categories, and thumbnail.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={wrBusy || isLive}
            onClick={() => void patchWaitingRoom(!waitingRoomOpen)}
            className="rounded-md border border-border bg-surface-2 px-4 py-2 text-sm font-medium hover:bg-surface disabled:opacity-60"
          >
            {wrBusy
              ? "Updating…"
              : waitingRoomOpen
                ? "Waiting room: on"
                : "Waiting room: off"}
          </button>
          <span className="text-xs text-muted">
            {isLive
              ? "Ended when OBS started streaming."
              : waitingRoomOpen
                ? "Visitors see Starting soon."
                : "Visitors see the normal live page (offline until ingest)."}
          </span>
        </div>
      </section>

      <section className="rounded-lg border border-border bg-surface p-4">
        <form onSubmit={saveSetup} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted">Title *</span>
            <input
              name="title"
              type="text"
              required
              maxLength={200}
              value={title}
              onChange={(e) => setTitle(e.currentTarget.value)}
              disabled={saving}
              className="rounded-md border border-border bg-bg px-3 py-2 outline-none focus:border-accent/60 disabled:opacity-60"
            />
          </label>

          <CategoryPicker
            value={categories}
            onChange={setCategories}
            disabled={saving}
            required
          />

          <fieldset
            className="flex flex-col gap-2 text-sm"
            disabled={saving}
          >
            <legend className="text-muted">Content rating *</legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {CONTENT_RATINGS.map((r) => {
                const meta = RATING_META[r];
                const selected = rating === r;
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRating(r)}
                    aria-pressed={selected}
                    className={`flex flex-col items-start gap-1 rounded-md border px-3 py-2 text-left transition ${
                      selected
                        ? "border-accent/70 bg-surface-2"
                        : "border-border bg-bg hover:border-accent/50 hover:bg-surface-2"
                    } disabled:opacity-60`}
                  >
                    <span
                      className={`inline-flex items-center justify-center rounded px-1.5 py-0.5 font-display text-[11px] uppercase tracking-wider ${meta.badgeClass}`}
                    >
                      {meta.label}
                    </span>
                    <span className="text-xs text-muted">{meta.description}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div className="flex flex-col gap-1 text-sm">
            <span className="text-muted">Thumbnail (optional)</span>
            {thumbnail && !removeThumbnail ? (
              <div className="overflow-hidden rounded-md border border-border">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={thumbnail}
                  alt=""
                  className="h-32 w-full object-cover"
                />
              </div>
            ) : null}
            <label className="flex cursor-pointer items-center justify-between gap-3 rounded-md border border-dashed border-border bg-bg px-3 py-3 text-sm hover:border-accent/50 hover:bg-surface-2">
              <span className="min-w-0 flex-1 truncate text-text">
                {thumbnailFile?.name ?? "Choose thumbnail image"}
              </span>
              <span className="shrink-0 rounded-full bg-surface-2 px-3 py-1 text-xs text-muted">
                Browse
              </span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="hidden"
                onChange={(e) => {
                  const file = e.currentTarget.files?.[0] ?? null;
                  setThumbnailFile(file);
                  if (file) setRemoveThumbnail(false);
                }}
                disabled={saving}
              />
            </label>
            {thumbnail || thumbnailFile ? (
              <button
                type="button"
                className="w-fit rounded-full border border-border bg-surface px-3 py-1 text-xs hover:bg-surface-2"
                onClick={() => {
                  setThumbnailFile(null);
                  setRemoveThumbnail(true);
                  setThumbnail(null);
                }}
                disabled={saving}
              >
                Remove thumbnail
              </button>
            ) : null}
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="submit"
              disabled={saving}
              className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-on-accent hover:bg-accent-hover disabled:opacity-60"
            >
              {saving ? "Saving..." : "Save setup"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
