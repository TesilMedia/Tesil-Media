import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public poll endpoint so waiting-room viewers can detect when the stream goes live. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  const channel = await prisma.channel.findUnique({
    where: { slug },
    select: { stream: { select: { isLive: true } } },
  });

  if (!channel?.stream) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  return NextResponse.json({ isLive: channel.stream.isLive });
}
