"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function DeleteVideoButton({
  id,
  title,
}: {
  id: string;
  title: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function onDelete() {
    if (
      !confirm(
        `Delete “${title}”? This removes the video file from disk too. This can't be undone.`,
      )
    ) {
      return;
    }
    setError(null);
    try {
      const res = await fetch(`/api/videos/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? `Delete failed (HTTP ${res.status}).`);
        return;
      }
      startTransition(() => router.refresh());
    } catch (err) {
      console.error(err);
      setError("Network error.");
    }
  }

  return (
    <span className="flex flex-col items-end gap-0.5">
      <button
        type="button"
        onClick={onDelete}
        disabled={pending}
        className="rounded-full border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-xs text-red-200 hover:bg-red-500/20 disabled:opacity-60"
      >
        {pending ? "Deleting…" : "Delete"}
      </button>
      {error ? (
        <span className="text-[10px] text-red-300">{error}</span>
      ) : null}
    </span>
  );
}
