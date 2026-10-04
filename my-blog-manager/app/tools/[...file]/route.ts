import fs from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';

import { navLinks } from '../../../lib/navLinks';
import { siteConfig } from '../../../siteConfig';

/**
 * 🧰 工具本体（控制台侧）：让控制台里点工具卡片也能**直接打开预览**。
 *
 * 工具文件和清单只有一份，在博客项目里（`<blogPath>/tools/`），
 * 这里不做第二份拷贝 —— 只是从控制台的 data/deploy_config.json 里读出 blogPath，
 * 再去那个目录读文件。前台那边有一条一模一样的路由（app/tools/[...file]/route.ts），
 * 区别只是前台读自己进程目录下的 tools/。
 *
 * 顺带把「工具页导航栏」也注进去（同一个 public/toolnav.js），
 * 所以在控制台里就能预览工具页 + 检查它的导航栏主题，不用切到前台。
 */
export const dynamic = 'force-dynamic';

const PROJECT_ROOT = process.cwd();

/** 博客项目物理路径（和同步/图床/工具 API 用的是同一个配置） */
function blogRoot(): string {
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, 'data', 'deploy_config.json'), 'utf8'));
    const p = String(cfg?.blogPath || '').trim();
    return p && fs.existsSync(p) ? p : '';
  } catch {
    return '';
  }
}

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.bmp': 'image/bmp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.eot': 'application/vnd.ms-fontobject',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.pdf': 'application/pdf',
  '.zip': 'application/zip',
  '.wasm': 'application/wasm',
  '.map': 'application/json; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
};

/** 读工具清单（拿每个工具自己的导航栏主题） */
function readMeta(toolsDir: string): any[] {
  try {
    const data = JSON.parse(fs.readFileSync(path.join(toolsDir, 'tools.json'), 'utf8'));
    const list = Array.isArray(data) ? data : (data?.tools ?? []);
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

type NavTheme = 'auto' | 'dark-trans' | 'dark-solid' | 'light-trans' | 'light-solid' | 'hidden';

const NAV_THEMES: NavTheme[] = ['auto', 'dark-trans', 'dark-solid', 'light-trans', 'light-solid', 'hidden'];

/** 主题预设 → 注入给 toolnav.js 的 (theme, opaque) 两项；旧值 dark/light 自动兼容 */
function navPresetOf(toolsDir: string, dir: string): NavTheme {
  const hit = readMeta(toolsDir).find((t) => t && t.dir === dir);
  const raw = String(hit?.navTheme || 'auto');
  const aliased = raw === 'dark' ? 'dark-trans' : raw === 'light' ? 'light-solid' : raw;
  return NAV_THEMES.includes(aliased as NavTheme) ? (aliased as NavTheme) : 'auto';
}

/** 这个工具在清单里的显示名（没有就空串） */
function toolNameOf(toolsDir: string, dir: string): string {
  const hit = readMeta(toolsDir).find((t) => t && t.dir === dir);
  return String(hit?.name || '').trim();
}

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * 🏷️ 标签页标题统一成站内那套：`<工具名> | <站点名>`。
 *   · 「工具名」取的是**清单（tools.json）里的 name**，不是工具 HTML 自带的 <title>；
 *   · 工具 HTML 原来的标题只在清单里没写名字时兜底；
 *   · 原来的 <title> 标签整个换掉（不是追加），免得变成"标题 | 工具名 | 站点名"那种一节一节的。
 */
function withSiteTitle(html: string, toolName: string): string {
  const site = (siteConfig.title || '').trim();
  const m = /<title>([\s\S]*?)<\/title>/i.exec(html);
  const original = m ? (m[1] || '').trim() : '';

  const parts = [toolName || original, site].filter(Boolean);
  if (!parts.length) return html;
  const title = escapeHtml(parts.join(' | '));

  if (m) return html.replace(m[0], `<title>${title}</title>`);

  const tag = `<title>${title}</title>\n`;
  const head = html.toLowerCase().indexOf('</head>');
  return head >= 0 ? html.slice(0, head) + tag + html.slice(head) : tag + html;
}

/**
 * 📱 有些工具网页忘了写 `<meta name="viewport">`：
 *    手机上浏览器会按 980px 宽的「布局视口」渲染、再整体缩小 ——
 *    结果整页（包括我们注入的导航栏）都又小又像电脑版，媒体查询也全按 980px 判定
 *    （新年倒计时那个工具就是这样）。这里统一补一个，**已经有就一个字都不动**。
 */
function withViewportMeta(html: string): string {
  if (/<meta[^>]*name=["']viewport["'][^>]*>/i.test(html)) return html;

  const tag = '<meta name="viewport" content="width=device-width, initial-scale=1.0">';
  // viewport 必须待在 <head> 里、越靠前越稳，所以紧跟 <head> 开标签塞进去
  const head = /<head[^>]*>/i.exec(html);
  if (head) {
    const at = head.index + head[0].length;
    return html.slice(0, at) + '\n' + tag + html.slice(at);
  }
  // 连 <head> 都没写（少见）→ 退而求其次：跟在 charset 后面，或直接放最前面
  const charset = /<meta[^>]*charset[^>]*>/i.exec(html);
  if (charset) {
    const at = charset.index + charset[0].length;
    return html.slice(0, at) + '\n' + tag + html.slice(at);
  }
  return tag + '\n' + html;
}

function navSnippet(toolsDir: string, dir: string): string {
  const preset = navPresetOf(toolsDir, dir);
  if (preset === 'hidden') return '';

  const theme = preset.startsWith('dark') ? 'dark' : preset.startsWith('light') ? 'light' : 'auto';
  const opaque = preset.endsWith('-solid') ? 'solid' : preset.endsWith('-trans') ? 'trans' : 'auto';

  const cfg = {
    navTitle: siteConfig.navTitle || siteConfig.authorName || '',
    navSuffix: siteConfig.navSuffix || 'の',
    after: '工具',
    home: '/',
    links: navLinks.map((l) => ({ name: l.name, href: l.href })),
    theme,
    opaque,
  };
  const json = JSON.stringify(cfg).replace(/</g, '\\u003c');
  return `<script>window.__TOOLNAV__=${json};</script>\n<script src="/toolnav.js" defer></script>\n`;
}

export async function GET(_req: Request, ctx: { params: Promise<{ file?: string[] }> }) {
  const { file } = await ctx.params;

  const segs = (file ?? []).map((s) => {
    try {
      return decodeURIComponent(s);
    } catch {
      return s;
    }
  });

  const root = blogRoot();
  if (!root) {
    return new NextResponse('没配置博客路径：控制台【设置 → 双轨配置】里填 TLBlog 的项目路径并保存', { status: 404 });
  }

  const rootAbs = path.resolve(path.join(root, 'tools'));
  if (!fs.existsSync(rootAbs)) {
    return new NextResponse('博客项目里还没有 tools 目录（先在【工具】页新增一个工具就会自动建）', { status: 404 });
  }

  // 🔒 防目录穿越
  let target = path.resolve(rootAbs, ...segs);
  if (target !== rootAbs && !target.startsWith(rootAbs + path.sep)) {
    return new NextResponse('禁止访问该路径', { status: 403 });
  }

  try {
    if (fs.existsSync(target) && fs.statSync(target).isDirectory()) {
      target = path.join(target, 'index.html');
    }
    if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
      return new NextResponse('工具文件不存在', { status: 404 });
    }

    const ext = path.extname(target).toLowerCase();

    if (ext === '.html' || ext === '.htm') {
      let html = fs.readFileSync(target, 'utf8');
      const dir = segs[0] || '';
      html = withSiteTitle(html, toolNameOf(rootAbs, dir));
      html = withViewportMeta(html);   // 工具忘了写 viewport 的话补一个（否则手机上整页被缩小）
      const snippet = navSnippet(rootAbs, dir);
      if (snippet) {
        const close = html.toLowerCase().lastIndexOf('</body>');
        html = close >= 0 ? html.slice(0, close) + snippet + html.slice(close) : html + snippet;
      }
      return new NextResponse(html, {
        status: 200,
        headers: { 'Content-Type': TYPES[ext], 'Cache-Control': 'no-store' },
      });
    }

    const buf = fs.readFileSync(target);
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        'Content-Type': TYPES[ext] || 'application/octet-stream',
        'Cache-Control': 'no-store',
      },
    });
  } catch {
    return new NextResponse('读取工具文件失败', { status: 500 });
  }
}
