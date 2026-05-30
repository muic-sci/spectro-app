import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // sharp is a native dep used only in server-side analysis route handlers /
  // server actions. Keep it external so Next doesn't try to bundle the binary.
  serverExternalPackages: ["sharp"],
  experimental: {
    // HeroUI ships ESM; optimise its barrel imports.
    optimizePackageImports: ["@heroui/react"],
  },
};

export default nextConfig;
