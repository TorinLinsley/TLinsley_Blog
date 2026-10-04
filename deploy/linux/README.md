# Linux 部署说明（Ubuntu 22.04）

你这套的用法：

```
Ubuntu 22.04 桌面虚拟机（改内容 / 改代码，能开控制台窗口）
        │  rsync + ssh（upload-to-server.sh）
        ▼
正式服务器（Ubuntu 22.04，无桌面，只跑博客前台）
```

Windows 那台不再参与 —— 虚拟机里就是完整的开发环境（控制台 + 博客前台都在同一台机器，
控制台的 autosync / 图片上传 / 部署配置全都按本机路径工作，跨机器同步的问题直接不存在）。

---

## 一、虚拟机：装环境（一次）

```bash
cd <项目根目录>/deploy/linux      # 这个目录里同时有 my-blog-manager 和 TLBlog 的上一级
bash setup-vm.sh                  # 项目根目录不在 ~ 下时：bash setup-vm.sh /path/to/root
```

`setup-vm.sh` 会做：

| 步骤 | 内容 |
|---|---|
| 系统依赖 | `python3-pip / xclip / rsync / git`（xclip 给控制台「复制」按钮用；控制台是网页模式，不再需要 WebKitGTK 那套窗口依赖） |
| Node | 装 Node 22（Next 16 要求 ≥ 20.9） |
| Python 依赖 | `pip install -r my-blog-manager/requirements.txt`（清华源） |
| 前端依赖 | 两个项目各 `npm ci`（npmmirror 源），**不构建** —— 开发用 `npm run dev` 就够 |
| 配置 | 把 `my-blog-manager/data/deploy_config.json` 的 `blogPath` 指向本机 `TLBlog` |
| 桌面图标 | 桌面上放一个「TLinsleyBlog 控制台」快捷方式 |

装完起控制台：

```bash
bash deploy/linux/start-console.sh      # 或者双击桌面图标
```

控制台现在是**网页模式**：起后端（FastAPI / uvicorn 7646）+ 前端（Next dev 3010），
然后浏览器打开 http://127.0.0.1:3010 就能用（编辑、保存、同步、图片上传都在）。

和 Windows 的 `Start-Console.bat`、项目根目录的 `Start-Console.sh` 是同一套逻辑 ——
**不再有 pywebview 桌面窗口**（`launcher.py` / `run_me.py` / `window_config.json` 都删了），
`requirements.txt` 里也不再需要 pywebview。

---

## 二、正式服务器：装环境（一次）

把项目（至少 `deploy/linux/` 整个目录）传到服务器，然后：

```bash
sudo bash setup-server.sh
```

它会：装 Node 22 / nginx / rsync → 建 `blog` 用户和 `/srv/www/tlblog` → 装
`/srv/www/rebuild-if-needed.sh` → 装 `tlblog.service`（`next start`，监听 3000）
→ 配 nginx 反代。之后按提示：

1. 安全组/防火墙放行 80（要 HTTPS 就再放 443）；
2. nginx 里 `server_name` 改成你的域名，`sudo certbot --nginx -d 域名`；
3. 在虚拟机上 `ssh-copy-id -i ~/.ssh/id_ed25519.pub blog@<服务器IP>`（一次）。

---

## 三、日常：改完 → 一键上传

在虚拟机上：

```bash
cp deploy/linux/server.env.example deploy/linux/server.env
vi deploy/linux/server.env          # 填 SERVER_SSH / SSH_KEY / REMOTE_DIR
bash deploy/linux/upload-to-server.sh            # 同步 + 按需重建
bash deploy/linux/upload-to-server.sh --dry-run  # 只看要传什么
FORCE_BUILD=1 bash deploy/linux/upload-to-server.sh   # 强制重建
```

`upload-to-server.sh` 干两件事：

1. `rsync -az --delete`（排除 `node_modules` / `.next` / `.git`）把 `TLBlog/` 同步到服务器；
2. ssh 过去跑 `/srv/www/rebuild-if-needed.sh`：

| 这次改了什么 | 服务器行为 |
|---|---|
| 只有 `posts/` `chatters/` `moments/` `resources/` `public/uploads/` | **不重建**。这些页面是 `force-dynamic`，请求时直接读磁盘，文件一到就生效 |
| 代码 / 样式 / `data/*.ts` / `siteConfig.ts` / `package.json` | `npm ci` + `npm run build` + `systemctl restart tlblog` |

判断依据是「代码类文件的 md5 指纹」，存在 `$WORK/.code-hash`，构建成功后才更新；
构建失败不会写指纹，下次还会重试。

---

## 五、HTTPS（香港服务器不用备案，直接签）

前提：域名的 A 记录已经指向服务器公网 IP（`dig +short blog.torinlinsley.top` 能看到那个 IP），安全组放行 **80 + 443**。

```bash
# 在服务器上
sudo DOMAIN=blog.torinlinsley.top EMAIL=你的邮箱 bash ~/linux/setup-https.sh
# 想连裸域名一起签：
sudo DOMAIN=blog.torinlinsley.top DOMAIN2=torinlinsley.top EMAIL=你的邮箱 bash ~/linux/setup-https.sh
```

脚本会：装 certbot → 核对解析 → 把 nginx 的 `server_name` 改成域名 → 签证书 → **自动加 301，让 http 永久跳到 https** → 打印续期定时器状态。

```bash
curl -I http://blog.torinlinsley.top     # 期望 301 → https
curl -I https://blog.torinlinsley.top    # 期望 200
sudo certbot renew --dry-run             # 演练续期
```

HSTS（可选，**确认 https 稳定之后**再开）：在 `/etc/nginx/sites-available/tlblog.conf` 里加

```nginx
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
```

> ⚠️ HSTS 一旦下发，浏览器一年内强制 https（子域名也得有证书），别急着开。

**不需要**再靠应用层跳转：项目里的 `TLBlog/proxy.ts` 是旧的 Windows 拓扑（Next 占 80、nginx 占 443）留下的第二道保险；新拓扑是 nginx 管 80/443、Next 只听 127.0.0.1:3000，nginx 的 301 就够了。留着也不冲突（它认 `X-Forwarded-Proto`），想少一层变量就 `mv proxy.ts proxy.ts.disabled`。

---

## 六、把控制台也放到服务器（通过 SSH 隧道用）

这样改内容就不用再"上传"了 —— 控制台直接写服务器上的前台目录（`force-dynamic` 页面刷新即见）。

```bash
# ① 虚拟机 → 服务器：第一次连内容一起传
bash deploy/linux/upload-console-to-server.sh --with-content
# 以后只传代码（不动服务器上的内容/配置）
bash deploy/linux/upload-console-to-server.sh

# ② 服务器：装控制台（Python 依赖 + 构建 + 两个 systemd 服务，都只监听 127.0.0.1）
sudo bash ~/linux/setup-console-server.sh

# ③ 你自己电脑上开隧道，然后浏览器访问
ssh -L 3010:127.0.0.1:3010 -L 7646:127.0.0.1:7646 <服务器用户>@<服务器IP>
# 浏览器打开 http://127.0.0.1:3010
```

| 改了什么 | 服务器上要做什么 |
|---|---|
| 文章 / 杂谈 / 说说 / 资源 / 图片 | 什么都不用，刷新即见 |
| 前台代码 / 样式 / `siteConfig.ts` | `sudo bash /srv/www/rebuild-if-needed.sh tlblog` |
| 控制台自己的代码 | `sudo bash /srv/www/rebuild-console.sh` |

⚠️ 控制台**没有登录**，所以两个服务都只监听 `127.0.0.1`，只走 SSH 隧道。**不要**把 3010/7646 开到公网。

---

## 七、常用排错

```bash
# 服务状态 / 日志
systemctl status tlblog
journalctl -u tlblog -n 100 -f

# 手动重建
FORCE_BUILD=1 sudo -E bash /srv/www/rebuild-if-needed.sh tlblog

# nginx
sudo nginx -t && sudo systemctl reload nginx

# 本机直连（绕过 nginx）
curl -I http://127.0.0.1:3000
```

- **端口/防火墙**：Next 只监听 `127.0.0.1:3000`，对外由 nginx 负责；云服务器记得开安全组。
- **图片**：`public/uploads/*` 会跟着 rsync 一起过去（rsync 增量传输，改一张只传一张）；
  它们不需要重建就能访问。
- **不要**把 `node_modules` / `.next` 传到服务器：服务器自己 `npm ci` + `build`。

---

## 八、文件清单

| 文件 | 在哪跑 | 作用 |
|---|---|---|
| `Start-Blog.bat` / `Start-Blog.sh` | 本机（**项目根目录**） | 起博客前台：指纹比对 → 变了才 `npm run build` → `next start`（默认 3000） |
| `Start-Console.bat` / `Start-Console.sh` | 本机（**项目根目录**） | 起控制台（网页模式：后端 7646 + 前端 3010，自动开浏览器） |
| `scripts/code-hash.mjs` | 本机 | 算代码指纹，判断要不要重建（口径和 `rebuild-if-needed.sh` 一致） |
| `setup-vm.sh` | 虚拟机 | 一次装好控制台 + 博客前台环境 |
| `start-console-web.sh` | 虚拟机 | 起控制台（浏览器模式，端口固定 3010/7646） |
| `server.env.example` | 虚拟机 | 上传脚本配置模板 → 复制成 `server.env` |
| `upload-to-server.sh` | 虚拟机 | 同步**前台**到服务器（rsync + 按需重建） |
| `upload-console-to-server.sh` | 虚拟机 | 同步**控制台**到服务器 |
| `setup-server.sh` | 服务器 | 一次装好前台运行环境（Node/nginx/服务/重建脚本） |
| `rebuild-if-needed.sh` | 服务器 | 前台：指纹比对 → 决定要不要 build + 重启 |
| `setup-https.sh` | 服务器 | 签 Let's Encrypt 证书 + http 301 跳 https |
| `setup-console-server.sh` | 服务器 | 装控制台（Python 依赖 + 构建 + 两个服务） |
| `rebuild-console.sh` | 服务器 | 控制台：依赖变了才 npm ci，然后 build + 重启 |
| `tlblog.service` | 服务器 | 前台 systemd 单元（`next start`，127.0.0.1:3000） |
| `xhconsole-api.service` | 服务器 | 控制台后端（uvicorn 127.0.0.1:7646） |
| `xhconsole-web.service` | 服务器 | 控制台前端（next start 127.0.0.1:3010） |
| `nginx-tlblog.conf` | 服务器 | 反向代理（certbot 会往里加 443 和 301） |
