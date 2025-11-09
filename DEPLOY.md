# Lucky-pool 部署指引（Vercel + Render/Railway）

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