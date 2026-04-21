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

      <TopNavSearchInput />

      <div className="flex min-w-0 items-center justify-end gap-[8px]">
        <ThemeToggle />
        {user && channel ? (
          <div className="flex min-w-0 max-w-[min(100%,14rem)] items-center gap-[8px] sm:max-w-[min(100%,18rem)]">
            <Link
              href="/me"
              className="inline-flex h-10 w-10 shrink-0 overflow-hidden rounded-full bg-surface-2 outline-none focus-visible:ring-2 focus-visible:ring-border md:h-9 md:w-9"
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
          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            <Link
              href="/signin"
              title="Sign in"
              className="inline-flex h-10 shrink-0 items-center justify-center whitespace-nowrap rounded-full bg-accent-blue px-2.5 text-xs font-semibold text-white shadow-retro-sm hover:bg-accent-blue-hover sm:px-3 sm:text-sm md:h-9"
            >
              Sign in
            </Link>
            <Link
              href="/signup"
              title="Sign up"
              className="inline-flex h-10 shrink-0 items-center justify-center whitespace-nowrap rounded-full bg-accent px-2.5 text-xs font-semibold text-white shadow-retro-sm hover:bg-accent-hover sm:px-3 sm:text-sm md:h-9"
            >
              Sign up
            </Link>
          </div>
        )}
      </div>
    </header>
  );
}
