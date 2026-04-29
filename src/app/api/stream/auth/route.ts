import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// MediaMTX HTTP auth callback (see authHTTPAddress in mediamtx.yml).
// MediaMTX POSTs JSON describing the auth attempt; we return 200 to allow,
// 401 to deny. We only gate `publish`; reads/playback are excluded upstream
// in the MediaMTX config so this endpoint never sees them.

function secureStringMatch(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

const authSchema = z.object({
  user: z.string().optional(),
  password: z.string().optional(),
  ip: z.string().optional(),
  action: z.string(),
  path: z.string(),
  protocol: z.string().optional(),
  id: z.string().optional(),
  query: z.string().optional(),
});

function parseSlugFromPath(mtxPath: string): string | null {
  const match = mtxPath.match(/^live\/([a-z0-9-]{1,80})$/i);
  return match ? match[1] : null;
}

function extractKey(
  password: string | undefined,
  query: string | undefined,
): string {
  // MediaMTX puts the URL password in `password` when OBS uses
  // rtmp://user:pass@host/path. Most OBS users instead append the credential
  // as a query string on the stream key (the node-media-server convention),
  // so accept several common parameter names to keep existing OBS configs
  // working without a user-facing migration.
  if (password) return password;
  if (!query) return "";
  try {
    const sp = new URLSearchParams(query);
    return sp.get("key") ?? sp.get("pass") ?? sp.get("password") ?? "";
  } catch {
    return "";
  }
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new NextResponse(null, { status: 400 });
  }

  const parsed = authSchema.safeParse(body);
  if (!parsed.success) {
    return new NextResponse(null, { status: 400 });
  }

  // Streams are publicly viewable — allow reads/playback unconditionally.
  // mediamtx.yml's authHTTPExclude should already prevent these from reaching
  // us, but we allow them here too so the player works even if that config is
  // ineffective.
  if (parsed.data.action === "read" || parsed.data.action === "playback") {
    return new NextResponse(null, { status: 200 });
  }

  // Fail closed on any other non-publish action (api, metrics, pprof, etc.).
  if (parsed.data.action !== "publish") {
    return new NextResponse(null, { status: 401 });
  }

  const slug = parseSlugFromPath(parsed.data.path);
  if (!slug) {
    return new NextResponse(null, { status: 401 });
  }

  const stream = await prisma.liveStream.findFirst({
    where: { channel: { slug } },
    select: { streamKey: true },
  });
  if (!stream || !stream.streamKey) {
    return new NextResponse(null, { status: 401 });
  }

  const provided = extractKey(parsed.data.password, parsed.data.query);
  if (!provided || !secureStringMatch(provided, stream.streamKey)) {
    return new NextResponse(null, { status: 401 });
  }

  return new NextResponse(null, { status: 200 });
}
