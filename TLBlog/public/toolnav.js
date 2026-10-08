/*!
 * /toolnav.js —— 工具网页顶部的导航栏（由 /tools/... 那条路由自动注入，不用改工具自己的 HTML）
 *
 * ⚠️ 控制台里有一份**完全相同**的副本（my-blog-manager/public/toolnav.js）：
 *    前台和控制台是两次独立部署，共用不了同一个静态文件，所以改这个文件时记得两边一起改。
 *
 * 电脑（≥1024px）：
 *   · 顶部一条，**默认收起**（整条藏在屏幕外），鼠标贴到屏幕顶部才从上往下展开；
 *   · 左边是 logo（= 站点标题 + 连接符 + 「工具」），点它回网站首页，悬停变主题色；
 *   · 右边是全站导航项（和网站上的导航栏同一份数据）；不含"切换主题"按钮（工具页不需要）。
 * 手机（<1024px）：
 *   · 不要那条，只留右上角一个固定按钮，**自己占一条空白行**（给 body 加 padding-top），
 *     所以不会盖住工具内容；点按钮展开一个小面板，里面是同样的导航项。
 * 主题色：
 *   · theme = 'auto'（默认）→ 量页面背景的明暗自动决定，并**监听页面自身的变化**，
 *     所以像"时间计算器"那种自带主题切换按钮的页面，一切换导航栏就跟着变；
 *   · theme = 'dark' / 'light' → 固定深色 / 固定浅色；
 *   · opaque = 'solid' → 不透明；'trans' → 半透明；'auto' → 浅色不透明、深色半透明；
 *   · theme = 'hidden' → 这个工具不要导航栏。
 *   （控制台里那 6 个预设就是这两项的组合，见 app/tools/ToolsAdmin.tsx）
 */
(function () {
  'use strict';

  var CFG = window.__TOOLNAV__ || {};
  var THEME = CFG.theme || 'auto';
  if (THEME === 'hidden') return;

  var LINKS = CFG.links || [];
  var HOME = CFG.home || '/';
  var NAV_TITLE = CFG.navTitle || '';
  var NAV_SUFFIX = CFG.navSuffix || 'の';
  var AFTER = CFG.after || '工具';
  var OPAQUE = CFG.opaque || 'auto';   // auto=浅色不透明/深色半透明 · solid=都不透明 · trans=都半透明
  var MOBILE_PAD = 54;              // 手机那条按钮行的高度（px）
  var EDGE = 8;                     // 鼠标进到距顶部这么多像素内就展开（px）
  var STAY = 10;                    // 展开后，鼠标离条底边超过这么多像素才准备收起（px）

  var mqMobile = window.matchMedia('(max-width: 1023px)');
  var root = null;                  // 桌面那条 / 手机那行 + 抽屉，都挂在它里面
  var bar = null;                   // 桌面条
  var panel = null;                 // 手机右侧抽屉
  var mask = null;                  // 抽屉背后的遮罩
  var collapsed = true;
  var hideTimer = null;

  /* ------------------------------------------------------------------ 样式 */
  function injectStyle() {
    if (document.getElementById('toolnav-style')) return;

    // 先把站内那套**自托管宋体**挂上：和网站用的是同一个字体文件、同一个 400~900 字重范围。
    // 不挂的话，导航栏会继承各个工具网页自己的 font-family —— 三个页面三种字体、粗细还不一样 ✗
    // （这个 css 就是 app/noto-serif-sc.css 的副本，放在 public 下让工具页也能直接加载）
    if (!document.getElementById('toolnav-font')) {
      var fontCss = document.createElement('link');
      fontCss.id = 'toolnav-font';
      fontCss.rel = 'stylesheet';
      fontCss.href = '/toolnav-font.css';
      document.head.appendChild(fontCss);
    }

    var css = [
      /* 字体：和网站同一套（自托管思源宋体），后面跟常见宋体兜底。
         加 !important 是为了不被工具网页自己的样式盖掉（那些页面里常有
         `a{font-weight:400}` 之类的全局规则，不挡的话选项卡会变细 ✗）。 */
      '.toolnav{--tn-font:"Noto Serif SC","Source Han Serif SC","Songti SC","SimSun",serif;}',
      '.toolnav,.toolnav *{font-family:var(--tn-font) !important;}',
      '.toolnav{--tn-bg:rgba(255,255,255,.62);--tn-fg:#1e293b;--tn-fg-dim:#64748b;--tn-border:rgba(15,23,42,.08);--tn-accent:#6366f1;',
      /* 🟪 选项卡下面那个色块（和站内导航栏**同款**）：
             浅色 → 选中深紫 indigo-500 / 悬停浅紫 indigo-400
             深色 → **对调**（选中浅紫 400 / 悬停深紫 500）：浅紫压在深色导航栏上才看得清 ✓ */
      '--tn-block:#6366f1;--tn-block-hover:#818cf8;}',
      '.toolnav[data-theme="dark"]{--tn-bg:rgba(15,23,42,.55);--tn-fg:#e2e8f0;--tn-fg-dim:#94a3b8;--tn-border:rgba(255,255,255,.10);--tn-accent:#818cf8;',
      '--tn-block:#818cf8;--tn-block-hover:#6366f1;}',
      /* 不透明档：浅色 = 纯白，深色 = 实底（配上毛玻璃就是标准导航栏观感） */
      '.toolnav.tn-opaque[data-theme="light"]{--tn-bg:#ffffff;}',
      '.toolnav.tn-opaque[data-theme="dark"]{--tn-bg:#0f172a;}',
      '.toolnav,.toolnav *{box-sizing:border-box;}',
      /* 📱 手机上点按钮/链接时闪的那一下蓝色半透明遮罩（tap highlight）：
         站点在这一层统一干掉，**每个工具网页不用自己再处理一遍**。
         它是**继承属性**，写在 html 上整页生效（连下面那些工具自己的按钮也一起管了）；
         再补一条 `html *` 兜底，防止个别内核不按继承算 —— 代价也就是一条通配选择器。 */
      'html{-webkit-tap-highlight-color:transparent;}',
      'html *{-webkit-tap-highlight-color:transparent;}',
      /* 🖱️ 除输入框外，别处别出现文本光标（I 型）：输入框照常 I 型、链接/按钮照常手型。
         **只动 cursor，不碰 user-select** —— 工具页里选中文字、复制照常能用。
         工具自己的 CSS 里若有 cursor-* 类（比如拖拽条的 col-resize）优先级更高，不受影响。 */
      'html{cursor:default;}',
      'html body *{cursor:default;}',
      'html body a,html body button,html body [role="button"],html body label,html body summary,html body select{cursor:pointer;}',
      'html body input,html body textarea,html body [contenteditable="true"]{cursor:text;}',
      'html body input[type="checkbox"],html body input[type="radio"],html body input[type="range"],html body input[type="color"],html body input[type="file"]{cursor:pointer;}',
      /* 桌面：整条固定在最上面（满宽的半透明底），**里面再套一层和网站一模一样的居中容器**：
         w-96% / max-w-1600px / mx-auto / 高 64px / 两侧 30px 内边距。
         网站导航栏就是这个几何，以前我这条是满宽 + 18px 边距，所以字的位置对不上 ✗
         🎞️ 可打断：**只切 class、位移交给 transition** ——
            鼠标快速离开顶部又快速回来时，如果那条还没收完，浏览器会从"当前这一帧的位置"
            直接折返回去（不是先收完再重新展开），这就是要的打断效果。 */
      '.tn-bar{position:fixed;left:0;right:0;top:0;z-index:9998;background:var(--tn-bg);',
      'border-bottom:1px solid var(--tn-border);',
      '-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);will-change:transform;',
      'transition:transform .34s cubic-bezier(.22,1.22,.36,1),background .25s ease;}',
      '.tn-bar.tn-collapsed{transform:translateY(-100%);',
      'transition:transform .24s cubic-bezier(.4,0,.6,1),background .25s ease;}',
      /* 和网站 `w-[96%] max-w-[1600px] mx-auto h-16 … px-[30px]` 对齐 */
      '.tn-bar-inner{width:96%;max-width:1600px;margin:0 auto;height:64px;display:flex;align-items:center;',
      'justify-content:space-between;gap:16px;padding:0 30px;box-sizing:border-box;}',
      /* 鼠标贴顶的感应：以前是个铺满顶部 46px 的隐形元素（.tn-zone），
         但它**会挡住点击** —— 工具页顶部那一行全在它范围里，鼠标过去既展开导航栏又点不动东西。
         现在改成监听整页 mousemove 判断位置（见 onPointerMove），不占任何元素，永远不会挡点击。 */
      '.tn-logo{font-weight:900 !important;letter-spacing:-.02em;text-decoration:none;white-space:nowrap;font-size:20px;',
      'color:var(--tn-fg);transition:color .25s ease;}',
      '.tn-logo:hover{color:var(--tn-accent);}',
      '.tn-logo .tn-suffix{color:var(--tn-accent);margin:0 5px;}',
      /* 选项卡：字体族/字重和 logo 一致（900），字号基准 16px、当前栏目那一个 16.3px。
         三处导航栏（前台 Navbar / 控制台 Navbar / 这里）同一组数字。 */
      '.tn-links{display:flex;align-items:center;gap:12px;margin-left:auto;overflow-x:auto;white-space:nowrap;}',
      '.tn-links::-webkit-scrollbar{display:none;}',
      '.tn-links a{position:relative;text-decoration:none;font-weight:900 !important;font-size:16px;color:var(--tn-fg-dim);',
      'transition:color .25s ease;padding:2px 0;}',
      '@media (min-width:1280px){.tn-links{gap:20px;}}',
      '@media (min-width:1536px){.tn-links{gap:24px;}}',
      /* ⚠️ 悬停**不改文字颜色** ✗ —— 悬停只负责把下面那个色块揭开 ✓
            未选中弱化 = --tn-fg-dim（浅色 slate-500 / 深色 slate-400 ）
            选中        = --tn-fg（正文那个强度）→ 一强一弱，当前栏目一眼看出来 ✓
            —— 和站内导航栏同一条规矩："深色别那么白、浅色别那么黑" ✓ */
      '.tn-links a.tn-active{font-size:16.3px;color:var(--tn-fg);}',
      /* 🟪 选项卡下面那个色块（和站内导航栏**同一套**）：
            结构：<a> → .tn-lbl（inline-block + relative）→ 里面装 .tn-blk（色块）+ .tn-txt（文字）
              · 色块挂在**文字那一层**上 → 它的左右 = **文字宽度**（不是整条选项卡的宽度 ✓）
                底边 = **文字底边**（不是带 2px 内边距的整框 ✓）——和站内那个内层 span 的 bottom:0 等价 ✓
              · 高 0.5em = 文字高度的一半 ✓ 垫在**文字下层** ✓
              · bottom 写 -.1em：在文字底边的基础上再**往下压一点点**（用户要求"稍微往下偏移一点"）✓
                以后想让它再低/再高，就调这个 -.1em ✓
            揭开：clip-path 从**左往右像进度条** ✓（不是 scaleX 拉伸 ✗ 那会把字也拉变形）
            曲线 = **慢 → 快 → 慢**（两头紧、中间一把扫过去），收尾比起手**略快一丢丢** ✓
                0.28s cubic-bezier(.55, 0, .5, 1) —— 和站内 lib/motion.ts 的 EASE_WIPE **同值** ✓
                两头慢各只占 ~15% 的时间，中间 31% 的时间走掉 57% 的行程 → 快、但不线性 ✓
                ⚠️ 原来是 cubic-bezier(.23,1,.32,1)（快起步 → 慢收尾，进度条那种），节奏正好相反 ✗
            ⚠️ 文字那层必须是 position:relative，否则色块会画到文字**上面**把字盖住 ✗ */
      '.tn-lbl{position:relative;display:inline-block;}',
      '.tn-blk{position:absolute;left:0;right:0;bottom:-.1em;height:.5em;background:var(--tn-block);',
      'clip-path:inset(0 100% 0 0);transition:clip-path .28s cubic-bezier(.55,0,.5,1);pointer-events:none;}',
      '.tn-txt{position:relative;}',
      /* 悬停 → 浅紫（触摸设备不触发 ✓ 和站内一样只在真悬停的设备上生效 ✓） */
      '@media (hover:hover){.tn-links a:hover .tn-blk{clip-path:inset(0 0% 0 0);background:var(--tn-block-hover);}}',
      /* 选中 → 常驻。写在悬停**后面**：悬停一个已选中的选项卡时保持选中色（和站内 active 优先一致）✓ */
      '.tn-links a.tn-active .tn-blk{clip-path:inset(0 0% 0 0);background:var(--tn-block);}',
      /* 手机：一行空白 + 右上角按钮 */
      '.tn-mobilebar{position:fixed;left:0;right:0;top:0;height:' + MOBILE_PAD + 'px;z-index:9998;display:flex;',
      'align-items:center;justify-content:flex-end;padding:0 12px;background:var(--tn-bg);',
      'border-bottom:1px solid var(--tn-border);-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);}',
      '.tn-mobilebar button{display:flex;align-items:center;gap:6px;border:1px solid var(--tn-border);',
      'background:transparent;color:var(--tn-fg);font-weight:800 !important;font-size:12.5px;padding:6px 12px;border-radius:12px;',
      'cursor:pointer;font-family:inherit;}',
      '.tn-mobilebar button:active{transform:scale(.96);}',
      '.tn-mobilebar svg{width:16px;height:16px;}',
      /* 手机抽屉：**从右往左滑出**，宽度 = 屏幕的 1/3 —— 和网站那个手机导航抽屉一模一样。
         🎞️ 可打断：只切 class、位移交给 transition，连点两下会从当前位置折返，不会卡住。 */
      '.tn-panel{position:fixed;right:0;top:' + MOBILE_PAD + 'px;bottom:0;width:33.333%;z-index:9998;',
      'display:flex;flex-direction:column;gap:4px;padding:12px;overflow-y:auto;',
      'background:var(--tn-bg);border-left:1px solid var(--tn-border);border-top-left-radius:24px;',
      '-webkit-backdrop-filter:blur(16px);backdrop-filter:blur(16px);',
      'box-shadow:-10px 0 34px rgba(0,0,0,.18);',
      'transform:translateX(100%);opacity:0;',
      'transition:transform .3s cubic-bezier(.34,1.28,.64,1),opacity .2s ease;}',
      '.tn-panel.tn-open{transform:translateX(0);opacity:1;}',
      '.tn-panel a{display:block;text-decoration:none;font-weight:800 !important;font-size:14px;line-height:1.2;',
      'color:var(--tn-fg-dim);padding:10px 12px;border-radius:12px;',
      'transition:background .2s ease,color .2s ease;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
      '.tn-panel a:hover{background:rgba(127,127,127,.12);}',
      /* ⚠️ 选中**不再是"整块紫底 + 白字"** ✗（那等于把文字颜色也改了 ✗）——
             和站内手机抽屉保持一致：文字下层一个 0.5em 的色块，选中时常驻 ✓ 文字颜色不动 ✓ */
      '.tn-panel a.tn-active{color:var(--tn-fg);}',
      '.tn-panel a.tn-active .tn-blk{clip-path:inset(0 0% 0 0);}',
      /* 抽屉背后的遮罩（网站那个也有）：点它收起 */
      '.tn-mask{position:fixed;left:0;right:0;bottom:0;top:' + MOBILE_PAD + 'px;z-index:9997;',
      'background:rgba(15,23,42,.5);-webkit-backdrop-filter:blur(2px);backdrop-filter:blur(2px);',
      'opacity:0;pointer-events:none;transition:opacity .2s ease;}',
      '.tn-mask.tn-open{opacity:1;pointer-events:auto;}',
      /* 手机给 body 让出一条空白行：工具内容从那行下面开始，不会被盖住 */
      'body.tn-has-mobilebar{padding-top:' + MOBILE_PAD + 'px !important;}',
      /* ⚠️ 两套 UI 必须按屏幕宽度互斥，否则电脑上会同时出现"顶部条"和"手机按钮行" */
      '@media (min-width:1024px){.tn-mobilebar,.tn-panel,.tn-mask{display:none !important;}}',
      '@media (max-width:1023.98px){.tn-bar{display:none !important;}}',
    ].join('');
    var st = document.createElement('style');
    st.id = 'toolnav-style';
    st.textContent = css;
    document.head.appendChild(st);
  }

  /* ------------------------------------------------------------ 主题探测 */
  /**
   * 从一段 CSS 颜色文本里把所有颜色抠出来（#rgb / #rrggbb / #rrggbbaa / rgb() / rgba()）。
   * 为什么要它：不少工具页把主题背景写成 **渐变**，比如
   *     body            { background: linear-gradient(135deg,#f5f7fa,#e4e7eb) }
   *     body.dark-theme { background: linear-gradient(135deg,#121212,#0a0a0a) }
   * 这种页面 `backgroundColor` 是"透明"的，只读背景色永远判断不出来 ✗
   * （时间计算器就是这么写的，踩过这个坑）。
   */
  function parseColors(s) {
    var out = [];
    if (!s) return out;
    var hex = s.match(/#[0-9a-fA-F]{3,8}/g) || [];
    for (var i = 0; i < hex.length; i++) {
      var v = hex[i].slice(1);
      if (v.length === 3 || v.length === 4) {
        v = v.split('').map(function (c) { return c + c; }).join('');
      }
      if (v.length >= 6) {
        out.push([
          parseInt(v.slice(0, 2), 16),
          parseInt(v.slice(2, 4), 16),
          parseInt(v.slice(4, 6), 16),
          v.length >= 8 ? parseInt(v.slice(6, 8), 16) / 255 : 1,
        ]);
      }
    }
    var rgb = s.match(/rgba?\([^)]*\)/g) || [];
    for (var j = 0; j < rgb.length; j++) {
      var p = rgb[j].replace(/rgba?\(|\)/g, '').split(',').map(function (x) { return parseFloat(x); });
      if (p.length >= 3 && !isNaN(p[0])) out.push([p[0], p[1], p[2], p.length > 3 ? p[3] : 1]);
    }
    return out;
  }

  /** 一组颜色的平均明度（太透明的跳过）；全透明/空 → null */
  function avgLuminance(colors) {
    var sum = 0, n = 0;
    for (var i = 0; i < colors.length; i++) {
      var c = colors[i];
      if (!(c[3] > 0.4)) continue;
      sum += (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255;
      n++;
    }
    return n ? sum / n : null;
  }

  /** 单个元素上的明暗证据：先背景色，再背景图（渐变） */
  function luminanceOf(el) {
    if (!el) return null;
    var cs;
    try { cs = window.getComputedStyle(el); } catch (e) { return null; }

    var lum = avgLuminance(parseColors(cs.backgroundColor || ''));
    if (lum !== null) return lum;

    // 背景图：渐变里的颜色平均一下（纯图片 url(...) 抠不出颜色，会返回 null → 交给下一层）
    return avgLuminance(parseColors(cs.backgroundImage || ''));
  }

  /**
   * 页面上有没有**显式的**主题标记：
   *   <html class="dark"> / <body class="dark-theme"> / data-theme="dark" / color-scheme: dark …
   * 这是最可靠的信号 —— 时间计算器就是往 body 上加 `dark-theme` 这个 class。
   */
  function explicitTheme() {
    var DARK_CLS = /(^|[\s_-])dark([\s_-]|$)|dark-?(theme|mode)|theme-dark/i;
    var LIGHT_CLS = /(^|[\s_-])light([\s_-]|$)|light-?(theme|mode)|theme-light/i;
    var ATTRS = ['data-theme', 'data-mode', 'data-color-mode', 'data-bs-theme', 'data-scheme', 'data-dark'];

    var els = [document.documentElement, document.body];
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (!el) continue;

      for (var j = 0; j < ATTRS.length; j++) {
        var v = '';
        try { v = el.getAttribute ? (el.getAttribute(ATTRS[j]) || '') : ''; } catch (e) {}
        if (/dark|true/i.test(v)) return 'dark';
        if (/light|false/i.test(v)) return 'light';
      }

      var cls = el.className;
      if (cls && typeof cls === 'object' && cls.baseVal !== undefined) cls = cls.baseVal;   // SVG 那种
      cls = ' ' + (cls || '') + ' ';
      if (DARK_CLS.test(cls)) return 'dark';
      if (LIGHT_CLS.test(cls)) return 'light';
    }

    try {
      var scheme = window.getComputedStyle(document.documentElement).colorScheme || '';
      if (/dark/i.test(scheme)) return 'dark';
      if (/light/i.test(scheme)) return 'light';
    } catch (e) {}

    return null;
  }

  function detectTheme() {
    if (THEME === 'dark') return 'dark';
    if (THEME === 'light') return 'light';

    // ① 显式标记（class / data-* / color-scheme）—— 最准，页面一切换就变
    var explicit = explicitTheme();
    if (explicit) return explicit;

    // ② 背景色 / 背景渐变：body → html → 页面正中间那个元素往上找
    var lum = luminanceOf(document.body);
    if (lum === null) lum = luminanceOf(document.documentElement);
    if (lum === null) {
      var el = null;
      try {
        el = document.elementFromPoint(Math.round(window.innerWidth / 2), Math.round(window.innerHeight / 2));
      } catch (e) {}
      var guard = 0;
      while (el && lum === null && guard++ < 40) {
        lum = luminanceOf(el);
        el = el.parentElement;
      }
    }

    // ③ 最后一招：看文字颜色反过来推（浅色字 → 深色主题）
    if (lum === null) {
      var txt = '';
      try { txt = window.getComputedStyle(document.body || document.documentElement).color || ''; } catch (e) {}
      var tl = avgLuminance(parseColors(txt));
      if (tl !== null) lum = 1 - tl;
    }

    return (lum === null || lum > 0.55) ? 'light' : 'dark';
  }

  function applyTheme() {
    if (!root) return;
    var t = detectTheme();
    if (root.getAttribute('data-theme') !== t) root.setAttribute('data-theme', t);
    // opaque：solid=不透明、trans=半透明、auto=浅色不透明 / 深色半透明
    var solid = OPAQUE === 'solid' ? true : (OPAQUE === 'trans' ? false : t === 'light');
    root.classList.toggle('tn-opaque', solid);
  }

  /* ------------------------------------------------------------ 构建 DOM */
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function isActive(href) {
    var p = location.pathname;
    if (href === '/') return p === '/';
    return p === href || p.indexOf(href + '/') === 0;
  }

  function buildLinks(container) {
    LINKS.forEach(function (l) {
      var a = el('a', isActive(l.href) ? 'tn-active' : '');
      a.href = l.href;
      /* 选项卡 = 「色块 + 文字」两层（和站内导航栏**同一套结构**）：
           ⚠️ 文字必须单独包一层 position:relative —— 色块是绝对定位的，
              不包的话它会画到文字**上面**把字盖住 ✗（绝对定位的盒子在行内文字之后绘制）
           外层 .tn-lbl 是 inline-block：色块的左右边界 = **文字宽度**，而不是整条选项卡的宽度 ✓ */
      var lbl = el('span', 'tn-lbl');
      lbl.appendChild(el('span', 'tn-blk'));
      lbl.appendChild(el('span', 'tn-txt', l.name));
      a.appendChild(lbl);
      container.appendChild(a);
    });
  }

  function buildLogo() {
    var a = el('a', 'tn-logo');
    a.href = HOME;
    a.appendChild(el('span', '', NAV_TITLE));
    a.appendChild(el('span', 'tn-suffix', NAV_SUFFIX));
    a.appendChild(el('span', '', AFTER));
    return a;
  }

  function build() {
    root = el('div', 'toolnav');
    root.setAttribute('data-theme', 'light');

    // —— 桌面条：外层是满宽半透明底，内层是**和网站一样的居中容器** ——
    bar = el('div', 'tn-bar tn-collapsed');
    var barInner = el('div', 'tn-bar-inner');
    barInner.appendChild(buildLogo());
    var links = el('div', 'tn-links');
    buildLinks(links);
    barInner.appendChild(links);
    bar.appendChild(barInner);

    // —— 手机上那行按钮 + 面板 ——
    var mobileBar = el('div', 'tn-mobilebar');
    var btn = el('button');
    btn.type = 'button';
    // 按钮上的字：当前栏目（和网站手机端那个按钮一个意思，没有就写"菜单"）
    var currentName = '菜单';
    for (var li = 0; li < LINKS.length; li++) {
      if (isActive(LINKS[li].href)) { currentName = LINKS[li].name; break; }
    }
    // 图标用 innerHTML 塞、文字用 appendChild 建 —— 不依赖 querySelector（离线自检也能跑）
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h16M4 12h16M4 18h16"/></svg>';
    btn.appendChild(el('span', '', currentName));
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      togglePanel();
    });
    mobileBar.appendChild(btn);

    // 右侧抽屉 + 它背后的遮罩（和网站那个手机导航抽屉同一套做法）
    panel = el('div', 'tn-panel');
    buildLinks(panel);

    mask = el('div', 'tn-mask');
    mask.addEventListener('click', function () { togglePanel(false); });

    bar.addEventListener('mouseenter', expand);
    bar.addEventListener('mouseleave', scheduleCollapse);

    // ⚠️ 以前这里有个铺满屏幕顶部 46px 的隐形感应区（.tn-zone）：它**会挡住点击** ——
    //    工具页顶部那一整行（标签页/按钮）都在它范围里，鼠标过去既展开导航栏又点不到东西；
    //    而且 46px 太高，常常"还没贴到顶边"就弹出来了。
    //    现在改成监听整页 mousemove 判断鼠标位置：不占任何元素，所以永远不会挡点击。
    if (document.addEventListener) {
      document.addEventListener('mousemove', onPointerMove, { passive: true });
    }

    root.appendChild(bar);
    root.appendChild(mobileBar);
    root.appendChild(panel);
    root.appendChild(mask);
    document.body.appendChild(root);

    // 点抽屉以外的地方收起来
    document.addEventListener('click', function (e) {
      if (panel && panel.classList.contains('tn-open') && !root.contains(e.target)) togglePanel(false);
    });

    applyTheme();
    syncMode();
    watchTheme();
  }

  /* ------------------------------------------------------------ 展开 / 收起 */
  /**
   * 靠鼠标位置判断（替代以前那个会挡点击的隐形感应区）：
   *   · 贴到顶边 EDGE 像素以内 → 展开；
   *   · 展开状态下鼠标跑到条的下面（超过条高 + STAY）→ 开始计时收起。
   */
  function onPointerMove(e) {
    if (mqMobile.matches) return;                 // 手机上那条是按钮行，不需要贴顶展开
    if (e.clientY <= EDGE) { expand(); return; }
    if (collapsed) return;
    var h = (bar && bar.offsetHeight) || 64;
    if (e.clientY > h + STAY && !hideTimer) scheduleCollapse();
  }

  /** 展开：清掉待收起的定时器；如果正在收起途中，这一步会让它从当前位置直接折返 */
  function expand() {
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
    if (!bar || !collapsed) return;
    collapsed = false;
    bar.classList.remove('tn-collapsed');
  }

  function collapse() {
    if (!bar || collapsed) return;
    collapsed = true;
    bar.classList.add('tn-collapsed');
  }

  /** 离开顶部后给一点点缓冲（200ms），顺着顶边挪动时不会一闪一闪；
      缓冲期内再碰到顶部/那条 → expand() 把定时器清掉，等于"取消收起"。 */
  function scheduleCollapse() {
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(collapse, 200);
  }

  /* ------------------------------------------------------------ 手机抽屉开关 */
  /** 开 / 关手机抽屉（遮罩跟着一起）。不传参数就是切换，传 false 强制收起 */
  function togglePanel(open) {
    if (!panel) return;
    var want = open === undefined ? !panel.classList.contains('tn-open') : !!open;
    panel.classList.toggle('tn-open', want);
    if (mask) mask.classList.toggle('tn-open', want);
  }

  /* ------------------------------------------------------------ 电脑/手机切换 */
  function syncMode() {
    var mobile = mqMobile.matches;
    if (bar) bar.style.display = mobile ? 'none' : 'flex';
    document.body.classList.toggle('tn-has-mobilebar', mobile);
    if (!mobile) togglePanel(false);      // 切到电脑宽度时把抽屉收掉
  }

  /* ------------------------------------------------------------ 主题变化监听 */
  function watchTheme() {
    if (THEME !== 'auto') return;

    // ① 页面自己改 class/style（比如那条主题切换按钮）→ MutationObserver 立刻跟上
    var mo = new MutationObserver(function () { applyTheme(); });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style', 'data-theme'] });
    if (document.body) {
      mo.observe(document.body, { attributes: true, attributeFilter: ['class', 'style', 'data-theme'] });
    }

    // ② 兜底：有些页面用 CSS 变量/inline 样式换肤，观察不到就走轮询（很轻，只读背景色）
    setInterval(applyTheme, 1200);

    // ③ 切到别的窗口/显示模式也可能影响，跟着调一次
    window.addEventListener('focus', applyTheme);
  }

  /* ------------------------------------------------------------ 启动 */
  function start() {
    injectStyle();
    build();
    window.addEventListener('resize', function () { syncMode(); applyTheme(); });
    if (mqMobile.addEventListener) mqMobile.addEventListener('change', function () { syncMode(); applyTheme(); });
    else if (mqMobile.addListener) mqMobile.addListener(function () { syncMode(); applyTheme(); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
