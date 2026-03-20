/** @type {import('next').NextConfig} */
const apiBase =
  process.env.NEXT_PUBLIC_API_URL || "https://api.mdent.cloud";

const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${apiBase}/api/:path*`,
      },
      {
        source: "/uploads/:path*",
        destination: `${apiBase}/uploads/:path*`,
      },
      {
        source: "/media/:path*",
        destination: `${apiBase}/media/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
