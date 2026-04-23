import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import {
  type VideoQualityRendition,
  heightToDisplayLabel,
} from "@/lib/videoQualities";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public list of VOD quality URLs for the embedded player. Same access model as
 * the watch page: anyone with the video id can read metadata.
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

  let parsed: unknown = null;
  if (video.qualityVariantsJson) {
    try {
      parsed = JSON.parse(video.qualityVariantsJson) as unknown;
    } catch {
      parsed = null;
    }
  }
  let renditions: VideoQualityRendition[];

  if (Array.isArray(parsed) && parsed.length > 0) {
    renditions = parsed as VideoQualityRendition[];
  } else {
    renditions = [
      {
        label: heightToDisplayLabel(0),
        url: video.sourceUrl,
        height: 0,
      },
    ];
  }

  return NextResponse.json({
    defaultUrl: video.sourceUrl,
    renditions,
  });
}
