"use client";

import { useMobileSidebar } from "@/components/MobileSidebarContext";
import { useTopNavCollapse } from "@/components/TopNavCollapseContext";

export function TopNavRevealButton() {
  const { open: navOpen, toggle: toggleNav, close: closeNav } = useTopNavCollapse();
  const { open: sidebarOpen, setOpen: setSidebarOpen, close: closeSidebar } = useMobileSidebar();

  const openBoth = () => {
    toggleNav();
    if (!sidebarOpen) setSidebarOpen(true);
  };

  const closeBoth = () => {
    closeNav();
    closeSidebar();
  };

  if (navOpen) {
    return (
      <div
        className="short-height-only fixed inset-0 z-[25]"
        onClick={closeBoth}
        aria-hidden="true"
      />
    );
  }

  return (
    <button
      type="button"
      className="short-height-only fixed top-0 left-0 right-0 z-50 h-4 w-full bg-surface-2 hover:bg-surface items-center justify-center"
      aria-label="Show navigation"
      aria-controls="app-top-nav main-sidebar"
      onClick={openBoth}
    >
      <svg width="12" height="8" viewBox="0 0 12 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="text-muted">
        <path d="M1 1.5l5 5 5-5" />
      </svg>
    </button>
  );
}
