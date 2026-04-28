"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface ChatMessage {
  id: string;
  body: string;
  createdAt: string;
  user: { id: string; name: string | null; image: string | null };
}

interface Props {
  slug: string;
  currentUserId: string | null;
  onClose?: () => void;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function ChatPanel({ slug, currentUserId, onClose }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  useEffect(() => {
    const es = new EventSource(`/api/stream/${slug}/chat`);

    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data as string) as { type: string } & ChatMessage;
        if (data.type === "message") {
          setMessages((prev) => [...prev, data]);
        }
      } catch {
        // Ignore malformed events.
      }
    };

    es.onerror = () => {
      // EventSource reconnects automatically after errors.
    };

    return () => es.close();
  }, [slug]);

  // flex-col-reverse means scrollTop=0 is visually the bottom (newest messages).
  // Snap back to the bottom whenever a new message arrives and autoScroll is on.
  useEffect(() => {
    if (autoScroll) {
      listRef.current?.scrollTo({ top: 0 });
    }
  }, [messages, autoScroll]);

  const handleScroll = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    // scrollTop near 0 = at the visual bottom with flex-col-reverse
    setAutoScroll(el.scrollTop < 64);
  }, []);

  const sendMessage = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/stream/${slug}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: trimmed }),
      });
      if (res.ok) {
        setInput("");
      } else {
        const data = (await res.json()) as { error?: string };
        setError(data.error ?? "Failed to send.");
      }
    } catch {
      setError("Failed to send.");
    } finally {
      setSending(false);
    }
  }, [input, sending, slug]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    },
    [sendMessage],
  );

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-lg border border-border bg-[color-mix(in_srgb,var(--color-bg)_80%,transparent)] backdrop-blur-sm">
      <div className="shrink-0 border-b border-border px-4 py-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Live Chat</h2>
        {onClose && (
          <button
            onClick={onClose}
            aria-label="Close chat"
            className="text-muted hover:text-text"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* flex-col-reverse: first DOM child = visual bottom, so newest message renders at the bottom
          and older messages are above it. scrollTop=0 is always the newest-message end. */}
      <div
        ref={listRef}
        onScroll={handleScroll}
        className="flex min-h-0 flex-1 flex-col-reverse gap-1 overflow-y-auto px-3 py-2"
      >
        {messages.length === 0 && (
          <p className="mb-4 text-center text-xs text-muted">
            No messages yet. Say hello!
          </p>
        )}
        {[...messages].reverse().map((msg, reverseIdx) => (
          <div
            key={msg.id}
            className={`text-sm leading-snug px-2 py-1 ${
              (messages.length - 1 - reverseIdx) % 2 === 0 ? "bg-surface-2/40" : ""
            }`}
          >
            <div className="flex items-baseline gap-1.5">
              <span className="shrink-0 text-[10px] text-muted">
                {formatTime(msg.createdAt)}
              </span>
              <span className="min-w-0 truncate font-semibold text-accent">
                {msg.user.name ?? "Anonymous"}
              </span>
            </div>
            <p className="break-words text-text">{msg.body}</p>
          </div>
        ))}
      </div>

      {!autoScroll && (
        <button
          onClick={() => {
            setAutoScroll(true);
            listRef.current?.scrollTo({ top: 0, behavior: "smooth" });
          }}
          className="mx-3 mb-1 rounded border border-border bg-surface-2 py-1 text-xs text-muted hover:text-text"
        >
          ↓ New messages
        </button>
      )}

      <div className="shrink-0 border-t border-border p-3">
        {currentUserId ? (
          <div className="flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              maxLength={300}
              placeholder="Send a message…"
              disabled={sending}
              className="min-w-0 flex-1 rounded border border-border bg-surface-2 px-3 py-2 text-base focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-50"
            />
            <button
              onClick={sendMessage}
              disabled={sending || !input.trim()}
              className="rounded bg-accent px-3 py-2 text-sm font-semibold text-on-accent hover:bg-accent-hover disabled:opacity-40"
            >
              Send
            </button>
          </div>
        ) : (
          <p className="text-center text-sm text-muted">
            <a href="/signin" className="text-accent hover:underline">
              Sign in
            </a>{" "}
            to chat
          </p>
        )}
        {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
      </div>
    </div>
  );
}
