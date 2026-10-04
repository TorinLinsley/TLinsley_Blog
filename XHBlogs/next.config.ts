import type { NextConfig } from "next";

const nextConfig: NextConfig = {

  // ⚠️ 用手机连本机 dev server 调试时，内网穿透（cpolar）给的公网域名也必须写进来。
  // Next 的 dev server 默认拒绝「跨站来源」加载 /_next/* 开发资源（直接 403），
  // 结果就是 JS 加载不了、React 不水合 —— 手机上只看到背景图，正文一概不显示。
  // 用 ** 是因为 cpolar 免费版的域名是随机的，** 能匹配任意层级子域名。
  allowedDevOrigins: [
    "localhost",
    "127.0.0.1",
    "blog.torinlinsley.top",
    "torinlinsley.top",
    "49.232.35.177",
    "**.cpolar.top",
    "**.cpolar.cn",
    "**.cpolar.io",
    // 👇 局域网里用别的机器（含虚拟机/手机/平板）访问 dev server 时，把那个地址也加上：
    "192.168.77.133",   // Ubuntu 虚拟机
    "192.168.*.*",      // 整个 192.168 内网（Next 支持这种通配）
    "10.*.*.*",         // 有些虚拟机的 NAT 网段是 10.x
    "172.16.*.*",
  ],

  // 下面这些可以保留
  images: {
    unoptimized: true,
  },
  // 关掉开发模式左下角那个「N」小圆按钮（Next 的 dev-tools 指示器）。
  // 它只在 `next dev` 下出现，生产构建（next build + next start）本来就没有；
  // 但现在博客是跑在 dev server 上的，手机上也会看到它，所以直接关掉。
  // ⚠️ 改 next.config 需要重启 dev server 才生效。
  devIndicators: false,
  typescript: {
    ignoreBuildErrors: true, // 忽略 TS 错误，方便快速部署
  },
};

export default nextConfig;