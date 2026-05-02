"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

import {
  ThumbnailFramePicker,
  canScrubVideoForThumbnail,
} from "@/components/ThumbnailFramePicker";
import { CategoryPicker } from "@/components/CategoryPicker";
import {
  CONTENT_RATINGS,
  ContentRating,
  DEFAULT_VIDEO_RATING,
  RATING_META,
  isContentRating,
} from "@/lib/ratings";
import {
  VideoCategory,
  categoriesFromDb,
} from "@/lib/categories";

type Video = {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  category2: string | null;
  rating: string;
  thumbnail: string | null;
  sourceUrl: string;
};

export function EditVideoForm({ video }: { video: Video }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState(video.title);
  const [description, setDescription] = useState(video.description ?? "");
  const [categories, setCategories] = useState<VideoCategory[]>(() =>
    categoriesFromDb(video.category, video.category2),
  );
  const [rating, setRating] = useState<ContentRating>(
    isContentRating(video.rating) ? video.rating : DEFAULT_VIDEO_RATING,
  );
  const [thumbName, setThumbName] = useState<string | null>(null);
  const [removeThumb, setRemoveThumb] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  function assignThumbnailInput(file: File | null) {
    const input = fileRef.current;
    if (!input) return;
    const dt = new DataTransfer();
    if (file) dt.items.add(file);
    input.files = dt.files;
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setOk(false);
    setSaving(true);

    if (categories.length === 0) {
      setError("Please choose at least one category.");
      setSaving(false);
      return;
    }

    const fd = new FormData();
    fd.set("title", title);
    fd.set("description", description);
    fd.set("category", categories[0] ?? "");
    fd.set("category2", categories[1] ?? "");
    fd.set("rating", rating);
    const file = fileRef.current?.files?.[0];
    if (file) fd.set("thumbnail", file);
    if (removeThumb && !file) fd.set("removeThumbnail", "1");

    try {
      const res = await fetch(`/api/videos/${video.id}`, {
        method: "PATCH",
        body: fd,
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? `Save failed (HTTP ${res.status}).`);
        setSaving(false);
        return;
      }
      setOk(true);
      setSaving(false);
      setThumbName(null);
      setRemoveThumb(false);
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    } catch (err) {
      console.error(err);
      setError("Network error.");
      setSaving(false);
    }
  }

  const hasExistingThumb = Boolean(video.thumbnail) && !removeThumb;
  const showFramePicker = canScrubVideoForThumbnail(video.sourceUrl);

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      {error ? (
        <div className="rounded-md border border-danger-border bg-danger-bg px-3 py-2 text-sm text-danger">
          {error}
        </div>
      ) : null}
      {ok ? (
        <div className="rounded-md border border-success-border bg-success-bg px-3 py-2 text-sm text-success">
          Saved.
        </div>
      ) : null}

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-muted">Title</span>
        <input
          type="text"
          required
          maxLength={200}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="rounded-md border border-border bg-surface px-3 py-2 outline-none focus:border-accent/60"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-muted">Description</span>
        <textarea
          rows={5}
          maxLength={5_000}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="resize-y rounded-md border border-border bg-surface px-3 py-2 outline-none focus:border-accent/60"
        />
      </label>

      <CategoryPicker
        value={categories}
        onChange={setCategories}
        disabled={saving}
        required
      />

      <fieldset className="flex flex-col gap-2 text-sm" disabled={saving}>
        <legend className="text-muted">Content rating</legend>
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
                    : "border-border bg-surface hover:border-accent/50 hover:bg-surface-2"
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

      <div className="flex flex-col gap-2 text-sm">
        <span className="text-muted">Thumbnail</span>
        <div className="flex items-start gap-3">
          <div className="h-20 w-32 shrink-0 overflow-hidden rounded-md bg-surface-2">
            {hasExistingThumb && video.thumbnail ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={video.thumbnail}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-[10px] uppercase tracking-wider text-muted">
                None
              </div>
            )}
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <label className="flex min-w-0 cursor-pointer items-center justify-between gap-3 rounded-md border border-dashed border-border bg-surface px-3 py-2 text-xs hover:border-accent/60 hover:bg-surface-2">
              <span className="min-w-0 flex-1 truncate">
                {thumbName ?? "Replace thumbnail (jpg/png/webp/gif)"}
              </span>
              <span className="shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-muted">
                Browse
              </span>
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="hidden"
                onChange={(e) => {
                  setThumbName(e.currentTarget.files?.[0]?.name ?? null);
                  setRemoveThumb(false);
                }}
              />
            </label>
            {showFramePicker ? (
              <ThumbnailFramePicker
                videoUrl={video.sourceUrl}
                disabled={saving}
                onFrameChosen={(file) => {
                  assignThumbnailInput(file);
                  setThumbName(file.name);
                  setRemoveThumb(false);
                }}
              />
            ) : null}
            {video.thumbnail ? (
              <label className="flex items-center gap-2 text-xs text-muted">
                <input
                  type="checkbox"
                  checked={removeThumb}
                  onChange={(e) => {
                    setRemoveThumb(e.target.checked);
                    if (e.target.checked && fileRef.current) {
                      fileRef.current.value = "";
                      setThumbName(null);
                    }
                  }}
                />
                Remove current thumbnail
              </label>
            ) : null}
          </div>
        </div>
      </div>

      <div className="mt-2 flex items-center gap-2">
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-on-accent hover:bg-accent-hover disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
      </div>
    </form>
  );
}
