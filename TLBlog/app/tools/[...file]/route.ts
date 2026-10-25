import fs from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';

import { navLinks } from '../../../lib/navLinks';
import { siteConfig } from '../../../siteConfig';

export const dynamic = 'force-dynamic';

const TOOLS_DIR = path.join(process.cwd(), 'tools');

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

function navThemeOf(dir: string): NavTheme {
  const hit = readMeta().find((t) => t && t.dir === dir);
  const raw = String(hit?.navTheme || 'auto');
  const aliased = raw === 'dark' ? 'dark-trans' : raw === 'light' ? 'light-solid' : raw;
  return NAV_THEMES.includes(aliased as NavTheme) ? (aliased as NavTheme) : 'auto';
}

function toolNameOf(dir: string): string {
  const hit = readMeta().find((t) => t && t.dir === dir);
  return String(hit?.name || '').trim();
}

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

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

function withViewportMeta(html: string): string {
  if (/<meta[^>]*name=["']viewport["'][^>]*>/i.test(html)) return html;

  const tag = '<meta name="viewport" content="width=device-width, initial-scale=1.0">';
  const head = /<head[^>]*>/i.exec(html);
  if (head) {
    const at = head.index + head[0].length;
    return html.slice(0, at) + '\n' + tag + html.slice(at);
  }
  const charset = /<meta[^>]*charset[^>]*>/i.exec(html);
  if (charset) {
    const at = charset.index + charset[0].length;
    return html.slice(0, at) + '\n' + tag + html.slice(at);
  }
  return tag + '\n' + html;
}

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

  const rootAbs = path.resolve(TOOLS_DIR);

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
      html = withSiteTitle(html, toolNameOf(dir));
      html = withViewportMeta(html);
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