"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import {
  CATEGORY_BADGE_CLASS,
  CATEGORY_META,
  VIDEO_CATEGORIES,
  categoryHref,
} from "@/lib/categories";
import { CategoryIcon } from "@/components/CategoryIcon";
import { useMobileSidebar } from "@/components/MobileSidebarContext";

function useIsLg() {
  const [lg, setLg] = useState<boolean | null>(null);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const fn = () => setLg(mq.matches);
    fn();
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }, []);
  return lg;
}

export type SidebarLiveChannel = {
  id: string;
  slug: string;
  name: string;
  avatarUrl: string | null;
  stream: { viewers: number | null } | null;
};

type Props = {
  liveChannels: SidebarLiveChannel[];
};

const sidebarSectionLinkClass =
  "block w-full rounded-md px-2 py-1.5 text-left font-display text-[12px] uppercase tracking-[0.18em] text-text hover:bg-surface hover:text-accent-blue";

export function SidebarLayout({ liveChannels }: Props) {
  const pathname = usePathname();
  const { open, close } = useMobileSidebar();
  const isLg = useIsLg();
  const drawerHidden =
    isLg !== null && !isLg && !open;

  useEffect(() => {
    close();
  }, [pathname, close]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  useEffect(() => {
    if (open && isLg === false) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [open, isLg]);

  return (
    <>
      {open ? (
        <button
          type="button"
          className="mobile-sidebar-backdrop fixed inset-0 top-14 z-[35] bg-transparent lg:hidden"
          aria-label="Close navigation menu"
          onClick={close}
        />
      ) : null}

      <aside
        id="main-sidebar"
        className={`mobile-sidebar-shell retro-tricolor-divider-r flex min-h-0 w-60 shrink-0 flex-col overflow-hidden bg-[color-mix(in_srgb,var(--color-bg)_80%,transparent)] backdrop-blur-sm pl-2 pr-[14px] py-4 transition-transform duration-200 ease-out fixed left-0 top-14 z-40 h-[calc(100dvh-3.5rem)] lg:static lg:top-auto lg:z-auto lg:h-full ${
          open ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
        aria-hidden={drawerHidden}
        inert={drawerHidden ? true : undefined}
      >
        <nav className="no-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto px-2">
          <Link href="/" className={sidebarSectionLinkClass} onClick={close}>
            Home
          </Link>

          <div className="mt-4">
            <Link
              href="/categories"
              className={`${sidebarSectionLinkClass} mb-2`}
              onClick={close}
            >
              Categories
            </Link>
            <ul className="flex flex-col gap-0.5">
              {VIDEO_CATEGORIES.map((slug) => {
                const meta = CATEGORY_META[slug];
                return (
                  <li key={slug}>
                    <Link
                      href={categoryHref(slug)}
                      className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-surface hover:text-accent-blue"
                      onClick={close}
                    >
                      <span
                        className={`inline-flex h-5 w-5 items-center justify-center rounded ${CATEGORY_BADGE_CLASS}`}
                      >
                        <CategoryIcon category={slug} className="h-3 w-3" />
                      </span>
                      <span className="flex-1 truncate">{meta.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="mt-4">
            <Link
              href="/live-channels"
              className={`${sidebarSectionLinkClass} mb-2`}
              onClick={close}
            >
              Live Channels
            </Link>
            <ul className="flex flex-col gap-1">
              {liveChannels.length === 0 ? (
                <li className="px-2 py-1 text-xs text-muted">Nobody is live.</li>
              ) : (
                liveChannels.map((c) => (
                  <li key={c.id}>
                    <Link
                      href={`/c/${c.slug}`}
                      className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-surface hover:text-accent-blue"
                      onClick={close}
                    >
                      <span className="relative inline-block h-7 w-7 shrink-0 overflow-hidden rounded-full bg-surface-2">
                        {c.avatarUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={c.avatarUrl}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : null}
                      </span>
                      <span className="flex-1 truncate">{c.name}</span>
                      <span className="flex items-center gap-1 text-[11px] text-muted">
                        <span className="live-pulse inline-block h-1.5 w-1.5 rounded-full bg-live" />
                        {c.stream?.viewers?.toLocaleString() ?? 0}
                      </span>
                    </Link>
                  </li>
                ))
              )}
            </ul>
          </div>
        </nav>
      </aside>
    </>
  );
}
