/**
 * 🩹 Markdown 小修补：给「中文 + 加粗」这种被 CommonMark 判成非法的写法兜底。
 *
 * 背景（真实踩坑）：
 *   在编辑器里把「65%（」选中加粗，序列化出来就是 `**65%（**`，
 *   而紧跟其后的又是一个汉字。按 CommonMark 的 flanking 规则，这个闭合的 `**`
 *   前面是标点、后面是字母 → **不能当闭合符**，于是 remark 原样吐出 `**`，
 *   页面上就成了「我明明没打星号，怎么显示还有星号」。
 *
 *   为什么编辑时看着是好的：控制台的编辑器和预览走的是**后端 python-markdown**，
 *   它更宽松，`**65%（**` 照样渲染成粗体；前台走 remark（严格按 CommonMark）才露馅。
 *   两边引擎对不上，就是这个星号的来源。
 *
 * 修法：把闭合定界符挪到标点前面 ——
 *   `**65%（**根据`  →  `**65%**（根据`
 *   remark 就能正常渲染粗体了。只动这一种形态，其它地方一个字都不碰。
 */
const PUNCT = '[（(【「『《〈“"‘\u2018\u2019，,。；;：:！?？、]';

/**
 * 中间那段**必须是很朴素的文字**：不允许出现任何 markdown 结构字符。
 *
 * ⚠️ 这里踩过一次坑：原来写的是 `[^*_\n]{1,80}?`（只排除星号和下划线），
 *    结果它会**跨过整条链接**去乱配星号 ——
 *      `[**材质包**](url) | 密码：**rp**`（本来就是合法的）
 *    被它改成了 `[**材质包**](url) | 密码**：rp**`（反而坏了，星号直接露出来）。
 *    所以现在把 `[ ] ( ) < > | ` ~ #` 全部排除在外，它就只能在同一小段纯文字里配对。
 */
const PLAIN = '[^*_\\[\\]()<>|`~#\\n]{1,40}?';
const EMPHASIS_BEFORE_CJK = new RegExp(
  '(\\*\\*|__|\\*|_)(' + PLAIN + ')(' + PUNCT + ')(\\1)(?=[\\p{L}\\p{N}])',
  'gu'
);

/** 修掉「闭合 ** 被标点卡住」的写法（可以安全地重复调用） */
export function repairEmphasis(md: string): string {
  let out = String(md || '');
  // 一行里可能有好几处，replace 一次只挪一层，循环到不动为止（最多 10 轮，防死循环）
  for (let i = 0; i < 10; i++) {
    const next = out.replace(EMPHASIS_BEFORE_CJK, '$1$2$4$3');
    if (next === out) break;
    out = next;
  }
  return out;
}

/**
 * 🩹 Markdown 小修补：别让「1.20.1：https://…」被当成有序列表。
 *
 * 背景（真实踩坑）：
 *   正文里写「版本号 + 网址」，比如 `1.20.1：https://example.com/mod`，
 *   行首那个「1.」正好是 CommonMark 的有序列表标记 —— 而且它**不要求标记后面有空格**，
 *   于是整行被解析成 `<ol><li>`：页面上版本号变成了列表序号，后面的网址被拖成列表项。
 *
 *   为什么编辑时看着是好的：控制台的预览走**后端 python-markdown**，
 *   它的列表标记**必须**跟一段空白才算列表，所以 `1.20.1：` 在那边就是普通文字。
 *   又是两个引擎对不上（和上面那个星号是同一类问题）。
 *
 * 修法：行首「数字 + 点 + 非空白」统一转义成 `1\.20.1` —— 渲染出来还是原来那串字符，
 *   只是不再触发列表语法。真正的有序列表（`1. 内容`，点号后面有空白）一个字都不碰；
 *   代码围栏（``` / ~~~）里整段跳过，那里的 1.2.3 是要原样显示的内容。
 */
export function repairListMarkers(md: string): string {
  const FENCE = /^[ \t]{0,3}(`{3,}|~{3,})/;
  let fence = '';
  return String(md || '')
    .split('\n')
    .map((line) => {
      const hit = line.match(FENCE);
      if (hit) {
        const ch = hit[1].charAt(0);
        // 同种字符 = 开/关围栏；不同种字符是围栏里的一行，原样留着
        fence = fence === ch ? '' : fence || ch;
        return line;
      }
      if (fence) return line;
      return line.replace(/^(\d{1,9})\.(?=\S)/, '$1\\.');
    })
    .join('\n');
}

/**
 * remark 渲染链路的统一入口（前台各个页面 + 控制台预览都走它）。
 *
 * 顺序：先定列表标记，再修加粗定界符 —— 两者改的位置不重叠，互不干扰。
 */
export function repairMarkdown(md: string): string {
  return repairEmphasis(repairListMarkers(md));
}

/**
 * 纯文本展示用：把 markdown 的**行内标记**去掉，只留下能看的文字。
 *
 * 给「卡片摘要」「灵境里直接显示正文」这类不做 markdown 渲染的地方用 ——
 * 否则 `**加粗**`、`[链接](url)`、`# 标题` 会连着符号一起显示出来。
 * 只去标记、不做任何美化，也不动正文里的空白和换行。
 */
export function stripInlineMarkdown(text: string): string {
  return String(text || '')
    .replace(/```[^\n]*\n?/g, '')                                          // 代码围栏
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')                              // 图片 → alt 文字
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')                               // 链接 → 链接文字
    .replace(/\[\[([^\]|]*)(?:\|([^\]]*))?\]\]/g, (_, a, b) => (b || a))   // Obsidian 双链
    .replace(/`([^`]*)`/g, '$1')                                           // 行内代码
    .replace(/^[ \t]*#{1,6}[ \t]*/gm, '')                                  // 标题 #
    .replace(/^[ \t]*>[ \t]?/gm, '')                                       // 引用 >
    .replace(/^[ \t]*[-*+][ \t]+/gm, '')                                   // 无序列表
    .replace(/^[ \t]*\d+\.[ \t]+/gm, '')                                   // 有序列表
    .replace(/(\*\*|__)([^\n]+?)\1/g, '$2')                                // 粗体标记
    .replace(/\*([^*\n]+?)\*/g, '$1')                                      // *斜体* 标记
    // _斜体_ 只在词边界上处理，免得把 file_name_here 这种吃掉下划线
    .replace(/(?<=^|[\s(（「【])_([^_\n]+?)_(?=$|[\s)）】」，,。.!?！？])/gm, '$1')
    .replace(/~~([^\n]+?)~~/g, '$1')                                       // 删除线标记
    .replace(/\\([\\`*_{}\[\]()#+\-.!>])/g, '$1');                         // 反斜杠转义
}
