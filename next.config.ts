import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: "/hls/:path*",
        destination: "http://localhost:8000/live/:path*",
      },
      {
        source: "/hls-vod/:path*",
        destination: "http://localhost:8000/vod/:path*",
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
