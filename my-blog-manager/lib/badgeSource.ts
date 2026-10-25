export function badgeHtmlToSource(html: string): string {
  if (!html || !html.includes('<img')) return html;
  return html.replace(/<a\b([^>]*)>\s*<img\b([^>]*?)\/?>\s*<\/a>/gi, (whole, aAttrs: string, imgAttrs: string) => {
    const href = (/href\s*=\s*"([^"]*)"/i.exec(aAttrs) || [])[1] || '';
    const src = (/src\s*=\s*"([^"]*)"/i.exec(imgAttrs) || [])[1] || '';
    const alt = (/alt\s*=\s*"([^"]*)"/i.exec(imgAttrs) || [])[1] || '';
    if (!src || !href) return whole;
    return `[![${alt}](${src})](${href})`;
  });
}

export function badgeSourceToHtml(html: string): string {
  if (!html || !html.includes('[![')) return html;
  return html.replace(
    /\[!\[([^\]\n]*)\]\(([^)\s]+)\)\]\(([^)\s]+)\)/g,
    (whole, alt: string, src: string, href: string) => {
      if (!src || !href) return whole;
      return `<a href="${href}"><img src="${src}" alt="${alt}"></a>`;
    }
  );
}