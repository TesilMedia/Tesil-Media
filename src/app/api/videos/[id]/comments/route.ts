import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY = 2000;
const FETCH_LIMIT = 500;

const postSchema = z.object({
  body: z.string().trim().min(1, "Comment cannot be empty.").max(MAX_BODY),
  parentId: z.string().min(1).optional().nullable(),
});

const userInclude = {
  user: {
    select: {
      id: true,
      name: true,
      image: true,
      channel: { select: { slug: true, name: true, avatarUrl: true } },
    },
  },
} as const;

function serialize(c: {
  id: string;
  body: string;
  createdAt: Date;
  editedAt: Date | null;
  userId: string;
  parentId: string | null;
  user: {
    id: string;
    name: string | null;
    image: string | null;
    channel: { slug: string; name: string; avatarUrl: string | null } | null;
  };
}) {
  return {
    id: c.id,
    body: c.body,
    createdAt: c.createdAt.toISOString(),
    editedAt: c.editedAt ? c.editedAt.toISOString() : null,
    userId: c.userId,
    parentId: c.parentId,
    user: {
      id: c.user.id,
      name: c.user.channel?.name ?? c.user.name,
      image: c.user.channel?.avatarUrl ?? c.user.image,
      channelSlug: c.user.channel?.slug ?? null,
    },
  };
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const video = await prisma.video.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!video) {
    return NextResponse.json({ error: "Video not found." }, { status: 404 });
  }

  const comments = await prisma.comment.findMany({
    where: { videoId: id },
    orderBy: { createdAt: "desc" },
    take: FETCH_LIMIT,
    include: userInclude,
  });

  return NextResponse.json({ comments: comments.map(serialize) });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  const { id } = await params;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const parsed = postSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input." },
      { status: 400 },
    );
  }

  const video = await prisma.video.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!video) {
    return NextResponse.json({ error: "Video not found." }, { status: 404 });
  }

  const parentId: string | null = parsed.data.parentId ?? null;
  if (parentId) {
    const parent = await prisma.comment.findUnique({
      where: { id: parentId },
      select: { id: true, videoId: true },
    });
    if (!parent || parent.videoId !== id) {
      return NextResponse.json(
        { error: "Parent comment not found." },
        { status: 404 },
      );
    }
  }

  const created = await prisma.comment.create({
    data: {
      body: parsed.data.body,
      videoId: id,
      userId: session.user.id,
      parentId,
    },
    include: userInclude,
  });

  return NextResponse.json({ comment: serialize(created) }, { status: 201 });
}
