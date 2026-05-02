import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  STALE_SESSION_SIGN_OUT_URL,
  ensureChannelForUser,
} from "@/lib/slug";
import { UploadForm } from "./UploadForm";

export const dynamic = "force-dynamic";

export default async function UploadPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/signin?callbackUrl=/upload");
  }

  const channel = await ensureChannelForUser(session.user.id);
  if (!channel) redirect(STALE_SESSION_SIGN_OUT_URL);

  const videoCount = await prisma.video.count({ where: { channelId: channel.id } });

  return (
    <div className="mx-auto w-full max-w-2xl py-10">
      <h1 className="mb-1 text-2xl font-semibold">Upload a video</h1>
      <p className="mb-6 text-sm text-muted">
        Uploading to{" "}
        <Link href={`/c/${channel.slug}`} className="text-accent-blue hover:underline">
          {channel.name}
        </Link>
        {" "}· {videoCount} video{videoCount === 1 ? "" : "s"} so far.
      </p>

      <UploadForm />

      <div className="mt-8 rounded-md border border-border bg-surface p-4 text-xs text-muted">
        <p className="mb-1 font-semibold text-text">Notes</p>
        <ul className="list-inside list-disc space-y-1">
          <li>
            Accepted formats: <code>mp4, webm, mkv, mov, m4v, ogv, ogg</code>.
          </li>
          <li>
            Thumbnail is optional (<code>jpg, png, webp, gif</code>).
          </li>
          <li>
            Files are saved to <code>public/uploads/</code> on this PC — great for
            local testing, not for production.
          </li>
        </ul>
      </div>
    </div>
  );
}
