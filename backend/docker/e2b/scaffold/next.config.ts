import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scaffoldRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  outputFileTracingRoot: scaffoldRoot,
};

export default nextConfig;
