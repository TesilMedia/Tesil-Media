import type { Prisma } from "@prisma/client";

/**
 * Live RTMP sessions create a Video row on publish with a placeholder HLS
 * `sourceUrl` until `vodReady` replaces it with the finished MP4. Those rows
 * must not appear next to normal uploads in grids and API lists.
 */
export const EXCLUDE_LIVE_RECORDING_PLACEHOLDERS: Prisma.VideoWhereInput = {
  NOT: { sourceUrl: { startsWith: "/hls/" } },
};
