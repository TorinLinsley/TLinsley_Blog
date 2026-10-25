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
  var OPAQUE = CFG.opaque || 'auto';
  var MOBILE_PAD = 54;
  var EDGE = 8;
  var STAY = 10;

  var mqMobile = window.matchMedia('(max-width: 1023px)');
  var root = null;
  var bar = null;
  var panel = null;
  var mask = null;
  var collapsed = true;
  var hideTimer = null;

  function injectStyle() {
    if (document.getElementById('toolnav-style')) return;

    if (!document.getElementById('toolnav-font')) {
      var fontCss = document.createElement('link');
      fontCss.id = 'toolnav-font';
      fontCss.rel = 'stylesheet';
      fontCss.href = '/toolnav-font.css';
      document.head.appendChild(fontCss);
    }

    var css = [
      '.toolnav{--tn-font:"Noto Serif SC","Source Han Serif SC","Songti SC","SimSun",serif;}',
      '.toolnav,.toolnav *{font-family:var(--tn-font) !important;}',
      '.toolnav{--tn-bg:rgba(255,255,255,.62);--tn-fg:#1e293b;--tn-fg-dim:#64748b;--tn-border:rgba(15,23,42,.08);--tn-accent:#6366f1;',
      '--tn-block:#6366f1;--tn-block-hover:#818cf8;}',
      '.toolnav[data-theme="dark"]{--tn-bg:rgba(15,23,42,.55);--tn-fg:#e2e8f0;--tn-fg-dim:#94a3b8;--tn-border:rgba(255,255,255,.10);--tn-accent:#818cf8;',
      '--tn-block:#818cf8;--tn-block-hover:#6366f1;}',
      '.toolnav.tn-opaque[data-theme="light"]{--tn-bg:#ffffff;}',
      '.toolnav.tn-opaque[data-theme="dark"]{--tn-bg:#0f172a;}',
      '.toolnav,.toolnav *{box-sizing:border-box;}',
      'html{-webkit-tap-highlight-color:transparent;}',
      'html *{-webkit-tap-highlight-color:transparent;}',
      'html{cursor:default;}',
      'html body *{cursor:default;}',
      'html body a,html body button,html body [role="button"],html body label,html body summary,html body select{cursor:pointer;}',
      'html body input,html body textarea,html body [contenteditable="true"]{cursor:text;}',
      'html body input[type="checkbox"],html body input[type="radio"],html body input[type="range"],html body input[type="color"],html body input[type="file"]{cursor:pointer;}',
      '.tn-bar{position:fixed;left:0;right:0;top:0;z-index:9998;background:var(--tn-bg);',
      'border-bottom:1px solid var(--tn-border);',
      '-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);will-change:transform;',
      'transition:transform .34s cubic-bezier(.22,1.22,.36,1),background .25s ease;}',
      '.tn-bar.tn-collapsed{transform:translateY(-100%);',
      'transition:transform .24s cubic-bezier(.4,0,.6,1),background .25s ease;}',
      '.tn-bar-inner{width:96%;max-width:1600px;margin:0 auto;height:64px;display:flex;align-items:center;',
      'justify-content:space-between;gap:16px;padding:0 30px;box-sizing:border-box;}',
      '.tn-logo{font-weight:900 !important;letter-spacing:-.02em;text-decoration:none;white-space:nowrap;font-size:20px;',
      'color:var(--tn-fg);transition:color .25s ease;}',
      '.tn-logo:hover{color:var(--tn-accent);}',
      '.tn-logo .tn-suffix{color:var(--tn-accent);margin:0 5px;}',
      '.tn-links{display:flex;align-items:center;gap:12px;margin-left:auto;overflow-x:auto;white-space:nowrap;}',
      '.tn-links::-webkit-scrollbar{display:none;}',
      '.tn-links a{position:relative;text-decoration:none;font-weight:900 !important;font-size:16px;color:var(--tn-fg-dim);',
      'transition:color .25s ease;padding:2px 0;}',
      '@media (min-width:1280px){.tn-links{gap:20px;}}',
      '@media (min-width:1536px){.tn-links{gap:24px;}}',
      '.tn-links a.tn-active{font-size:16.3px;color:var(--tn-fg);}',
      '.tn-lbl{position:relative;display:inline-block;}',
      '.tn-blk{position:absolute;left:0;right:0;bottom:-.1em;height:.5em;background:var(--tn-block);',
      'clip-path:inset(0 100% 0 0);transition:clip-path .32s cubic-bezier(.23,1,.32,1);pointer-events:none;}',
      '.tn-txt{position:relative;}',
      '@media (hover:hover){.tn-links a:hover .tn-blk{clip-path:inset(0 0% 0 0);background:var(--tn-block-hover);}}',
      '.tn-links a.tn-active .tn-blk{clip-path:inset(0 0% 0 0);background:var(--tn-block);}',
      '.tn-mobilebar{position:fixed;left:0;right:0;top:0;height:' + MOBILE_PAD + 'px;z-index:9998;display:flex;',
      'align-items:center;justify-content:flex-end;padding:0 12px;background:var(--tn-bg);',
      'border-bottom:1px solid var(--tn-border);-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);}',
      '.tn-mobilebar button{display:flex;align-items:center;gap:6px;border:1px solid var(--tn-border);',
      'background:transparent;color:var(--tn-fg);font-weight:800 !important;font-size:12.5px;padding:6px 12px;border-radius:12px;',
      'cursor:pointer;font-family:inherit;}',
      '.tn-mobilebar button:active{transform:scale(.96);}',
      '.tn-mobilebar svg{width:16px;height:16px;}',
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
      '.tn-panel a.tn-active{color:var(--tn-fg);}',
      '.tn-panel a.tn-active .tn-blk{clip-path:inset(0 0% 0 0);}',
      '.tn-mask{position:fixed;left:0;right:0;bottom:0;top:' + MOBILE_PAD + 'px;z-index:9997;',
      'background:rgba(15,23,42,.5);-webkit-backdrop-filter:blur(2px);backdrop-filter:blur(2px);',
      'opacity:0;pointer-events:none;transition:opacity .2s ease;}',
      '.tn-mask.tn-open{opacity:1;pointer-events:auto;}',
      'body.tn-has-mobilebar{padding-top:' + MOBILE_PAD + 'px !important;}',
      '@media (min-width:1024px){.tn-mobilebar,.tn-panel,.tn-mask{display:none !important;}}',
      '@media (max-width:1023.98px){.tn-bar{display:none !important;}}',
    ].join('');
    var st = document.createElement('style');
    st.id = 'toolnav-style';
    st.textContent = css;
    document.head.appendChild(st);
  }

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

  function luminanceOf(el) {
    if (!el) return null;
    var cs;
    try { cs = window.getComputedStyle(el); } catch (e) { return null; }

    var lum = avgLuminance(parseColors(cs.backgroundColor || ''));
    if (lum !== null) return lum;

    return avgLuminance(parseColors(cs.backgroundImage || ''));
  }

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
      if (cls && typeof cls === 'object' && cls.baseVal !== undefined) cls = cls.baseVal;
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

    var explicit = explicitTheme();
    if (explicit) return explicit;

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
    var solid = OPAQUE === 'solid';
    root.classList.toggle('tn-opaque', solid);
  }

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

    bar = el('div', 'tn-bar tn-collapsed');
    var barInner = el('div', 'tn-bar-inner');
    barInner.appendChild(buildLogo());
    var links = el('div', 'tn-links');
    buildLinks(links);
    barInner.appendChild(links);
    bar.appendChild(barInner);

    var mobileBar = el('div', 'tn-mobilebar');
    var btn = el('button');
    btn.type = 'button';
    var currentName = '菜单';
    for (var li = 0; li < LINKS.length; li++) {
      if (isActive(LINKS[li].href)) { currentName = LINKS[li].name; break; }
    }
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h16M4 12h16M4 18h16"/></svg>';
    btn.appendChild(el('span', '', currentName));
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      togglePanel();
    });
    mobileBar.appendChild(btn);

    panel = el('div', 'tn-panel');
    buildLinks(panel);

    mask = el('div', 'tn-mask');
    mask.addEventListener('click', function () { togglePanel(false); });

    bar.addEventListener('mouseenter', expand);
    bar.addEventListener('mouseleave', scheduleCollapse);

    if (document.addEventListener) {
      document.addEventListener('mousemove', onPointerMove, { passive: true });
    }

    root.appendChild(bar);
    root.appendChild(mobileBar);
    root.appendChild(panel);
    root.appendChild(mask);
    document.body.appendChild(root);

    document.addEventListener('click', function (e) {
      if (panel && panel.classList.contains('tn-open') && !root.contains(e.target)) togglePanel(false);
    });

    applyTheme();
    syncMode();
    watchTheme();
  }

  function onPointerMove(e) {
    if (mqMobile.matches) return;
    if (e.clientY <= EDGE) { expand(); return; }
    if (collapsed) return;
    var h = (bar && bar.offsetHeight) || 64;
    if (e.clientY > h + STAY && !hideTimer) scheduleCollapse();
  }

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

  function scheduleCollapse() {
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(collapse, 200);
  }

  function togglePanel(open) {
    if (!panel) return;
    var want = open === undefined ? !panel.classList.contains('tn-open') : !!open;
    panel.classList.toggle('tn-open', want);
    if (mask) mask.classList.toggle('tn-open', want);
  }

  function syncMode() {
    var mobile = mqMobile.matches;
    if (bar) bar.style.display = mobile ? 'none' : 'flex';
    document.body.classList.toggle('tn-has-mobilebar', mobile);
    if (!mobile) togglePanel(false);
  }

  function watchTheme() {
    if (THEME !== 'auto') return;

    var mo = new MutationObserver(function () { applyTheme(); });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style', 'data-theme'] });
    if (document.body) {
      mo.observe(document.body, { attributes: true, attributeFilter: ['class', 'style', 'data-theme'] });
    }

    setInterval(applyTheme, 1200);

    window.addEventListener('focus', applyTheme);
  }

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