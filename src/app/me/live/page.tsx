import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  STALE_SESSION_SIGN_OUT_URL,
  ensureChannelForUser,
} from "@/lib/slug";

import { PreStreamSetupForm } from "./PreStreamSetupForm";

export const dynamic = "force-dynamic";

export default async function LiveSetupPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/signin?callbackUrl=/me/live");
  }

  const channel = await ensureChannelForUser(session.user.id);
  if (!channel) redirect(STALE_SESSION_SIGN_OUT_URL);

  const stream = await prisma.liveStream.upsert({
    where: { channelId: channel.id },
    update: {},
    create: {
      channelId: channel.id,
      title: `${channel.name} live`,
      streamUrl: `/hls/${channel.slug}/index.m3u8`,
      isLive: false,
      ingestActive: false,
    },
    select: {
      title: true,
      category: true,
      category2: true,
      rating: true,
      thumbnail: true,
      ingestActive: true,
      isLive: true,
      startedAt: true,
    },
  });

  return (
    <div className="w-full max-w-[1400px] py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <div>
          <h1 className="text-2xl font-semibold">Pre-stream setup</h1>
          <p className="text-sm text-muted">
            Preview your ingest, tune stream details, then publish when ready.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/me"
            className="rounded-full border border-border bg-surface px-3 py-1.5 text-sm hover:bg-surface-2"
          >
            Back to channel
          </Link>
          <Link
            href={`/live/${channel.slug}`}
            className="rounded-full bg-accent-blue px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-blue-hover"
          >
            Open public page
          </Link>
        </div>
      </div>

      <PreStreamSetupForm
        slug={channel.slug}
        initialTitle={stream.title}
        initialCategory={stream.category}
        initialCategory2={stream.category2}
        initialRating={stream.rating}
        initialThumbnail={stream.thumbnail}
        initialIngestActive={stream.ingestActive}
        initialIsLive={stream.isLive}
        initialStartedAt={stream.startedAt}
      />
    </div>
  );
}
