import { prisma } from "@/lib/prisma";

import { SidebarLayout, type SidebarLiveChannel } from "@/components/SidebarLayout";

export async function Sidebar() {
  const liveChannelsRaw = await prisma.channel.findMany({
    where: { stream: { isLive: true } },
    include: { stream: true },
    orderBy: { stream: { viewers: "desc" } },
    take: 10,
  });

  const liveChannels: SidebarLiveChannel[] = liveChannelsRaw.map((c) => ({
    id: c.id,
    slug: c.slug,
    name: c.name,
    avatarUrl: c.avatarUrl,
    stream: c.stream
      ? { viewers: c.stream.viewers }
      : null,
  }));

  return <SidebarLayout liveChannels={liveChannels} />;
}
