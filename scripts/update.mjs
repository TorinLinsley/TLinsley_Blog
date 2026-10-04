#!/usr/bin/env node
/**
 * 🔄 无损更新器 —— 更新到仓库最新版，**尽量既拿到新东西、又保住你自己的修改**。
 *
 * 每个文件都会三方比较：
 *
 *     base  = 你上次更新时拿到的原版（存在 .update-baseline/ 里）
 *     mine  = 你本地现在的文件
 *     theirs= 新版里的文件
 *
 *   · mine == theirs        → 已经是最新，跳过
 *   · mine == base          → 你没动过 → 直接用新版覆盖 ✓
 *   · mine != base, theirs == base → 只有你改了、上游没动 → 保持原样 ✓
 *   · mine != base, theirs != base → **双方都改了** → 三方合并 ✓
 *        合并干净 → 直接写入（新改动 + 你的改动都在）✓
 *        真冲突   → 保留你的文件，另外写一份 `<文件名>.merge` 让你手动挑 ✓
 *        （没有 git 或没有 base → 保留你的，另一个版本写成 `<文件名>.new` ✓）
 *
 * 另外：内容（文章/说说/杂谈/资源/工具/图片）、站点配置、data/*.ts、本机配置、node_modules
 * **永远不碰** ✓；覆盖前还会把旧文件备份进 .update-backup-<时间戳>/ ✓
 *
 * 用法：
 *   node scripts/update.mjs                  # 从 GitHub 更新
 *   node scripts/update.mjs --dry-run        # 只预览，不改文件
 *   node scripts/update.mjs --from <目录>     # 从本地目录更新（离线 / 自测）
 *   node scripts/update.mjs --repo 用户/仓库 --branch main
 *   node scripts/update.mjs --write-manifest # 维护者：发布前刷新 .update-manifest.json
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

/** 你的仓库（分叉出去就改这里，或用 --repo 传） */
let REPO = 'TorinLinsley/TLinsley_Blog';
let BRANCH = 'main';

const MANIFEST_NAME = '.update-manifest.json';
const BASELINE_DIR = '.update-baseline';

// ───────────────────────── 永远不碰的东西 ─────────────────────────

/**
 * 任何一层目录叫这些名字就整体跳过。
 * ⚠️ 必须按"路径里的段"判断，不能只判根目录 —— 子项目里的
 *    `TLBlog/node_modules`、`my-blog-manager/.next` 同样要排除 ✗
 */
const NEVER_SEGMENTS = new Set(['node_modules', '.next', '.git']);

/** 目录前缀：内容、运行时数据（相对仓库根） */
const NEVER_DIRS = [
  'TLBlog/posts',
  'TLBlog/chatters',
  'TLBlog/moments',
  'TLBlog/resources',
  'TLBlog/tools',
  'TLBlog/public/uploads',
  'my-blog-manager/posts',
  'my-blog-manager/chatters',
  'my-blog-manager/moments',
  'my-blog-manager/resources',
  'my-blog-manager/manager_data',
];

/** 精确路径：用户配置 / 密钥 / 本机相关 */
const NEVER_FILES = new Set([
  'TLBlog/siteConfig.ts',
  'TLBlog/app/about/about.md',
  'TLBlog/data/albums.ts',
  'TLBlog/data/friends.ts',
  'TLBlog/data/projects.ts',
  'TLBlog/data/music-config.json',
  'TLBlog/data/comments-config.json',
  'TLBlog/data/deploy_config.json',
  'my-blog-manager/siteConfig.ts',
  'my-blog-manager/data/albums.ts',
  'my-blog-manager/data/friends.ts',
  'my-blog-manager/data/projects.ts',
  'my-blog-manager/data/music-config.json',
  'my-blog-manager/data/comments-config.json',
  'my-blog-manager/data/deploy_config.json',
  'my-blog-manager/public/backend_config.json',
  'deploy/windows/server.env',
  'deploy/linux/server.env',
  '.code-hash',
  '.lock-hash',
]);

const MIRROR_MAX_BYTES = 1024 * 1024; // base 镜像只留 1MB 以内的文件（大文件走 .new 兜底）

const rel = (p) => p.split(path.sep).join('/');
const log = (...a) => console.log(...a);

function isNever(r) {
  if (r === MANIFEST_NAME || r.startsWith(BASELINE_DIR)) return true;
  if (r.startsWith('.update-backup-')) return true;
  if (r.endsWith('.merge') || r.endsWith('.new')) return true;
  if (NEVER_FILES.has(r)) return true;
  if (r.split('/').some((seg) => NEVER_SEGMENTS.has(seg))) return true;
  return NEVER_DIRS.some((d) => r === d || r.startsWith(d + '/'));
}

// ───────────────────────── 基础工具 ─────────────────────────

/**
 * 算文件指纹。
 *
 * ⚠️ 文本文件先把 CRLF 归一成 LF 再算 —— 否则 Windows 上 `core.autocrlf=true`
 *    会把工作区文件换成 CRLF，而仓库/压缩包里是 LF，指纹**永远对不上**，
 *    更新器就会误以为"每个文件你都改过"，什么都不更新 ✗
 */
function fileHash(file) {
  const buf = fs.readFileSync(file);
  const isText = !buf.includes(0);
  const data = isText ? Buffer.from(buf.toString('utf8').replace(/\r\n/g, '\n'), 'utf8') : buf;
  return crypto.createHash('sha256').update(data).digest('hex');
}

function listUpdatable(root) {
  const out = [];
  (function walk(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      const r = rel(path.relative(root, full));
      if (isNever(r)) continue;
      if (e.isDirectory()) walk(full);
      else out.push(r);
    }
  })(root);
  return out.sort();
}

function readManifest(root) {
  try {
    const m = JSON.parse(fs.readFileSync(path.join(root, MANIFEST_NAME), 'utf8'));
    return m && typeof m.files === 'object' ? m : null;
  } catch {
    return null;
  }
}

function writeManifest(root) {
  const files = {};
  for (const r of listUpdatable(root)) files[r] = fileHash(path.join(root, r));
  const body = { generated: new Date().toISOString(), repo: `${REPO}@${BRANCH}`, files };
  fs.writeFileSync(path.join(root, MANIFEST_NAME), JSON.stringify(body, null, 2) + '\n', 'utf8');
  return Object.keys(files).length;
}

/** 把一份源码里"可更新"的文件镜像成 base，供下次合并用 */
function refreshBaseline(root, srcRoot) {
  const dir = path.join(root, BASELINE_DIR);
  fs.rmSync(dir, { recursive: true, force: true });
  let n = 0;
  for (const r of listUpdatable(srcRoot)) {
    const f = path.join(srcRoot, r);
    if (fs.statSync(f).size > MIRROR_MAX_BYTES) continue;
    const dst = path.join(dir, r);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(f, dst);
    n += 1;
  }
  return n;
}

let _git = null;
function hasGit() {
  if (_git === null) {
    try {
      execFileSync('git', ['--version'], { stdio: 'ignore' });
      _git = true;
    } catch {
      _git = false;
    }
  }
  return _git;
}

/**
 * 三方合并：mine + base + theirs → mine
 * 返回 'clean'（干净合并）| 'conflict'（有冲突，结果写进 <file>.merge）| null（做不了）
 *
 * ⚠️ 三个输入先归一成 LF（Windows 工作区可能是 CRLF，不归一的话 git 会认为"整篇都改了"✗）
 */
function mergeFile(mineFile, baseFile, theirsFile) {
  if (!hasGit() || !fs.existsSync(baseFile)) return null;

  const asLf = (src, dst) => {
    const buf = fs.readFileSync(src);
    const text = buf.includes(0) ? null : buf.toString('utf8').replace(/\r\n/g, '\n');
    fs.writeFileSync(dst, text === null ? buf : Buffer.from(text, 'utf8'));
  };

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tlblog-merge-'));
  const tmpMine = path.join(tmpDir, 'mine');
  const tmpBase = path.join(tmpDir, 'base');
  const tmpTheirs = path.join(tmpDir, 'theirs');
  asLf(mineFile, tmpMine);
  asLf(baseFile, tmpBase);
  asLf(theirsFile, tmpTheirs);

  let conflicts = 0;
  try {
    execFileSync('git', ['merge-file', '-q', tmpMine, tmpBase, tmpTheirs], { stdio: 'ignore' });
  } catch (e) {
    conflicts = typeof e.status === 'number' ? e.status : 1;
  }

  if (conflicts === 0) {
    fs.copyFileSync(tmpMine, mineFile); // 合并结果落到正式文件（LF）
    fs.rmSync(tmpDir, { recursive: true, force: true });
    return 'clean';
  }
  // 有冲突：带冲突标记的结果另存为 <文件>.merge，正式文件保持你的版本不动
  fs.copyFileSync(tmpMine, mineFile + '.merge');
  fs.rmSync(tmpDir, { recursive: true, force: true });
  return 'conflict';
}

// ───────────────────────── 拿新版源码 ─────────────────────────

function downloadSource() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tlblog-update-'));
  const tgz = path.join(tmp, 'src.tar.gz');
  const url = `https://codeload.github.com/${REPO}/tar.gz/refs/heads/${BRANCH}`;

  log(`>>> 下载：${url}`);
  try {
    execFileSync('curl', ['-L', '--fail', '--retry', '3', '--connect-timeout', '20', '-o', tgz, url], {
      stdio: 'inherit',
    });
  } catch {
    throw new Error(
      '下载失败 ✗ —— 国内直连 GitHub 容易断，可以开代理/VPN 再试；\n' +
        '    也可以手动下载仓库压缩包，解压后：node scripts/update.mjs --from <解压出来的目录>'
    );
  }

  const unpack = path.join(tmp, 'src');
  fs.mkdirSync(unpack, { recursive: true });
  log('>>> 解压...');
  execFileSync('tar', ['-xzf', tgz, '-C', unpack], { stdio: 'inherit' });

  const top = fs.readdirSync(unpack).filter((n) => fs.statSync(path.join(unpack, n)).isDirectory());
  if (top.length !== 1) throw new Error(`压缩包结构不对，顶层有 ${top.length} 个目录 ✗`);
  return { root: path.join(unpack, top[0]), cleanup: () => fs.rmSync(tmp, { recursive: true, force: true }) };
}

// ───────────────────────── 参数 ─────────────────────────

const argv = process.argv.slice(2);
const opt = (name) => {
  const i = argv.indexOf(name);
  return i === -1 ? null : argv[i + 1] ?? '';
};
const has = (name) => argv.includes(name);

if (has('--help') || has('-h')) {
  log(`
🔄 无损更新器

  node scripts/update.mjs                   从 GitHub 更新到最新版
  node scripts/update.mjs --dry-run         只预览，不改文件
  node scripts/update.mjs --from <目录>      从本地目录更新（离线用）
  node scripts/update.mjs --repo 用户/仓库    指定仓库（默认 ${REPO}）
  node scripts/update.mjs --branch main     指定分支
  node scripts/update.mjs --root <目录>      指定项目目录（默认脚本上一级）
  node scripts/update.mjs --write-manifest  维护者用：刷新 .update-manifest.json

内容 / 站点配置 / data/*.ts / 本机配置 / node_modules 永不覆盖；
你自己改过的代码会做三方合并 —— 合得上就合，合不上留 <文件>.merge 给你挑 ✓
`);
  process.exit(0);
}

if (opt('--repo')) REPO = opt('--repo');
if (opt('--branch')) BRANCH = opt('--branch');

const ROOT = path.resolve(opt('--root') || path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));
const dryRun = has('--dry-run');

if (has('--write-manifest')) {
  const n = writeManifest(ROOT);
  log(`✅ 已写入 ${MANIFEST_NAME}（${n} 个文件）—— 记得提交它 ✓`);
  process.exit(0);
}

log('\n🔄 TLinsleyBlog 无损更新\n');
log(`   项目目录：${ROOT}`);

// 1) 新版从哪来
const from = opt('--from');
let src;
if (from) {
  const abs = path.resolve(from);
  if (!fs.existsSync(path.join(abs, 'TLBlog')) && !fs.existsSync(path.join(abs, 'my-blog-manager'))) {
    log(`❌ ${abs} 不像本项目（没有 TLBlog / my-blog-manager）`);
    process.exit(1);
  }
  src = { root: abs, cleanup: () => {} };
  log(`   新版来源：本地目录 ${abs}`);
} else {
  src = downloadSource();
}

const manifest = readManifest(ROOT);
const baseDir = path.join(ROOT, BASELINE_DIR);
const hasBaseline = fs.existsSync(baseDir);

if (!manifest || !hasBaseline) {
  log('\n⚠️  没有基线（.update-manifest.json / .update-baseline 缺一个）');
  log('   → 判断不了哪些文件是你改过的：会**先备份再覆盖**，');
  log('     你自己改过的地方如果被覆盖，可以从 .update-backup-<时间戳>/ 里找回 ✓\n');
}

// 2) 逐文件决定
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const backupDir = path.join(ROOT, `.update-backup-${stamp}`);

const added = [];
const updated = [];
const same = [];
const onlyMine = []; // 只有你改了，上游没动
const merged = []; // 双方都改，自动合并成功
const conflicted = []; // 双方都改，冲突了（留 .merge）
const keptMine = []; // 双方都改，但没法合并（留 .new）

for (const r of listUpdatable(src.root)) {
  const srcFile = path.join(src.root, r);
  const dstFile = path.join(ROOT, r);
  const newHash = fileHash(srcFile);

  if (!fs.existsSync(dstFile)) {
    added.push(r);
    if (!dryRun) {
      fs.mkdirSync(path.dirname(dstFile), { recursive: true });
      fs.copyFileSync(srcFile, dstFile);
    }
    continue;
  }

  const localHash = fileHash(dstFile);
  if (localHash === newHash) {
    same.push(r);
    continue;
  }

  const baseHash = manifest?.files?.[r];
  const localTouched = baseHash ? localHash !== baseHash : false;
  const upstreamTouched = baseHash ? newHash !== baseHash : true;

  // 你改过、上游没动 → 保持原样
  if (localTouched && !upstreamTouched) {
    onlyMine.push(r);
    continue;
  }

  // 双方都改了 → 尝试三方合并
  if (localTouched && upstreamTouched) {
    if (dryRun) {
      merged.push(r);
      continue;
    }
    const res = mergeFile(dstFile, path.join(baseDir, r), srcFile);
    if (res === 'clean') {
      merged.push(r);
      continue;
    }
    if (res === 'conflict') {
      conflicted.push(r);
      continue;
    }
    // 没 git / 没 base → 保留本地，新版另存 .new
    fs.copyFileSync(srcFile, dstFile + '.new');
    keptMine.push(r);
    continue;
  }

  // 走 here：上游改了、你这边==base（或没基线）→ 覆盖
  updated.push(r);
  if (!dryRun) {
    const bak = path.join(backupDir, r);
    fs.mkdirSync(path.dirname(bak), { recursive: true });
    fs.copyFileSync(dstFile, bak);
    fs.copyFileSync(srcFile, dstFile);
  }
}

// 3) 刷新基线 + 清单
if (!dryRun) {
  const srcManifest = path.join(src.root, MANIFEST_NAME);
  if (fs.existsSync(srcManifest)) fs.copyFileSync(srcManifest, path.join(ROOT, MANIFEST_NAME));
  else writeManifest(ROOT);
  const n = refreshBaseline(ROOT, src.root);
  log(`\n   基线已刷新（${n} 个文件）`);
}

// 4) 报告
log('');
log(`  新增文件        ${added.length}`);
log(`  覆盖更新        ${updated.length}`);
log(`  已经是最新      ${same.length}`);
log(`  你改过·上游未动  ${onlyMine.length}`);
log(`  ${dryRun ? '双方都改了·要合并' : '自动合并成功  '}  ${merged.length}`);

if (merged.length) {
  log('\n  ✅ 这些文件双方都改过，但改动不冲突，已经自动合并（新改动 + 你的改动都在）：');
  merged.slice(0, 15).forEach((r) => log(`     · ${r}`));
  if (merged.length > 15) log(`     … 还有 ${merged.length - 15} 个`);
}

if (conflicted.length) {
  log('\n  ⚠️ 这些文件双方改到了同一处，**保留了你的版本**，新版合并结果写在同名 .merge 文件里：');
  conflicted.forEach((r) => log(`     · ${r}  →  ${r}.merge`));
  log('     对着 .merge 里的 <<<<<<< 标记挑一下，改完把 .merge 删掉即可 ✓');
}

if (keptMine.length) {
  log('\n  ⚠️ 这些文件你改过、上游也改了，但没能自动合并 —— 保留了你的版本，新版存成 .new：');
  keptMine.forEach((r) => log(`     · ${r}  →  ${r}.new`));
  log('     （装个 git 就能自动三方合并了；或者自己对着 .new 手动挑 ✓）');
}

if (updated.length && !dryRun) {
  log(`\n  被覆盖的旧文件备份在：${rel(path.relative(ROOT, backupDir))}/`);
}

if (dryRun) {
  log('\n（--dry-run：什么都没改 ✓）');
} else {
  log('\n✅ 更新完成 —— 前台/控制台代码变了的话，重跑 Start-Blog / Start-Console 会自动装依赖并重新构建 ✓');
}

src.cleanup();
