"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { ThumbnailFramePicker } from "@/components/ThumbnailFramePicker";
import { CategoryPicker } from "@/components/CategoryPicker";
import {
  CONTENT_RATINGS,
  ContentRating,
  DEFAULT_VIDEO_RATING,
  RATING_META,
} from "@/lib/ratings";
import { VideoCategory } from "@/lib/categories";

type Status =
  | "idle"
  | "uploading"
  | "processing"
  | "encoding"
  | "error";

const ENCODE_POLL_MS = 900;
const ENCODE_MAX_WAIT_MS = 15 * 60 * 1000;

export function UploadForm() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const thumbInputRef = useRef<HTMLInputElement>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [durationSec, setDurationSec] = useState<number | null>(null);
  const [videoName, setVideoName] = useState<string | null>(null);
  const [videoSize, setVideoSize] = useState<number>(0);
  const [thumbName, setThumbName] = useState<string | null>(null);
  const [rating, setRating] = useState<ContentRating>(DEFAULT_VIDEO_RATING);
  const [categories, setCategories] = useState<VideoCategory[]>([]);
  const [progress, setProgress] = useState<number>(0);
  const [encodeProgress, setEncodeProgress] = useState<number>(0);
  const [encodeDone, setEncodeDone] = useState<number>(0);
  const [encodeTotal, setEncodeTotal] = useState<number>(0);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const encodeStartedAtRef = useRef<number>(0);

  useEffect(() => {
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, []);

  function stopPolling() {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  function assignThumbnailInput(file: File | null) {
    const input = thumbInputRef.current;
    if (!input) return;
    const dt = new DataTransfer();
    if (file) dt.items.add(file);
    input.files = dt.files;
  }

  function reset() {
    stopPolling();
    setStatus("idle");
    setProgress(0);
    setEncodeProgress(0);
    setEncodeDone(0);
    setEncodeTotal(0);
    setError(null);
    setVideoFile(null);
    setDurationSec(null);
    setVideoName(null);
    setVideoSize(0);
    setThumbName(null);
    setRating(DEFAULT_VIDEO_RATING);
    setCategories([]);
    assignThumbnailInput(null);
    formRef.current?.reset();
  }

  function cancel() {
    xhrRef.current?.abort();
    stopPolling();
    setStatus("idle");
    setProgress(0);
    setEncodeProgress(0);
    setEncodeDone(0);
    setEncodeTotal(0);
    setError(null);
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = e.currentTarget;
    const fd = new FormData(form);

    const title = String(fd.get("title") ?? "").trim();
    const video = fd.get("video");
    if (!title) {
      setError("Title is required.");
      return;
    }
    if (!(video instanceof File) || video.size === 0) {
      setError("Please choose a video file.");
      return;
    }
    if (categories.length === 0) {
      setError("Please choose at least one category.");
      return;
    }

    setStatus("uploading");
    setProgress(0);

    const xhr = new XMLHttpRequest();
    xhrRef.current = xhr;

    xhr.upload.addEventListener("progress", (ev) => {
      if (!ev.lengthComputable) return;
      setProgress(Math.round((ev.loaded / ev.total) * 100));
    });
    xhr.upload.addEventListener("load", () => {
      setProgress(100);
      setStatus("processing");
    });
    xhr.addEventListener("load", () => {
      let body: {
        ok?: boolean;
        id?: string;
        error?: string;
        transcodePending?: boolean;
      } = {};
      try {
        body = JSON.parse(xhr.responseText || "{}");
      } catch {
        // ignore
      }
      if (xhr.status >= 200 && xhr.status < 300 && body.id) {
        if (body.transcodePending) {
          setStatus("encoding");
          setEncodeProgress(0);
          encodeStartedAtRef.current = Date.now();

          const videoId = body.id;

          const pollOnce = async (): Promise<boolean> => {
            try {
              const res = await fetch(
                `/api/videos/${encodeURIComponent(videoId)}/transcode-status`,
              );
              if (!res.ok) return false;
              const j: {
                pending?: boolean;
                totalExtraQualities?: number;
                completedExtraQualities?: number;
              } = await res.json();
              const total = j.totalExtraQualities ?? 0;
              const done = j.completedExtraQualities ?? 0;
              setEncodeTotal(total);
              setEncodeDone(done);
              if (total > 0) {
                setEncodeProgress(
                  Math.min(100, Math.round((done / total) * 100)),
                );
              } else {
                setEncodeProgress(100);
              }

              const timedOut =
                Date.now() - encodeStartedAtRef.current > ENCODE_MAX_WAIT_MS;
              if (j.pending === false || timedOut) {
                stopPolling();
                router.push(`/watch/${videoId}`);
                router.refresh();
                return true;
              }
              return false;
            } catch {
              return false;
            }
          };

          void (async () => {
            if (await pollOnce()) return;
            pollRef.current = setInterval(
              () => void pollOnce(),
              ENCODE_POLL_MS,
            );
          })();
        } else {
          router.push(`/watch/${body.id}`);
          router.refresh();
        }
      } else {
        setStatus("error");
        setError(body.error ?? `Upload failed (HTTP ${xhr.status}).`);
      }
    });
    xhr.addEventListener("error", () => {
      setStatus("error");
      setError("Network error during upload.");
    });
    xhr.addEventListener("abort", () => {
      setStatus("idle");
      setError(null);
    });

    if (durationSec != null && durationSec > 0) {
      fd.append("durationSec", String(durationSec));
    }

    xhr.open("POST", "/api/upload");
    xhr.send(fd);
  }

  const uploading =
    status === "uploading" ||
    status === "processing" ||
    status === "encoding";

  return (
    <form ref={formRef} onSubmit={onSubmit} className="flex flex-col gap-4">
      {error ? (
        <div className="rounded-md border border-danger-border bg-danger-bg px-3 py-2 text-sm text-danger">
          {error}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Media: video + thumbnails */}
        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-col gap-1 text-sm">
            <span className="text-muted">Video file *</span>
            <label
              className={`flex min-w-0 cursor-pointer items-center justify-between gap-3 rounded-md border border-dashed px-3 py-4 text-sm transition ${
                uploading
                  ? "border-border bg-surface opacity-60"
                  : "border-border bg-surface hover:border-accent/60 hover:bg-surface-2"
              }`}
            >
              <span className="min-w-0 flex-1">
                {videoName ? (
                  <>
                    <span className="block truncate font-medium text-text">
                      {videoName}
                    </span>
                    <span className="text-xs text-muted">
                      {formatBytes(videoSize)}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="block font-medium text-text">
                      Click to choose a video
                    </span>
                    <span className="text-xs text-muted">
                      mp4, webm, mkv, mov, m4v, ogv, ogg
                    </span>
                  </>
                )}
              </span>
              <span className="shrink-0 rounded-full bg-surface-2 px-3 py-1 text-xs text-muted">
                Browse
              </span>
              <input
                name="video"
                type="file"
                accept="video/mp4,video/webm,video/x-matroska,video/quicktime,video/ogg,.mkv,.mov,.m4v,.ogv"
                required
                disabled={uploading}
                className="hidden"
                onChange={(e) => {
                  const f = e.currentTarget.files?.[0] ?? null;
                  setVideoFile(f);
                  setDurationSec(null);
                  setVideoName(f?.name ?? null);
                  setVideoSize(f?.size ?? 0);
                  assignThumbnailInput(null);
                  setThumbName(null);
                }}
              />
            </label>
          </div>

          {videoFile ? (
            <ThumbnailFramePicker
              videoFile={videoFile}
              disabled={uploading}
              onDurationSec={setDurationSec}
              onFrameChosen={(file) => {
                assignThumbnailInput(file);
                setThumbName(file.name);
              }}
            />
          ) : null}

          <div className="flex flex-col gap-1 text-sm">
            <span className="text-muted">Thumbnail (optional)</span>
            <label
              className={`flex min-w-0 cursor-pointer items-center justify-between gap-3 rounded-md border border-dashed px-3 py-4 text-sm transition ${
                uploading
                  ? "border-border bg-surface opacity-60"
                  : "border-border bg-surface hover:border-accent/60 hover:bg-surface-2"
              }`}
            >
              <span className="min-w-0 flex-1">
                {thumbName ? (
                  <span className="block truncate font-medium text-text">
                    {thumbName}
                  </span>
                ) : (
                  <>
                    <span className="block font-medium text-text">
                      Click to choose an image
                    </span>
                    <span className="text-xs text-muted">
                      jpg, png, webp, gif
                    </span>
                  </>
                )}
              </span>
              <span className="shrink-0 rounded-full bg-surface-2 px-3 py-1 text-xs text-muted">
                Browse
              </span>
              <input
                ref={thumbInputRef}
                name="thumbnail"
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                disabled={uploading}
                className="hidden"
                onChange={(e) => {
                  const f = e.currentTarget.files?.[0] ?? null;
                  setThumbName(f?.name ?? null);
                }}
              />
            </label>
          </div>
        </div>

        {/* Settings */}
        <div className="flex h-full min-w-0 flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted">Title *</span>
            <input
              name="title"
              type="text"
              required
              maxLength={200}
              disabled={uploading}
              placeholder="My awesome video"
              className="rounded-md border border-border bg-surface px-3 py-2 outline-none focus:border-accent/60 disabled:opacity-60"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted">Description</span>
            <textarea
              name="description"
              rows={4}
              maxLength={5000}
              disabled={uploading}
              placeholder="What's this video about?"
              className="resize-y rounded-md border border-border bg-surface px-3 py-2 outline-none focus:border-accent/60 disabled:opacity-60"
            />
          </label>

          <CategoryPicker
            value={categories}
            onChange={setCategories}
            disabled={uploading}
            required
          />

          <fieldset className="flex flex-col gap-2 text-sm" disabled={uploading}>
            <legend className="text-muted">Content rating *</legend>
            <input type="hidden" name="rating" value={rating} />
            <div className="grid grid-cols-2 gap-2">
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
            <p className="text-xs text-muted">
              Viewers can hide videos by rating in their profile. X is hidden by
              default.
            </p>
          </fieldset>

          <div className="mt-auto flex flex-wrap items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={uploading}
              className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-on-accent hover:bg-accent-hover disabled:opacity-60"
            >
              {uploading
                ? status === "encoding"
                  ? "Publishing…"
                  : "Uploading…"
                : "Upload"}
            </button>
            {!uploading && (videoName || thumbName) ? (
              <button
                type="button"
                onClick={reset}
                className="rounded-md border border-border bg-surface px-4 py-2 text-sm hover:bg-surface-2"
              >
                Reset
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {uploading ? (
        <div className="flex flex-col gap-2">
          {status === "encoding" ? (
            <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full bg-accent transition-[width] duration-150"
                style={{ width: `${encodeProgress}%` }}
              />
            </div>
          ) : (
            <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full bg-accent transition-[width] duration-150"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}
          <div className="flex items-center justify-between text-xs text-muted">
            <span>
              {status === "encoding"
                ? encodeTotal > 0
                  ? `Encoding more qualities… ${encodeDone}/${encodeTotal} (${encodeProgress}%)`
                  : "Finishing…"
                : status === "processing"
                  ? "Saving and checking video…"
                  : `Uploading… ${progress}%`}
            </span>
            <button
              type="button"
              onClick={cancel}
              className="rounded-full border border-border bg-surface px-3 py-1 text-xs hover:bg-surface-2"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </form>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
