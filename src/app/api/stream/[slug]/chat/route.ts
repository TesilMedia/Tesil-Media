import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  addChatClient,
  broadcastChat,
  isRateLimited,
  removeChatClient,
} from "@/lib/chatClients";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY = 300;
// How many messages to replay to a newly connected client.
const HISTORY_LIMIT = 50;

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  const channel = await prisma.channel.findUnique({
    where: { slug },
    select: { stream: { select: { id: true } } },
  });
  if (!channel?.stream) {
    return new Response("Not found", { status: 404 });
  }

  const streamId = channel.stream.id;

  const history = await prisma.liveMessage.findMany({
    where: { streamId },
    orderBy: { createdAt: "asc" },
    take: HISTORY_LIMIT,
    select: {
      id: true,
      body: true,
      createdAt: true,
      user: { select: { id: true, name: true, image: true } },
    },
  });

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const send = (data: string) => {
        try {
          controller.enqueue(encoder.encode(data));
        } catch {
          // Controller already closed.
        }
      };

      for (const msg of history) {
        send(`data: ${JSON.stringify({ type: "message", ...msg })}\n\n`);
      }

      addChatClient(streamId, send);

      const heartbeat = setInterval(() => {
        try {
          send(": keep-alive\n\n");
        } catch {
          clearInterval(heartbeat);
        }
      }, 25_000);

      req.signal.addEventListener("abort", () => {
        clearInterval(heartbeat);
        removeChatClient(streamId, send);
        try {
          controller.close();
        } catch {
          // Already closed.
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const { slug } = await params;

  const channel = await prisma.channel.findUnique({
    where: { slug },
    select: { stream: { select: { id: true, isLive: true } } },
  });
  if (!channel?.stream) {
    return NextResponse.json({ error: "Stream not found." }, { status: 404 });
  }
  if (!channel.stream.isLive) {
    return NextResponse.json({ error: "Stream is not live." }, { status: 400 });
  }

  if (isRateLimited(session.user.id)) {
    return NextResponse.json(
      { error: "Sending too fast. Wait a moment." },
      { status: 429 },
    );
  }

  let body: string;
  try {
    const json = await req.json();
    body = String(json.body ?? "").trim();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  if (!body || body.length > MAX_BODY) {
    return NextResponse.json(
      { error: `Message must be 1–${MAX_BODY} characters.` },
      { status: 400 },
    );
  }

  const message = await prisma.liveMessage.create({
    data: {
      body,
      streamId: channel.stream.id,
      userId: session.user.id,
    },
    select: {
      id: true,
      body: true,
      createdAt: true,
      user: { select: { id: true, name: true, image: true } },
    },
  });

  broadcastChat(channel.stream.id, { type: "message", ...message });

  return NextResponse.json({ ok: true });
}
