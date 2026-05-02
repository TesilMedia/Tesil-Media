import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
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

  return (
    <div className="mx-auto w-full max-w-5xl py-4">
      <h1 className="mb-4 text-2xl font-semibold">Upload a video</h1>

      <UploadForm />
    </div>
  );
}
