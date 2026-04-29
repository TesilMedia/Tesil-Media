import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        // MediaMTX serves LL-HLS on port 8888 (see mediamtx.yml).
        source: "/hls/:path*",
        destination: "http://localhost:8888/live/:path*",
      },
      {
        // /hls-vod was an unused alias; kept for design-doc compatibility but
        // not wired to MediaMTX (which doesn't expose VOD over HLS — VOD lives
        // in /uploads/videos/ as remuxed MP4).
        source: "/hls-vod/:path*",
        destination: "http://localhost:8888/vod/:path*",
      },
    ];
  },
  experimental: {
    // Next clones the incoming body with a 10MB default cap; larger uploads are
    // truncated and multipart parsing fails. This applies to route handlers too.
    // See https://nextjs.org/docs/app/api-reference/config/next-config-js/middlewareClientMaxBodySize
    middlewareClientMaxBodySize: "10gb",
    // `next dev` proxies to the app with http-proxy; the default proxy timeout is
    // 30s, which cuts off slow/large uploads and makes multipart parsing fail.
    // https://nextjs.org/docs/app/api-reference/config/next-config-js/proxyTimeout
    proxyTimeout: 3_600_000,
    serverActions: {
      bodySizeLimit: "10gb",
    },
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
      { protocol: "http", hostname: "**" },
    ],
  },
};

export default nextConfig;
