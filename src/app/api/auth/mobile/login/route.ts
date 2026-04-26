import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { issueMobileTokens } from "@/lib/mobileAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
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
      { error: parsed.error.issues[0]?.message ?? "Invalid input." },
      { status: 400 },
    );
  }

  const email = parsed.data.email.toLowerCase();
  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      name: true,
      image: true,
      hashedPassword: true,
      channel: { select: { slug: true } },
    },
  });

  if (!user || !user.hashedPassword) {
    return NextResponse.json(
      { error: "Invalid email or password." },
      { status: 401 },
    );
  }

  const ok = await bcrypt.compare(parsed.data.password, user.hashedPassword);
  if (!ok) {
    return NextResponse.json(
      { error: "Invalid email or password." },
      { status: 401 },
    );
  }

  const tokens = await issueMobileTokens(user.id);

  return NextResponse.json({
    ...tokens,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      image: user.image,
      channelSlug: user.channel?.slug ?? null,
    },
  });
}
