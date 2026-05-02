"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Channel = {
  slug: string;
  name: string;
  description: string | null;
  avatarUrl: string | null;
  bannerUrl: string | null;
  followers: number;
};

type Props = {
  channel: Channel;
  stats: { videos: number; totalViews: number };
};

export function ChannelEditCard({ channel, stats }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState(channel.name);
  const [description, setDescription] = useState(channel.description ?? "");
  const [avatarUrl, setAvatarUrl] = useState(channel.avatarUrl ?? "");
  const [bannerUrl, setBannerUrl] = useState(channel.bannerUrl ?? "");
  const [uploading, setUploading] = useState<"avatar" | "banner" | null>(
    null,
  );

  const avatarFileRef = useRef<HTMLInputElement>(null);
  const bannerFileRef = useRef<HTMLInputElement>(null);

  async function uploadChannelImage(kind: "avatar" | "banner", file: File) {
    setError(null);
    setUploading(kind);
    try {
      const fd = new FormData();
      fd.append(kind, file);
      const res = await fetch("/api/channel/upload", {
        method: "POST",
        body: fd,
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        url?: string;
      };
      if (!res.ok) {
        setError(data.error ?? `Upload failed (HTTP ${res.status}).`);
        return;
      }
      if (data.url) {
        if (kind === "avatar") setAvatarUrl(data.url);
        else setBannerUrl(data.url);
      }
    } catch (err) {
      console.error(err);
      setError("Network error during upload.");
    } finally {
      setUploading(null);
    }
  }

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/channel", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          avatarUrl: avatarUrl.trim() || null,
          bannerUrl: bannerUrl.trim() || null,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? `Save failed (HTTP ${res.status}).`);
        setSaving(false);
        return;
      }
      setEditing(false);
      setSaving(false);
      router.refresh();
    } catch (err) {
      console.error(err);
      setError("Network error.");
      setSaving(false);
    }
  }

  function cancel() {
    setName(channel.name);
    setDescription(channel.description ?? "");
    setAvatarUrl(channel.avatarUrl ?? "");
    setBannerUrl(channel.bannerUrl ?? "");
    setError(null);
    setEditing(false);
  }

  return (
    <div className="rounded-lg border border-border bg-surface">
      {/* overflow-hidden only on the banner so the card root does not clip the
          avatar when it overlaps upward with negative margin */}
      <div className="relative z-0 aspect-[6/1] w-full overflow-hidden rounded-t-lg bg-surface-2">
        {bannerUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={bannerUrl}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : null}
      </div>

      <div className="rounded-b-lg px-4 pb-4">
        <div className="relative z-10 mb-3 flex items-end gap-3">
          <div className="relative z-10 -mt-8 h-16 w-16 shrink-0 overflow-hidden rounded-full bg-surface-2 shadow-lg">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarUrl}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : null}
          </div>
          <div className="mb-1 min-w-0 flex-1">
            <div className="truncate text-base font-semibold">{name}</div>
            <div className="text-xs text-muted">@{channel.slug}</div>
          </div>
        </div>

        <dl className="mb-3 grid grid-cols-3 gap-2 text-center">
          <Stat label="Followers" value={channel.followers.toLocaleString()} />
          <Stat label="Videos" value={stats.videos.toLocaleString()} />
          <Stat
            label="Total views"
            value={stats.totalViews.toLocaleString()}
          />
        </dl>

        {!editing ? (
          <>
            {channel.description ? (
              <p className="mb-3 whitespace-pre-line text-sm text-muted">
                {channel.description}
              </p>
            ) : (
              <p className="mb-3 text-sm text-muted italic">
                No channel description yet.
              </p>
            )}
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="w-full rounded-md bg-accent px-3 py-2 text-sm font-semibold text-on-accent transition-colors hover:bg-accent-hover active:brightness-95"
            >
              Edit channel
            </button>
          </>
        ) : (
          <form onSubmit={save} className="flex flex-col gap-3">
            {error ? (
              <div className="rounded-md border border-danger-border bg-danger-bg px-3 py-2 text-xs text-danger">
                {error}
              </div>
            ) : null}
            <Field label="Display name">
              <input
                type="text"
                maxLength={60}
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-md border border-border bg-bg px-3 py-1.5 text-sm outline-none focus:border-accent/60"
              />
            </Field>
            <Field label="Description">
              <textarea
                rows={3}
                maxLength={2_000}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full resize-y rounded-md border border-border bg-bg px-3 py-1.5 text-sm outline-none focus:border-accent/60"
              />
            </Field>
            <Field
              label="Avatar"
              hint="JPEG, PNG, WebP, or GIF · up to 5MB. Or paste an image URL."
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  type="text"
                  maxLength={500}
                  value={avatarUrl}
                  onChange={(e) => setAvatarUrl(e.target.value)}
                  placeholder="https://… or upload below"
                  className="min-w-0 flex-1 rounded-md border border-border bg-bg px-3 py-1.5 text-sm outline-none focus:border-accent/60"
                />
                <input
                  ref={avatarFileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (f) void uploadChannelImage("avatar", f);
                  }}
                />
                <button
                  type="button"
                  disabled={saving || uploading !== null}
                  onClick={() => avatarFileRef.current?.click()}
                  className="shrink-0 rounded-md border border-border bg-surface-2 px-3 py-1.5 text-sm hover:bg-surface disabled:opacity-60"
                >
                  {uploading === "avatar" ? "Uploading…" : "Upload file"}
                </button>
              </div>
            </Field>
            <Field
              label="Banner"
              hint="Recommended 1920×320 px."
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  type="text"
                  maxLength={500}
                  value={bannerUrl}
                  onChange={(e) => setBannerUrl(e.target.value)}
                  placeholder="https://… or upload below"
                  className="min-w-0 flex-1 rounded-md border border-border bg-bg px-3 py-1.5 text-sm outline-none focus:border-accent/60"
                />
                <input
                  ref={bannerFileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (f) void uploadChannelImage("banner", f);
                  }}
                />
                <button
                  type="button"
                  disabled={saving || uploading !== null}
                  onClick={() => bannerFileRef.current?.click()}
                  className="shrink-0 rounded-md border border-border bg-surface-2 px-3 py-1.5 text-sm hover:bg-surface disabled:opacity-60"
                >
                  {uploading === "banner" ? "Uploading…" : "Upload file"}
                </button>
              </div>
            </Field>
            <div className="mt-1 flex items-center gap-2">
              <button
                type="submit"
                disabled={saving}
                className="flex-1 rounded-md bg-accent px-3 py-2 text-sm font-semibold text-on-accent hover:bg-accent-hover disabled:opacity-60"
              >
                {saving ? "Saving…" : "Save"}
              </button>
              <button
                type="button"
                onClick={cancel}
                disabled={saving}
                className="rounded-md border border-border bg-surface-2 px-3 py-2 text-sm hover:bg-surface disabled:opacity-60"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-surface-2 px-2 py-1.5">
      <div className="text-sm font-semibold text-text">{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-muted">
        {label}
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs">
      <span className="text-muted">{label}</span>
      {hint ? (
        <span className="text-[11px] leading-snug text-muted/80">{hint}</span>
      ) : null}
      {children}
    </label>
  );
}
