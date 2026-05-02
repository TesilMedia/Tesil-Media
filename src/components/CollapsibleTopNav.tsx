"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname } from "next/navigation";

import { useTopNavCollapse } from "@/components/TopNavCollapseContext";

type CollapsibleTopNavProps = {
  children: ReactNode;
};

export function CollapsibleTopNav({ children }: CollapsibleTopNavProps) {
  const pathname = usePathname();
  const { close, open } = useTopNavCollapse();

  useEffect(() => {
    close();
  }, [pathname, close]);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [close, open]);

  return (
    <header
      id="app-top-nav"
      className={`retro-tricolor-divider-b sticky top-0 z-30 flex h-14 shrink-0 items-center gap-[8px] bg-bg/85 px-[8px] pb-[6px] backdrop-blur supports-[backdrop-filter]:bg-bg/70 ${
        open ? "top-nav-open" : ""
      }`}
    >
      {children}
    </header>
  );
}
