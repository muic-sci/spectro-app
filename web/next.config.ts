import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Fully static app — `next build` emits a static `out/` (HTML/JS/CSS) that runs
  // entirely in the browser (IndexedDB for data; no server, DB or API routes).
  output: "export",
  // No Next image optimisation server in a static export.
  images: { unoptimized: true },
  experimental: {
    // HeroUI ships ESM; optimise its barrel imports.
    optimizePackageImports: ["@heroui/react"],
  },
};

export default nextConfig;
