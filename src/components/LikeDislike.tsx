"use client";

import { useState } from "react";

// ── Shared button UI ────────────────────────────────────────────────────────

function ThumbIcon({ up, active }: { up: boolean; active: boolean }) {
  const fill = active ? "currentColor" : "none";
  const stroke = "currentColor";
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill={fill}
      stroke={stroke}
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
      style={up ? undefined : { transform: "scaleY(-1)" }}
      aria-hidden="true"
    >
      <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z" />
      <path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
    </svg>
  );
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

// ── Comment-level like/dislike (compact) ────────────────────────────────────

export function CommentLikeDislike({
  commentId,
  initialLikes,
  initialDislikes,
  initialVote,
  disabled = false,
}: {
  commentId: string;
  initialLikes: number;
  initialDislikes: number;
  initialVote: 0 | 1 | -1;
  disabled?: boolean;
}) {
  const [likes, setLikes] = useState(initialLikes);
  const [dislikes, setDislikes] = useState(initialDislikes);
  const [vote, setVote] = useState<0 | 1 | -1>(initialVote);
  const [pending, setPending] = useState(false);

  async function cast(value: 1 | -1) {
    if (disabled || pending) return;
    setPending(true);
    try {
      const res = await fetch(`/api/comments/${commentId}/like`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ value }),
      });
      if (res.ok) {
        const data = await res.json() as { likes: number; dislikes: number; userVote: 0 | 1 | -1 };
        setLikes(data.likes);
        setDislikes(data.dislikes);
        setVote(data.userVote);
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <span className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => cast(1)}
        disabled={disabled || pending}
        title={disabled ? "Sign in to like" : vote === 1 ? "Remove like" : "Like"}
        className={[
          "flex items-center gap-1 rounded px-1 py-0.5 transition-colors",
          vote === 1
            ? "text-accent"
            : "text-muted hover:text-text",
          disabled ? "cursor-default" : "cursor-pointer",
        ].join(" ")}
      >
        <ThumbIcon up active={vote === 1} />
        {likes > 0 ? <span className="text-xs tabular-nums">{formatCount(likes)}</span> : null}
      </button>
      <button
        type="button"
        onClick={() => cast(-1)}
        disabled={disabled || pending}
        title={disabled ? "Sign in to dislike" : vote === -1 ? "Remove dislike" : "Dislike"}
        className={[
          "flex items-center gap-1 rounded px-1 py-0.5 transition-colors",
          vote === -1
            ? "text-accent-red"
            : "text-muted hover:text-text",
          disabled ? "cursor-default" : "cursor-pointer",
        ].join(" ")}
      >
        <ThumbIcon up={false} active={vote === -1} />
        {dislikes > 0 ? <span className="text-xs tabular-nums">{formatCount(dislikes)}</span> : null}
      </button>
    </span>
  );
}

// ── Video-level like/dislike (prominent) ────────────────────────────────────

export function VideoLikeBar({
  videoId,
  initialLikes,
  initialDislikes,
  initialVote,
  disabled = false,
}: {
  videoId: string;
  initialLikes: number;
  initialDislikes: number;
  initialVote: 0 | 1 | -1;
  disabled?: boolean;
}) {
  const [likes, setLikes] = useState(initialLikes);
  const [dislikes, setDislikes] = useState(initialDislikes);
  const [vote, setVote] = useState<0 | 1 | -1>(initialVote);
  const [pending, setPending] = useState(false);

  async function cast(value: 1 | -1) {
    if (disabled || pending) return;
    setPending(true);
    try {
      const res = await fetch(`/api/videos/${videoId}/like`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ value }),
      });
      if (res.ok) {
        const data = await res.json() as { likes: number; dislikes: number; userVote: 0 | 1 | -1 };
        setLikes(data.likes);
        setDislikes(data.dislikes);
        setVote(data.userVote);
      }
    } finally {
      setPending(false);
    }
  }

  const total = likes + dislikes;
  const likeRatio = total > 0 ? likes / total : 0;

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => cast(1)}
        disabled={disabled || pending}
        title={disabled ? "Sign in to like" : vote === 1 ? "Remove like" : "Like"}
        className={[
          "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
          vote === 1
            ? "border-accent bg-accent/10 text-accent"
            : "border-border bg-surface text-text hover:bg-surface-2",
          disabled ? "cursor-default opacity-70" : "cursor-pointer",
        ].join(" ")}
      >
        <ThumbIcon up active={vote === 1} />
        <span className="tabular-nums">{formatCount(likes)}</span>
      </button>

      <button
        type="button"
        onClick={() => cast(-1)}
        disabled={disabled || pending}
        title={disabled ? "Sign in to dislike" : vote === -1 ? "Remove dislike" : "Dislike"}
        className={[
          "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
          vote === -1
            ? "border-accent-red bg-accent-red/10 text-accent-red"
            : "border-border bg-surface text-text hover:bg-surface-2",
          disabled ? "cursor-default opacity-70" : "cursor-pointer",
        ].join(" ")}
      >
        <ThumbIcon up={false} active={vote === -1} />
        <span className="tabular-nums">{formatCount(dislikes)}</span>
      </button>

      {total > 0 ? (
        <div
          className="ml-2 hidden h-1.5 w-20 overflow-hidden rounded-full bg-surface-2 sm:block"
          title={`${Math.round(likeRatio * 100)}% positive`}
        >
          <div
            className="h-full rounded-full bg-accent transition-all"
            style={{ width: `${likeRatio * 100}%` }}
          />
        </div>
      ) : null}
    </div>
  );
}
