import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const hookSchema = z.object({
  event: z.enum(["prePublish", "donePublish"]),
  streamName: z.string().min(1).max(80).regex(/^[a-z0-9-]+$/i),
  key: z.string().min(1).max(128),
});

function secureStringMatch(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export async function POST(req: Request) {
  const expectedSecret = process.env.STREAM_HOOK_SECRET;
  const incomingSecret = req.headers.get("x-stream-hook-secret") ?? "";

  if (!expectedSecret || !secureStringMatch(incomingSecret, expectedSecret)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const parsed = hookSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid payload." },
      { status: 400 },
    );
  }

  const stream = await prisma.liveStream.findFirst({
    where: { channel: { slug: parsed.data.streamName } },
    select: { id: true, streamKey: true },
  });

  if (!stream?.streamKey || !secureStringMatch(parsed.data.key, stream.streamKey)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  if (parsed.data.event === "prePublish") {
    await prisma.liveStream.update({
      where: { id: stream.id },
      data: {
        isLive: true,
        startedAt: new Date(),
        lastIngestAt: new Date(),
      },
    });
  } else {
    await prisma.liveStream.update({
      where: { id: stream.id },
      data: { isLive: false },
    });
  }

  return NextResponse.json({ ok: true });
}
