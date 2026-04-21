import Link from "next/link";

import { MobileNavToggle } from "@/components/MobileNavToggle";
import { ThemeToggle } from "@/components/ThemeToggle";
import { TopNavSearchInput } from "@/components/TopNavSearchInput";

type Props = {
  user: {
    id?: string;
    name?: string | null;
    email?: string | null;
    image?: string | null;
  } | null;
  channel: {
    name: string;
    avatarUrl: string | null;
  } | null;
};

export function TopNav({ user, channel }: Props) {
  return (
    <header className="retro-tricolor-divider-b sticky top-0 z-30 flex h-14 shrink-0 items-center gap-[8px] bg-bg/85 px-[8px] pb-[6px] backdrop-blur supports-[backdrop-filter]:bg-bg/70">
      <div className="flex shrink-0 items-center gap-[8px]">
        <MobileNavToggle />
        <Link
          href="/"
          className="inline-flex h-10 shrink-0 items-center justify-center font-display tracking-wide md:h-9"
        >
          <span className="retro-gradient-text text-[36px] leading-none">
            TESIL
          </span>
        </Link>
      </div>

      <form
        action="/search"
        method="GET"
        className="mx-auto flex min-w-0 flex-1 max-w-xl items-center justify-center"
      >
        <TopNavSearchInput />
        <button
          type="submit"
          className="hidden h-10 shrink-0 items-center justify-center rounded-r-full border-2 border-l-0 border-border bg-surface-2 px-3 py-1.5 text-base font-medium leading-snug text-muted transition-colors hover:bg-surface hover:text-text sm:px-4 md:h-9 md:text-sm lg:flex"
        >
          Search
        </button>
      </form>

      <div className="flex min-w-0 items-center justify-end gap-[8px]">
        <ThemeToggle />
        {user && channel ? (
          <div className="flex min-w-0 max-w-[min(100%,14rem)] items-center gap-[8px] sm:max-w-[min(100%,18rem)]">
            <Link
              href="/me"
              className="inline-flex h-10 w-10 shrink-0 overflow-hidden rounded-full border border-border bg-surface-2 ring-1 ring-border/40 hover:ring-accent/50 md:h-9 md:w-9"
              title={`${channel.name} — your channel`}
            >
              {channel.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={channel.avatarUrl}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : null}
            </Link>
            <Link
              href="/me"
              className="hidden min-w-0 truncate text-sm font-medium text-text hover:text-accent-blue sm:block"
              title={channel.name}
            >
              {channel.name}
            </Link>
          </div>
        ) : user ? (
          <Link
            href="/me"
            className="inline-flex h-10 max-w-full min-w-0 items-center truncate px-1 text-sm text-muted hover:text-accent-blue md:h-9"
          >
            {user.name ?? user.email}
          </Link>
        ) : (
          <>
            <Link
              href="/signin"
              className="inline-flex h-10 items-center justify-center rounded-full bg-accent-blue px-3 text-sm font-semibold text-white shadow-retro-sm hover:bg-accent-blue-hover md:h-9"
            >
              Sign In
            </Link>
            <Link
              href="/signup"
              className="inline-flex h-10 items-center justify-center rounded-full bg-accent px-3 text-sm font-semibold text-white shadow-retro-sm hover:bg-accent-hover md:h-9"
            >
              Sign Up
            </Link>
          </>
        )}
      </div>
    </header>
  );
}
