/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "https://api.mdent.cloud/api/:path*",
      },
      {
        source: "/uploads/:path*",
        destination: "https://api.mdent.cloud/uploads/:path*",
      },
      {
        source: "/media/:path*",
        destination: "https://api.mdent.cloud/media/:path*",
      },
    ];
  },
};

module.exports = nextConfig;
