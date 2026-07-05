import type { NextConfig } from "next";
import path from "path";
import { fileURLToPath } from "url";

const root = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  output: "export",
  outputFileTracing: false,
  images: {
    unoptimized: true,
  },
  trailingSlash: true,
  turbopack: {
    root,
  },
};

export default nextConfig;
