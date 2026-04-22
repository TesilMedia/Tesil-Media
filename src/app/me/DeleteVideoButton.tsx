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
        className="rounded-full bg-accent-red px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-accent-red-hover active:brightness-95 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-accent-red"
      >
        {pending ? "Deleting…" : "Delete"}
      </button>
      {error ? (
        <span className="max-w-[220px] rounded-md border border-danger-border bg-danger-bg px-2 py-1 text-center text-[10px] leading-snug text-danger">
          {error}
        </span>
      ) : null}
    </span>
  );
}
