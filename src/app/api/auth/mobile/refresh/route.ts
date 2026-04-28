import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { issueMobileTokens, verifyMobileToken } from "@/lib/mobileAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  refreshToken: z.string().min(1),
});

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Refresh token required." },
      { status: 400 },
    );
  }

  const verified = await verifyMobileToken(parsed.data.refreshToken, "refresh");
  if (!verified) {
    return NextResponse.json(
      { error: "Refresh token is invalid or expired." },
      { status: 401 },
    );
  }

  // Confirm the user still exists (e.g. account wasn't deleted).
  const user = await prisma.user.findUnique({
    where: { id: verified.userId },
    select: { id: true },
  });
  if (!user) {
    return NextResponse.json(
      { error: "Account no longer exists." },
      { status: 401 },
    );
  }

  const tokens = await issueMobileTokens(user.id);
  return NextResponse.json(tokens);
}
