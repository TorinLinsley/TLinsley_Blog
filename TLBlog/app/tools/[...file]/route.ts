import fs from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';

import { navLinks } from '../../../lib/navLinks';
import { siteConfig } from '../../../siteConfig';

/**
 * 🧰 工具本体：把 `tools/<项目目录>/<文件>` 原样吐给浏览器。
 *
 * 为什么要这条路：工具网页是**独立的 HTML**（里面可能还有自己的 css/js/图片），
 * 不应该被 Next 当成页面组件去渲染，所以这里用 route handler 直接读盘返回 ——
 * 和 `/uploads` 是一个思路。工具里的相对路径（`./style.css`）会自然地落到
 * `/tools/<项目目录>/style.css`，同样由这里服务。
 *
 * 🧭 顺带把「工具页导航栏」注进去：
 *   HTML 响应会在 `</body>` 前面插一段配置 + `/toolnav.js`（见 public/toolnav.js）。
 *   这样**不用改工具自己的 HTML**，以后丢新工具进来也自动有导航栏；
 *   某个工具不要导航栏，就在控制台把它设成「不要导航栏」（tools.json 里的 navTheme=hidden）。
 */
export const dynamic = 'force-dynamic';

const TOOLS_DIR = path.join(process.cwd(), 'tools');

/** 按扩展名给 Content-Type；不带 charset 的文本类型统一补上 UTF-8 */
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

/** 读 tools.json（拿每个工具自己的导航栏主题设置） */
function readMeta(): any[] {
  try {
    const data = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'tools.json'), 'utf8'));
    const list = Array.isArray(data) ? data : (data?.tools ?? []);
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

type NavTheme = 'auto' | 'dark-trans' | 'dark-solid' | 'light-trans' | 'light-solid' | 'hidden';

const NAV_THEMES: NavTheme[] = ['auto', 'dark-trans', 'dark-solid', 'light-trans', 'light-solid', 'hidden'];

/**
 * 这个工具的导航栏主题。
 * 6 个预设 = 明暗(auto/dark/light) × 透明度(trans/solid)，外加 auto 和 hidden。
 * 旧值自动兼容：'dark' → 'dark-trans'、'light' → 'light-solid'（和当初的行为一致）。
 */
function navThemeOf(dir: string): NavTheme {
  const hit = readMeta().find((t) => t && t.dir === dir);
  const raw = String(hit?.navTheme || 'auto');
  const aliased = raw === 'dark' ? 'dark-trans' : raw === 'light' ? 'light-solid' : raw;
  return NAV_THEMES.includes(aliased as NavTheme) ? (aliased as NavTheme) : 'auto';
}

/** 这个工具在清单里的显示名（没有就空串） */
function toolNameOf(dir: string): string {
  const hit = readMeta().find((t) => t && t.dir === dir);
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

/** 注入到工具 HTML 里的那两行（配置 + 脚本）；hidden 就不注 */
function navSnippet(dir: string): string {
  const preset = navThemeOf(dir);
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

  // 顺手把 < 转义掉，免得配置里的内容意外把 </script> 提前闭合
  const json = JSON.stringify(cfg).replace(/</g, '\\u003c');
  return `<script>window.__TOOLNAV__=${json};</script>\n<script src="/toolnav.js" defer></script>\n`;
}

export async function GET(_req: Request, ctx: { params: Promise<{ file?: string[] }> }) {
  const { file } = await ctx.params;

  // Next 传进来的动态段是「未解码」的，中文/空格要自己解一次
  const segs = (file ?? []).map((s) => {
    try {
      return decodeURIComponent(s);
    } catch {
      return s;
    }
  });

  const rootAbs = path.resolve(TOOLS_DIR);

  // 🔒 防目录穿越：解析后必须仍然落在 tools/ 里面
  let target = path.resolve(rootAbs, ...segs);
  if (target !== rootAbs && !target.startsWith(rootAbs + path.sep)) {
    return new NextResponse('禁止访问该路径', { status: 403 });
  }

  try {
    // 目录（或没写文件名）→ 找 index.html
    if (fs.existsSync(target) && fs.statSync(target).isDirectory()) {
      target = path.join(target, 'index.html');
    }
    if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
      return new NextResponse('工具文件不存在', { status: 404 });
    }

    const ext = path.extname(target).toLowerCase();

    // HTML：读成文本，改标题 + 把导航栏注进去（不用动工具自己的文件）
    if (ext === '.html' || ext === '.htm') {
      let html = fs.readFileSync(target, 'utf8');
      const dir = segs[0] || '';
      html = withSiteTitle(html, toolNameOf(dir));
      html = withViewportMeta(html);   // 工具忘了写 viewport 的话补一个（否则手机上整页被缩小）
      const snippet = navSnippet(dir);
      if (snippet) {
        const close = html.toLowerCase().lastIndexOf('</body>');
        html = close >= 0 ? html.slice(0, close) + snippet + html.slice(close) : html + snippet;
      }
      return new NextResponse(html, {
        status: 200,
        headers: { 'Content-Type': TYPES[ext], 'Cache-Control': 'no-store' },
      });
    }

    // 其它资源：原样吐字节
    const buf = fs.readFileSync(target);
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        'Content-Type': TYPES[ext] || 'application/octet-stream',
        // 工具是随时改随时用的，一律不强缓存：刷新就是最新的
        'Cache-Control': 'no-store',
      },
    });
  } catch {
    return new NextResponse('读取工具文件失败', { status: 500 });
  }
}
