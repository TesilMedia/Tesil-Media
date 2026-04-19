import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { VideoPlayer } from "@/components/VideoPlayer";

import { EditVideoForm } from "./EditVideoForm";

export const dynamic = "force-dynamic";

export default async function EditVideoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const session = await auth();
  if (!session?.user?.id) {
    redirect(`/signin?callbackUrl=/me/videos/${id}/edit`);
  }

  const video = await prisma.video.findUnique({
    where: { id },
    include: { channel: true },
  });
  if (!video) notFound();
  if (video.channel.ownerId !== session.user.id) {
    redirect("/me");
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 lg:px-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <Link
            href="/me"
            className="text-sm text-muted hover:text-text"
          >
            ← Back to your channel
          </Link>
          <h1 className="mt-1 text-2xl font-semibold">Edit video</h1>
        </div>
        <Link
          href={`/watch/${video.id}`}
          className="rounded-full border border-border bg-surface px-3 py-1.5 text-sm hover:bg-surface-2"
        >
          View live
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div>
          <VideoPlayer src={video.sourceUrl} title={video.title} />
          <p className="mt-2 break-all text-xs text-muted">
            Source: <code>{video.sourceUrl}</code>
          </p>
        </div>

        <EditVideoForm
          video={{
            id: video.id,
            title: video.title,
            description: video.description,
            category: video.category,
            rating: video.rating,
            thumbnail: video.thumbnail,
            sourceUrl: video.sourceUrl,
          }}
        />
      </div>
    </div>
  );
}
