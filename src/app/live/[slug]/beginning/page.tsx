import { notFound, redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function LiveBeginningRedirect({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ override?: string }>;
}) {
  const [{ slug }, { override }] = await Promise.all([params, searchParams]);

  const channel = await prisma.channel.findUnique({
    where: { slug },
    include: { stream: true },
  });
  const vodId = channel?.stream?.vodVideoId;
  if (!vodId) notFound();

  const usp = new URLSearchParams({ from: "start" });
  if (override === "1") usp.set("override", "1");
  redirect(`/watch/${vodId}?${usp.toString()}`);
}
