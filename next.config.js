// @ts-check

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  experimental: {
    scrollRestoration: true,
    outputFileTracingIncludes: {
      "/collections": ["./data/collections/**/*", "./data/collections.json"],
      "/collections/[slug]": ["./data/collections/**/*", "./data/collections.json"],
      "/collections/[slug]/[tokenId]": ["./data/collections/**/*", "./data/collections.json"],
      "/ethscriptions/[hash]": ["./data/collections/**/*", "./data/collections.json"],
    },
  },
  webpack: (config, { dev }) => {
    if (dev) {
      config.watchOptions = {
        ...config.watchOptions,
        ignored: ["**/node_modules/**", "**/.git/**", "**/*.dump", "**/data/collections/.progress/**"],
      };
    }
    return config;
  },
};

module.exports = nextConfig;
