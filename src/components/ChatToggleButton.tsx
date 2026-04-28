"use client";

import { useChatDrawer } from "./ChatDrawerContext";

export function ChatToggleButton() {
  const { setOpen } = useChatDrawer();

  return (
    <button
      onClick={() => setOpen(true)}
      className="rounded-full border border-border bg-surface px-4 py-1.5 text-sm font-medium text-text transition-colors hover:bg-surface-2"
    >
      Open chat
    </button>
  );
}
