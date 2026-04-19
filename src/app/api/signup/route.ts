import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { uniqueChannelSlug } from "@/lib/slug";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().min(1).max(40).optional(),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid input" },
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
        channel: {
          create: {
            slug,
            name: displayName,
          },
        },
      },
    });

    return NextResponse.json({ ok: true, userId: user.id, channelSlug: slug });
  } catch (err) {
    console.error("Signup failed:", err);
    return NextResponse.json(
      { error: "Something went wrong." },
      { status: 500 },
    );
  }
}
