"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

type Props = {
  slug: string;
};

/**
 * Polls live status so viewers on the waiting-room screen transition to the
 * live player as soon as the streamer's OBS connects (no manual refresh).
 */
export function WaitingRoomLiveRedirect({ slug }: Props) {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    async function check() {
      try {
        const res = await fetch(`/api/stream/${slug}/live-status`, {
          cache: "no-store",
        });
        const data = (await res.json().catch(() => ({}))) as {
          isLive?: boolean;
        };
        if (cancelled || !res.ok) return;
        if (data.isLive) {
          router.refresh();
        }
      } catch {
        // Ignore transient polling failures.
      }
    }

    void check();
    const id = setInterval(() => {
      void check();
    }, 2500);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [slug, router]);

  return null;
}
