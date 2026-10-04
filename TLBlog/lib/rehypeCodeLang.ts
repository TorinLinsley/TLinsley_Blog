// lib/rehypeCodeLang.ts
//
// 在 rehype-highlight **之前**运行：把「作者在 ``` 后面显式写的语言」记到
// data-cc-lang，没写语言的代码块打上 data-cc-detected 标记。
//
// 为什么需要它：渲染管线里开了 detect: true，highlight 会给**没写语言**的代码块
// 也自动猜一个语言并塞进 class="language-xxx"。前端只看 class 就分不清「作者写的」
// 和「猜出来的」，复制按钮会把猜出来的语言（比如把普通文本猜成 CSS）当成语言名显示。
//
// 这个插件只加 data-* 属性，不改 class、不改结构，所以现有配色/排版完全不受影响。

type HastNode = {
  type?: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
};

// 这些等于「没指定语言」，不当语言名显示
const IGNORED = new Set(['none', 'nohighlight', 'plain', 'plaintext', 'text', 'txt', 'null', 'undefined']);

export default function rehypeCodeLang() {
  return (tree: HastNode) => {
    const walk = (node: HastNode, insidePre: boolean) => {
      if (!node || typeof node !== 'object') return;

      let childInsidePre = insidePre;

      if (node.type === 'element') {
        if (node.tagName === 'pre') childInsidePre = true;

        if (insidePre && node.tagName === 'code') {
          const properties = node.properties ?? (node.properties = {});
          const classes = Array.isArray(properties.className) ? properties.className : [];
          const explicit = classes
            .map((value) => String(value))
            .find((name) => name.startsWith('language-') && !IGNORED.has(name.slice(9).toLowerCase()));

          if (explicit) {
            const raw = explicit.slice(9);
            properties['data-cc-lang'] = raw;

            // ⚠️ hljs 的语言名是**小写且大小写敏感**的。编辑器里选「HTML」时，写进围栏的
            //    可能是 `HTML`，remark 就生成 `language-HTML` —— hljs 匹配不上，
            //    整个代码块一点高亮都没有（但标签还显示「HTML」，因为那是这个原值）。
            //    这里把 class 统一成小写（只动这一个 class，显示仍用上面的原值）。
            const lower = raw.toLowerCase();
            if (lower !== raw) {
              properties.className = [
                ...classes.filter((value) => String(value) !== explicit),
                `language-${lower}`,
              ];
            }
          } else {
            properties['data-cc-detected'] = '1';
          }
        }
      }

      if (Array.isArray(node.children)) {
        node.children.forEach((child) => walk(child, childInsidePre));
      }
    };

    walk(tree, false);
  };
}
