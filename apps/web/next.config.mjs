/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@ai-knowledge/schemas"],
  env: {
    NEXT_PUBLIC_API_BASE: process.env.API_BASE_URL || "http://localhost:9999/api",
  },
  async rewrites() {
    const base = process.env.API_BASE_URL || "http://localhost:9999/api";
    return [
      {
        source: "/api/backend/:path*",
        destination: `${base}/:path*`,
      },
    ];
  },
};

export default nextConfig;