# Lucky-pool 部署指引（Nginx/PM2 或 Vercel + Render/Railway）

> 目标：让手机钱包（OKX / Binance / MetaMask）直接访问。要求：公网、HTTPS、统一域名资源。

## 一、准备

- 一个可用域名，如 `luckypool.example.com`（可选，Vercel/Render 自带二级域也行）。
- Git 仓库（本仓库）。

## 二、前端部署到 Vercel

1. 绑定 GitHub/GitLab 仓库，导入项目。
2. Vercel 会读取仓库根目录 `vercel.json`，自动以 `frontend` 作为构建源，命令为 `npm run build`，产物目录 `dist`。
3. 在 Vercel 项目里设置环境变量（Production + Preview）：
   - `VITE_BACKEND_URL=https://<你的后端域名或 Render/Railway 服务 URL>`
4. 部署完成后，访问 `https://<vercel-域名>` 验证首页加载正常。

> SPA 路由已在 `vercel.json` 中处理，所有路径回退到 `/index.html`。

## 三、后端部署到 Render 或 Railway

两者皆可，流程类似。这里以 Render 为例：

1. 新建 Web Service，选择仓库根目录，Service Root 指向 `backend`。
2. Build Command：`npm i && npm run build`
3. Start Command：`npm start`
4. 环境变量：
   - `PORT`：Render 会注入（无需手动设），请保留默认。
   - `BASE_URL=https://<你的后端外网域名>`（用于生成文件外链与自动迁移）
   - `UPLOAD_DIR`（可选，默认 `uploads`）
   - `METADATA_DIR`（可选，默认 `metadata`）
   - `LOG_DIR`（可选，默认 `logs`）
   - 若启用 HTTPS 证书文件启动（通常不需要，因为 Render/反代已有 HTTPS），可配置 `HTTPS_PORT` 与证书路径。
5. 首次启动后，后端会：
   - 确保 `/meta/index.json` 存在；
   - 将 index 与 metadata JSON 中仍指向内网/localhost 的 URL 自动重写为 `BASE_URL` 同路径；
   - 提供静态路径：`/uploads/*`、`/meta/*`。

> 注意：Render 免费实例磁盘可能是临时的。若要持久存储，请为服务挂载 Persistent Disk，或改用对象存储（S3/OSS）。也可以把图片与 metadata 迁移至 IPFS，减少后端职责。

## 四、前端与后端对齐

- 在 Vercel 中将 `VITE_BACKEND_URL` 配置为后端公网地址（Render/Railway 分配的 https 域名或自定义域）。
- 确保后端 `BASE_URL` 与对外实际访问地址一致（包含 https 协议与域）。
- 所有资源均经由 HTTPS 访问，避免 Mixed Content 与手机钱包的安全限制。

## 五、手机钱包测试

1. 在 OKX / Binance 钱包的 DApp 浏览器输入你的 Vercel 域名。
2. 首屏应显示活动卡片，图片加载正常。
3. 连接钱包，执行一次参与或退款验证交易流程。

## 六、常见问题

- 图片不显示：检查 metadata/index 中是否仍有 `http://192.168.*` 或 `http://localhost`，重新部署后端触发迁移；或清浏览器缓存再试。
- 429 限流：已将限流仅作用于 `/api`，静态资源不受限。如仍遇到，调大 `max` 或引入 CDN 缓存。
- Mixed Content：确保 `VITE_BACKEND_URL` 与 `BASE_URL` 都是 `https://`，且图片与 JSON 路径不再引用 `http://`。
- Render/Railway 域名变动：记得同步更新 Vercel 的 `VITE_BACKEND_URL`。

## 七、可选增强

- 将上传与元数据改为 IPFS（Web3.Storage/Pinata），事件中直接写 `ipfs://CID`，逐步去后端化。
- 为后端增加对象存储适配（S3/OSS），替换本地磁盘。
- Nginx/Caddy 统一前后端为同域（降低跨源复杂度）。

---

完成以上配置后，你就可以在手机钱包中直接访问并看到图片了。如需我代为创建 Render/Railway 服务与 Vercel 项目，请提供要使用的域名与选择的平台账号权限。

---

## 附：Nginx + PM2 一机部署（推荐：同域反代）

适用于你已有一台 Linux 服务器（Debian/Ubuntu/CentOS），Nginx 作为前端反向代理与静态托管，Node.js 后端通过 PM2 常驻。

### 1. 服务器准备

```bash
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt-get install -y nodejs nginx
sudo npm i -g pm2
```

目录约定（可按需调整）：

- 后端：`/opt/lucky/backend`
- 前端用户站点：`/var/www/lucky-frontend`（`frontend/dist` 同步到此）
- 管理端：`/var/www/lucky-admin`（`admin/dist` 同步到此）

### 2. 构建并上传产物

在本地执行：

```powershell
Push-Location "e:\Lucky-pool\backend"; cmd /c npm run build; Pop-Location
Push-Location "e:\Lucky-pool\frontend"; cmd /c npm run build; Pop-Location
Push-Location "e:\Lucky-pool\admin"; cmd /c npm run build; Pop-Location
```

将以下目录/文件上传至服务器：

- `backend/dist`、`backend/package.json`、`backend/ecosystem.config.js`
- `backend/uploads`、`backend/metadata`、`backend/logs`（首次可为空，但需授予写权限）
- `frontend/dist` → `/var/www/lucky-frontend`
- `admin/dist` → `/var/www/lucky-admin`

### 3. 后端启动（PM2）

```bash
mkdir -p /opt/lucky/backend /opt/lucky/data/uploads /opt/lucky/data/metadata /opt/lucky/data/logs
cd /opt/lucky/backend
# 将本地打包好的 backend/dist 与 package.json 同步到此
npm i --only=prod

export PORT=4000
# 如果通过同域反代（见下），将 BASE_URL 设为前端域名，如 https://app.example.com
export BASE_URL="https://app.example.com"
export UPLOAD_DIR="/opt/lucky/data/uploads"
export METADATA_DIR="/opt/lucky/data/metadata"
export LOG_DIR="/opt/lucky/data/logs"
# 可选：保护写接口
export API_KEY="<强口令>"

pm2 start dist/index.js --name lucky-backend --update-env
pm2 save
```

说明：若你选择将 `/meta` 与 `/uploads` 也通过 Nginx 反代到后端，则 `BASE_URL` 必须等于用户实际访问的“前端域名”（例如 `https://app.example.com`），这样后端在生成元数据 URI 时会写入该公开域名，避免跨域与混合内容问题。

### 4. Nginx 配置（两种方案）

方案 A（同域，推荐简单稳定）：前端与后端统一使用 `app.example.com`，Nginx 反代 `/api`、`/meta`、`/uploads` 到后端。

```nginx
server {
   listen 80;
   server_name app.example.com;
   # 如有证书，建议配合 443 与 HTTP/2，这里省略证书段

   root /var/www/lucky-frontend;
   index index.html;
   location / {
      try_files $uri /index.html;
   }

   # Admin 控制台（可用二级路径或独立子域）
   location /admin/ {
      alias /var/www/lucky-admin/;
      try_files $uri $uri/ /index.html;
   }

   # 反代后端 API 与动态静态资源
   location /api/ {
      proxy_pass http://127.0.0.1:4000/api/;
      proxy_set_header Host $host;
      proxy_set_header X-Real-IP $remote_addr;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Proto $scheme;
   }
   location /meta/ {
      proxy_pass http://127.0.0.1:4000/meta/;
      add_header Cache-Control "no-store" always;
   }
   location /uploads/ {
      proxy_pass http://127.0.0.1:4000/uploads/;
      expires 365d;
      add_header Cache-Control "public, immutable";
   }
}
```

方案 B（前后端分域）：前端 `app.example.com`，后端 `api.example.com`。此时：

- 后端 `BASE_URL` 设为 `https://api.example.com`
- 前端/管理端 `.env.production` 中的 `VITE_BACKEND_URL=https://api.example.com`
- Nginx：一个站点托管前端；另一个站点反代后端（`/` 全交给 Node）。

后端站点示例：

```nginx
server {
   listen 80;
   server_name api.example.com;
   location / {
      proxy_pass http://127.0.0.1:4000/;
      proxy_set_header Host $host;
      proxy_set_header X-Real-IP $remote_addr;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Proto $scheme;
   }
}
```

### 5. 权限与备份

```bash
sudo chown -R www-data:www-data /opt/lucky/data
sudo find /opt/lucky/data -type d -exec chmod 755 {} \;
sudo find /opt/lucky/data -type f -exec chmod 644 {} \;
```

建议：每晚 `cron` 打包 `/opt/lucky/data/metadata` 与 `/opt/lucky/data/uploads`，并将 `/opt/lucky/data/logs` 同步到对象存储或外部磁盘。

### 6. 回归检查清单

- 前端首页加载、图片与标题正常（别名文件 `/meta/<pool>.json` 命中）
- 管理端“扫描/自动修复别名”成功返回
- 参与/退款/开奖交互提示与 BscScan 链接可用
- 获奖横幅展示期数与地址
- 聊天登录签名、发送与 10 秒轮询正常
- 透明度页聚合数值显示且随日志更新

### 7. 常用命令

```bash
# PM2
pm2 list
pm2 logs lucky-backend --lines 200
pm2 restart lucky-backend

# Nginx
sudo nginx -t && sudo systemctl reload nginx

# 手动触发别名扫描
curl -H "x-api-key: <API_KEY>" "https://app.example.com/api/meta/scan?repair=1"
```