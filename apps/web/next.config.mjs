/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@ai-knowledge/schemas"],
  async rewrites() {
    return [
      {
        source: "/api/backend/:path*",
        destination: `${process.env.API_INTERNAL_URL || "http://api:9999"}/:path*`,
      },
    ];
  },
};

export default nextConfig;