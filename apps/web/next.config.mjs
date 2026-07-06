import { validateWebEnv } from "./env.mjs";

validateWebEnv();

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@ai-knowledge/schemas"],
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${process.env.API_INTERNAL_URL}/:path*`,
      },
    ];
  },
};

export default nextConfig;
