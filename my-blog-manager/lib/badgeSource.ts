/**
 * 🏷️ 加载时把「徽章链接」还原成**源码文字**
 *
 * 背景：保存时 `.md` 里存的是 `[![alt](图片)](跳转)` ✓
 * 但加载时后端把它转成 HTML（`<a><img></a>`）✗ 编辑器会把 <img> 当图片节点 ✗ 链接丢掉 ✗
 * → 所以喂给编辑器之前，把"整条 <a> 里只有一张 <img>"的还原成源码 ✓
 * ⚠️ 只处理这一种结构 ✓ 其它 <a>/<img> 一概不动
 */
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