/**
 * 🎨 全站唯一的「语法着色语言表」—— 所有渲染管线都从这里取，别各写一份。
 *
 * 为什么要有这个文件：
 *   以前每条渲染管线各写一个 `subset: [...]`（14 门语言），编辑器（本项目的
 *   RichTextEditor 里的 CODE_LANGUAGES）用的却是另外 26 门。于是 `powershell`
 *   （还有 dockerfile / dos / matlab / nginx）在编辑器里正常着色，到了控制台预览、
 *   资源分享页、杂谈页就**一片白** —— 用户看到的就是「同一个代码块，编辑器有颜色、
 *   别的地方没有」✗
 *   （顺便：那个 subset 只在 detect:true 时才起作用，我们 detect:false，它等于没写。）
 *
 * 现在：
 *   lowlight 的 common（37 门，含 shell / kotlin / swift 这些老文章可能用到的）
 *   + 编辑器那 5 门 common 里没有的（powershell / dockerfile / dos / matlab / nginx）。
 *   编辑器在浏览器里、渲染在 Node 里，用的都是同一份 highlight.js 语言定义 →
 *   同一个代码块在任何地方颜色都一样 ✓
 *
 * ⚠️ 绝不能用 lowlight 的 `all`（384 门 / 约 1.5 MB），会把首屏拖死。
 * ⚠️ 往编辑器里加语言时，记得也在这里补一条，否则那个语言还是只有编辑器能着色。
 */
import { common } from 'lowlight';
import dockerfile from 'highlight.js/lib/languages/dockerfile';
import dos from 'highlight.js/lib/languages/dos';
import matlab from 'highlight.js/lib/languages/matlab';
import nginx from 'highlight.js/lib/languages/nginx';
import powershell from 'highlight.js/lib/languages/powershell';

export const hljsLanguages = {
  ...common,
  dockerfile,
  dos,
  matlab,
  nginx,
  powershell,
};
