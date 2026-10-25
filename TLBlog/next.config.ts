import type { NextConfig } from "next";

const nextConfig: NextConfig = {

  allowedDevOrigins: [
    "localhost",
    "127.0.0.1",
    "blog.torinlinsley.top",
    "torinlinsley.top",
    "49.232.35.177",
    "**.cpolar.top",
    "**.cpolar.cn",
    "**.cpolar.io",
    "192.168.77.133",
    "192.168.*.*",
    "10.*.*.*",
    "172.16.*.*",
  ],

  images: {
    unoptimized: true,
  },
  devIndicators: false,
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;