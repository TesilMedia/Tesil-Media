import { NextResponse } from "next/server";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createWriteStream } from "node:fs";
import { mkdir, stat, unlink } from "node:fs/promises";

import Busboy from "@fastify/busboy";

import { getAuthUser } from "@/lib/mobileAuth";
import { ensureChannelForUser } from "@/lib/slug";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const ALLOWED_IMAGE_EXTS = new Set(["jpg", "jpeg", "png", "webp", "gif"]);

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const MAX_BANNER_BYTES = 12 * 1024 * 1024;

const CHANNEL_DIR = path.join(process.cwd(), "public", "uploads", "channel");

function extFromName(name: string): string {
  const idx = name.lastIndexOf(".");
  if (idx < 0) return "";
  return name.slice(idx + 1).toLowerCase();
}

type Kind = "avatar" | "banner";

async function parseChannelImage(
  req: Request,
  channelId: string,
): Promise<
  { ok: true; kind: Kind; fileName: string } | { ok: false; error: string }
> {
  const ct = req.headers.get("content-type");
  if (!ct || !ct.toLowerCase().includes("multipart/form-data")) {
    return { ok: false, error: "Expected multipart/form-data." };
  }

  const body = req.body;
  if (!body) {
    return { ok: false, error: "Missing request body." };
  }

  await mkdir(CHANNEL_DIR, { recursive: true });

  const headers: Record<string, string> = {};
  req.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value;
  });
  headers["content-type"] = ct;

  let fieldKind: Kind | null = null;
  let outName: string | null = null;
  let gotFile = false;
  const writes: Promise<void>[] = [];

  const bb = Busboy({
    headers: headers as { "content-type": string },
    defCharset: "utf8",
    limits: {
      fieldSize: 256,
      fileSize: MAX_BANNER_BYTES,
    },
  });

  bb.on("file", (fieldname, fileStream, filename) => {
    if (fieldname !== "avatar" && fieldname !== "banner") {
      fileStream.resume();
      return;
    }
    if (gotFile) {
      fileStream.resume();
      return;
    }
    const safeName =
      typeof filename === "string" && filename.length > 0 ? filename : "image";
    const ext = extFromName(safeName);
    if (!ALLOWED_IMAGE_EXTS.has(ext)) {
      fileStream.resume();
      return;
    }
    gotFile = true;
    fieldKind = fieldname as Kind;
    const name = `${channelId}-${fieldKind}-${randomUUID()}.${ext}`;
    outName = name;
    const dest = path.join(CHANNEL_DIR, name);
    writes.push(
      pipeline(fileStream, createWriteStream(dest)).then(() => undefined),
    );
  });

  const nodeIn = Readable.fromWeb(
    body as import("node:stream/web").ReadableStream<Uint8Array>,
  );

  try {
    await new Promise<void>((resolve, reject) => {
      bb.once("finish", resolve);
      bb.once("error", reject);
      nodeIn.once("error", reject);
      nodeIn.pipe(bb);
    });
  } catch (err) {
    console.error("Channel image multipart parse failed:", err);
    const msg =
      err instanceof Error
        ? err.message
        : "Upload failed; the connection may have been reset.";
    return { ok: false, error: msg };
  }

  try {
    await Promise.all(writes);
  } catch (err) {
    console.error("Channel image save failed:", err);
    return { ok: false, error: "Failed to save image." };
  }

  if (!fieldKind || !outName) {
    return {
      ok: false,
      error:
        "Send one image file as field \"avatar\" or \"banner\" (JPEG, PNG, WebP, or GIF).",
    };
  }

  const dest = path.join(CHANNEL_DIR, outName);
  try {
    const st = await stat(dest);
    if (st.size === 0) {
      await unlink(dest).catch(() => {});
      return { ok: false, error: "Image file was empty." };
    }
    const max =
      fieldKind === "avatar" ? MAX_AVATAR_BYTES : MAX_BANNER_BYTES;
    if (st.size > max) {
      await unlink(dest).catch(() => {});
      return {
        ok: false,
        error:
          fieldKind === "avatar"
            ? "Avatar must be 5MB or smaller."
            : "Banner must be 12MB or smaller.",
      };
    }
  } catch {
    return { ok: false, error: "Image was not saved correctly." };
  }

  return { ok: true, kind: fieldKind, fileName: outName };
}

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
  const parsed = await parseChannelImage(req, channel.id);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const url = `/uploads/channel/${parsed.fileName}`;
  return NextResponse.json({ ok: true, url });
}
