// @ts-check

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  experimental: {
    scrollRestoration: true,
  },
  async redirects() {
    return [
      {
        source: "/collections/:slug+",
        destination: "/collections",
        permanent: false,
      },
    ];
  },
};

module.exports = nextConfig;
