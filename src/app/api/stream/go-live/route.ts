import { NextResponse } from "next/server";

import { getAuthUser } from "@/lib/mobileAuth";
import { prisma } from "@/lib/prisma";
import { ensureChannelForUser } from "@/lib/slug";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const authUser = await getAuthUser(req);
  if (!authUser) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const channel = await ensureChannelForUser(authUser.id);
  if (!channel) {
    return NextResponse.json(
      { error: "Your session is no longer valid. Please sign in again." },
      { status: 401 },
    );
  }

  const stream = await prisma.liveStream.findUnique({
    where: { channelId: channel.id },
    select: { id: true, ingestActive: true, isLive: true },
  });
  if (!stream) {
    return NextResponse.json({ error: "Stream not found." }, { status: 404 });
  }
  if (!stream.ingestActive) {
    return NextResponse.json(
      { error: "OBS is not publishing yet." },
      { status: 409 },
    );
  }
  if (stream.isLive) {
    return NextResponse.json({ ok: true, alreadyLive: true });
  }

  const updated = await prisma.liveStream.update({
    where: { id: stream.id },
    data: { isLive: true, startedAt: new Date() },
    select: { startedAt: true },
  });

  return NextResponse.json({ ok: true, startedAt: updated.startedAt });
}
