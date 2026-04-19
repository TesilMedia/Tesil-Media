import Link from "next/link";

import { MobileNavToggle } from "@/components/MobileNavToggle";

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
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b-2 border-accent/40 bg-bg/85 px-[8px] backdrop-blur supports-[backdrop-filter]:bg-bg/70 md:gap-4">
      <div className="flex shrink-0 items-center gap-2">
        <MobileNavToggle />
        <Link
          href="/"
          className="flex shrink-0 items-center font-display tracking-wide"
        >
          <span className="retro-gradient-text text-[20px] leading-none">
            TESIL
          </span>
        </Link>
      </div>

      <form
        action="/search"
        method="GET"
        className="mx-auto flex min-w-0 flex-1 max-w-xl items-center justify-center"
      >
        <input
          type="search"
          name="q"
          placeholder="Search channels and videos…"
          className="h-10 min-w-0 w-full rounded-full border-2 border-border bg-surface px-3 py-1.5 text-base leading-snug text-text outline-none placeholder:text-muted focus:border-accent sm:px-4 md:h-9 md:text-sm lg:rounded-l-full lg:rounded-r-none"
        />
        <button
          type="submit"
          className="hidden h-10 shrink-0 items-center justify-center rounded-r-full border-2 border-l-0 border-border bg-surface-2 px-3 py-1.5 text-base font-medium leading-snug text-muted hover:bg-accent hover:text-bg sm:px-4 md:h-9 md:text-sm lg:flex"
        >
          Search
        </button>
      </form>

      <div className="flex min-w-0 items-center justify-end gap-2">
        {user && channel ? (
          <div className="flex min-w-0 max-w-[min(100%,14rem)] items-center gap-2 sm:max-w-[min(100%,18rem)]">
            <Link
              href="/me"
              className="inline-flex h-9 w-9 shrink-0 overflow-hidden rounded-full border border-border bg-surface-2 ring-1 ring-border/40 hover:ring-accent/50"
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
              className="hidden min-w-0 truncate text-sm font-medium text-text hover:text-accent sm:block"
              title={channel.name}
            >
              {channel.name}
            </Link>
          </div>
        ) : user ? (
          <Link
            href="/me"
            className="text-sm text-muted hover:text-accent-blue"
          >
            {user.name ?? user.email}
          </Link>
        ) : (
          <>
            <Link
              href="/signin"
              className="rounded-full border-2 border-accent-blue/70 bg-surface px-3 py-1.5 text-sm font-medium text-accent-blue hover:bg-accent-blue hover:text-bg"
            >
              Sign in
            </Link>
            <Link
              href="/signup"
              className="rounded-full bg-accent px-3 py-1.5 text-sm font-semibold uppercase tracking-wide text-bg shadow-retro-sm hover:bg-accent-hover"
            >
              Sign up
            </Link>
          </>
        )}
      </div>
    </header>
  );
}
