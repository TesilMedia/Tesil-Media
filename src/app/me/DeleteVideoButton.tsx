"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function DeleteVideoButton({
  id,
}: {
  id: string;
  title: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [armed, setArmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  async function onDelete() {
    if (!armed) {
      setArmed(true);
      timerRef.current = setTimeout(() => setArmed(false), 3000);
      return;
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    setArmed(false);
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
        className={`rounded-full px-3 py-1.5 text-xs font-medium text-white transition-colors active:brightness-95 disabled:cursor-not-allowed disabled:opacity-60 ${
          armed
            ? "bg-red-700 hover:bg-red-800 disabled:hover:bg-red-700"
            : "bg-accent-red hover:bg-accent-red-hover disabled:hover:bg-accent-red"
        }`}
      >
        {pending ? "Deleting…" : armed ? "Confirm delete" : "Delete"}
      </button>
      {error ? (
        <span className="max-w-[220px] rounded-md border border-danger-border bg-danger-bg px-2 py-1 text-center text-[10px] leading-snug text-danger">
          {error}
        </span>
      ) : null}
    </span>
  );
}
