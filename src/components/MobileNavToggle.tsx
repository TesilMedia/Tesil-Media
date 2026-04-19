"use client";

import { useMobileSidebar } from "@/components/MobileSidebarContext";

export function MobileNavToggle() {
  const { open, toggle } = useMobileSidebar();

  return (
    <button
      type="button"
      className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border-2 border-border bg-surface text-text hover:bg-surface-2 hover:text-accent lg:hidden"
      aria-label={open ? "Close navigation menu" : "Open navigation menu"}
      aria-expanded={open}
      aria-controls="main-sidebar"
      onClick={toggle}
    >
      <span className="sr-only">Menu</span>
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        aria-hidden
      >
        {open ? (
          <>
            <path d="M18 6L6 18M6 6l12 12" />
          </>
        ) : (
          <>
            <path d="M4 7h16M4 12h16M4 17h16" />
          </>
        )}
      </svg>
    </button>
  );
}
