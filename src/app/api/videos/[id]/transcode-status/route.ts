import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import {
  expectedTranscodedRungCount,
  parseQualityVariantsJson,
} from "@/lib/videoQualities";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Upload client polls this to show progress while additional quality rungs
 * are encoded. The video is already watchable (source) while `pending` is true.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const video = await prisma.video.findUnique({ where: { id } });
  if (!video) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const renditions = parseQualityVariantsJson(video.qualityVariantsJson);
  const sourceHeight = renditions?.[0]?.height ?? 0;
  const totalExtraQualities = expectedTranscodedRungCount(sourceHeight);
  const completedExtraQualities = renditions
    ? Math.max(0, renditions.length - 1)
    : 0;

  return NextResponse.json({
    pending: video.transcodePending,
    totalExtraQualities,
    completedExtraQualities,
  });
}
