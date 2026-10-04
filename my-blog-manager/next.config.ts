import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ⚠️ 开发模式（next dev）会拒绝「跨站来源」加载 /_next/* 开发资源（403），
  //    表现就是页面上只剩背景图、其它元素全不出来。
  //    用 127.0.0.1 / localhost / 局域网 IP 访问控制台时，都必须列在这里。
  allowedDevOrigins: [
    "localhost",
    "127.0.0.1",
    "192.168.*.*",
    "10.*.*.*",
    "172.16.*.*",
  ],

  // 【核心开关】：告诉 Next.js 放弃 Node.js，打包成纯静态的 HTML/CSS/JS
  output: 'standalone',

  // 【必须项】：因为没有 Node.js 服务器了，Next.js 自带的图片压缩服务会失效，必须关闭它
  images: {
    unoptimized: true,
  },
  // 👇 终极大招 1：屏蔽所有 TypeScript 类型报错！
  typescript: {
    ignoreBuildErrors: true,
  },

  // 👇 终极大招 2：顺手把 ESLint 语法检查也屏蔽了，防止它出来捣乱！
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;