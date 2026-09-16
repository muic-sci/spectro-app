import type { NextConfig } from "next";

// Serve the export from a sub-path. Empty (the default — Docker/nginx build,
// `npm run dev`) = the domain root. The GitHub Pages workflow sets
// NEXT_PUBLIC_BASE_PATH=/spectro-app because a project site lives at
// https://<org>.github.io/<repo>/. Next prefixes every <Link>, router.push and
// _next/ asset with it itself, so app code never needs to know — which is why
// the app must keep using next/link (no raw <a href="/…">, window.location or
// absolute fetch paths).
const basePath = (process.env.NEXT_PUBLIC_BASE_PATH || "").replace(/\/+$/, "");

const nextConfig: NextConfig = {
  // Fully static app — `next build` emits a static `out/` (HTML/JS/CSS) that runs
  // entirely in the browser (IndexedDB for data; no server, DB or API routes).
  output: "export",
  basePath,
  // No Next image optimisation server in a static export.
  images: { unoptimized: true },
  experimental: {
    // HeroUI ships ESM; optimise its barrel imports.
    optimizePackageImports: ["@heroui/react"],
  },
};

export default nextConfig;
