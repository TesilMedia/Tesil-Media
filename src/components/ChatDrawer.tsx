"use client";

import { ChatPanel } from "./ChatPanel";
import { useChatDrawer } from "./ChatDrawerContext";

interface Props {
  slug: string;
  currentUserId: string | null;
}

export function ChatDrawer({ slug, currentUserId }: Props) {
  const { open, setOpen } = useChatDrawer();

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Slide-in drawer */}
      <div
        className={`fixed inset-y-0 right-0 z-50 w-[min(360px,50vw)] transition-transform duration-300 ease-in-out lg:hidden ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <ChatPanel slug={slug} currentUserId={currentUserId} onClose={() => setOpen(false)} />
      </div>
    </>
  );
}
