import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { uniqueChannelSlug } from "@/lib/slug";
import { issueMobileTokens } from "@/lib/mobileAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().min(1).max(40).optional(),
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
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json(
      { error: "An account with that email already exists." },
      { status: 409 },
    );
  }

  const hashed = await bcrypt.hash(parsed.data.password, 10);
  const displayName = parsed.data.name ?? email.split("@")[0];
  const slug = await uniqueChannelSlug(displayName);

  const user = await prisma.user.create({
    data: {
      email,
      name: displayName,
      hashedPassword: hashed,
      channel: { create: { slug, name: displayName } },
    },
    select: { id: true, email: true, name: true, image: true },
  });

  const tokens = await issueMobileTokens(user.id);

  return NextResponse.json({
    ...tokens,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      image: user.image,
      channelSlug: slug,
    },
  });
}
