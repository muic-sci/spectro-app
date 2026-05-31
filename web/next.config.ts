import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained server build for Docker: `.next/standalone` ships a minimal
  // node_modules + server.js so the runtime image stays small.
  output: "standalone",
  // sharp is a native dep used only in server-side analysis route handlers /
  // server actions. Keep it external so Next doesn't try to bundle the binary.
  serverExternalPackages: ["sharp"],
  experimental: {
    // HeroUI ships ESM; optimise its barrel imports.
    optimizePackageImports: ["@heroui/react"],
    // Captures are phone photos uploaded through a server action (the dev
    // stand-in for the paired phone). Raise the default 1 MB action body cap.
    serverActions: {
      bodySizeLimit: "12mb",
    },
  },
};

export default nextConfig;
