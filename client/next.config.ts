import type { NextConfig } from "next";
import { API_BASE_URL } from "./src/lib/api-config";

const backendUrl = API_BASE_URL;

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: `${backendUrl}/api/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;
