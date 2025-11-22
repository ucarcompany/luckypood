# Lucky Pool dApp (BSC)

一个建立在 BNB Chain (BSC) 上的 1 美金幸运池去中心化应用：多人参与，达到最小金额后开始倒计时，到达最大金额或倒计时结束即使用 Chainlink VRF v2 开奖。仓库包含：
- 智能合约（Truffle + Hardhat 脚本）
- 用户前端（Vite + React + TS）
- 管理员前端（Vite + React + TS）
- 后端服务（Express + TS）

本页汇总“如何配置、部署与本地开启系统”的完整步骤（Windows PowerShell）。

## 1. 先决条件
- Node.js ≥ 18，npm ≥ 8
- 一个 BSC Testnet 钱包，建议使用 MetaMask（ChainId=97）
- 测试网 tBNB（支付 gas）与测试网 LINK（用于 VRF 订阅）

提示（Windows）：命令用 PowerShell 执行；如遇 `npm` 脚本调用问题，可使用 `npm.cmd`。

## 2. 安装依赖
在仓库根目录执行：

```powershell
npm.cmd install
```

## 3. 配置与部署合约（BSC Testnet）

### 3.1 配置 `contracts/.env`
必填项（示例值请按实际替换）：
- `MNEMONIC`：你的测试钱包助记词（本地使用，切勿泄露）
- `BSC_TESTNET_RPC_URL`：BSC Testnet RPC
- VRF 相关：
	- `VRF_COORDINATOR=0x6A2AAd07396B36Fe02a22b33cf443582f682c82f`
	- `VRF_KEYHASH=0xd4bb89654db74673a187bd804519e65e3f71a52bc55f11da7601a13dcf505314`
	- `VRF_SUBSCRIPTION_ID=<你的订阅ID>`（如果还没有，下一步创建）
	- `LINK_TOKEN_TESTNET=0x84b9B910527Ad5C03A9Ca831909E21e236EA7b06`
	- `LINK_AMOUNT=1.0`（充值脚本默认额度，可调整）
- 稳定币与金库：
	- `STABLECOIN_ADDRESS_TESTNET`：测试网稳定币（或本仓库的 MockERC20）
	- `TREASURY_ADDRESS`：金库/领奖地址（管理员地址）

> 提示：本仓库已包含若干 Hardhat 脚本，辅助创建/充值订阅与添加消费者。

### 3.2（可选）创建 VRF 订阅并记录 subId
如果你还没有订阅，可以使用脚本创建（或使用 Chainlink 官方 VRF 管理界面创建）：

```powershell
npm.cmd run -w contracts vrf:create
```

将输出的 subId 写入 `contracts/.env` 的 `VRF_SUBSCRIPTION_ID`。

### 3.3 给订阅充值 LINK
1) 先确认你的签名者地址有测试网 LINK：

```powershell
npm.cmd run -w contracts link:balance
```

2) 充值订阅（将 `LINK_AMOUNT` LINK 转入 `VRF_COORDINATOR` 并附 subId）：

```powershell
npm.cmd run -w contracts vrf:fund
```

3) 校验订阅余额与消费者：

```powershell
npm.cmd run -w contracts vrf:check
```

> 也可在 Chainlink 官方 VRF 订阅面板直接充值，更直观。

### 3.4 部署合约（包含 Factory）

```powershell
npm.cmd run -w contracts migrate:testnet
```

部署成功后，记录 Factory 合约地址，写入：
- `contracts/.env` 的 `FACTORY_ADDRESS`
- `frontend/.env` 与 `admin/.env` 的 `VITE_FACTORY_ADDRESS`

> 如果你已经部署过 Factory，仅需在前后端 `.env` 内填写现有地址即可。

### 3.5 将“池子”加入 VRF 消费者
VRF 消费者必须是每个“具体池子”合约地址（不是 Factory）。当你通过管理员前端新建了活动池子后，运行：

```powershell
# 批量将所有池子加入订阅的消费者列表
npm.cmd run -w contracts vrf:add-all-pools

# 再次校验订阅状态
npm.cmd run -w contracts vrf:check
```

> 若仅添加单个地址，可先在 `contracts/.env` 设置 `VRF_CONSUMER_ADDRESS=<池子地址>`，再执行 `npm.cmd run -w contracts vrf:add-consumer`。

## 4. 启动后端（Express）
### 4.1 配置 `backend/.env`
可选项（默认值见源码）：
- `PORT=4000`
- `BASE_URL=http://localhost:4000`（用于返回静态资源 URL）
- `API_KEY`（可选，前端调用时会带 `x-api-key`）
- `UPLOAD_DIR`、`METADATA_DIR`（可选）

### 4.2 运行后端

```powershell
cd backend
npm.cmd install
npm.cmd run build
npm.cmd run start   # 或 npm.cmd run dev（热更）
```

后端会提供：
- `POST /api/upload` 上传图片（返回 `url`）
- `POST /api/metadata` 写入元数据 JSON（返回 `uri`）
- 静态资源：`/uploads/*`、`/meta/*`

## 5. 启动管理员前端（创建活动）
### 5.1 配置 `admin/.env`
至少：
- `VITE_FACTORY_ADDRESS=<Factory地址>`
- `VITE_BACKEND_URL=http://localhost:4000`
- `VITE_BACKEND_API_KEY=<如启用后端鉴权则必填>`

### 5.2 运行

```powershell
cd admin
npm.cmd install
npm.cmd run dev
```

浏览器访问 `http://localhost:5174/`，连接 BSC Testnet 钱包：
1) 上传图片 → 得到图片 URL
2) 提交元数据 → 得到 `metadataURI`
3) 在表单里配置 `minFill`、`maxFill`、`metadataURI`、`sortOrder` → 创建活动
4) 运行 `npm.cmd run -w contracts vrf:add-all-pools` 把新池子加入 VRF 消费者

## 6. 启动用户前端（参与/开奖）
### 6.1 配置 `frontend/.env`
- `VITE_FACTORY_ADDRESS=<Factory地址>`
- `VITE_DEFAULT_RPC=<稳定的BSC Testnet RPC>`（用于只读，避免钱包连错链导致读取失败）
- `VITE_VRF_SUB_ID=<订阅ID>`
- `VITE_VRF_COORDINATOR=0x6A2AAd07396B36Fe02a22b33cf443582f682c82f`
- `VITE_PUBLIC_URL=<前端公网URL，用于移动端深链>`（例如 `https://your-app.vercel.app`）
- 可选：`VITE_BACKEND_URL`、`VITE_BACKEND_API_KEY`

### 6.2 运行

```powershell
cd frontend
npm.cmd install
npm.cmd run dev
```

浏览器访问 `http://localhost:5173/`：
- 参与：授权稳定币 → 参与份数（每地址最多 10 次且不超过池子剩余额度）
- 倒计时：达到 `minFill` 后开始，结束或达 `maxFill` 即可开奖
- 开奖：点击“尝试开奖”（VRF 消费者与余额就绪时可成功发起）
- 透明度页：展示 Factory 地址、VRF 订阅余额、各池子是否加入消费者、创建事件列表
- 移动端：页脚提供 MetaMask/OKX 深链（需 `VITE_PUBLIC_URL` 为公网地址）

### 6.3（可选）从仓库根目录一键启动（Workspaces）
无需切换目录，直接在仓库根使用 workspaces：

```powershell
# 后端（http://localhost:4000）
npm.cmd run -w backend build; npm.cmd run -w backend start

# 用户前端（http://localhost:5173）
npm.cmd run -w frontend dev -- --port=5173

# 管理端（http://localhost:5174）
npm.cmd run -w admin dev -- --port=5174
```

提示：如端口占用，可把 `--port=5173` 改为其他端口；如遇 PowerShell 执行策略拦截，优先使用 `npm.cmd`。

## 7. 前端部署（Vercel）
仓库根已提供 `vercel.json`，可直接在 Vercel 导入仓库：
1) New Project → 选择本仓库；
2) Framework：Vite（Vercel 会根据 `vercel.json` 使用 `frontend` 作为构建源）；
3) 配置 Environment Variables（参考第 6.1 节）；
4) Deploy 完成后，将域名填入 `VITE_PUBLIC_URL` 以启用移动端深链；
5) 若你启用后端鉴权，在 Vercel 项目设置里也需要配置对应的变量。

## 8. 常见问题（FAQ）
1) “execution reverted (unknown custom error) (estimateGas) …”
	 - 多见于 VRF 未就绪：池子未加入消费者 或 订阅余额为 0。处理：
		 - 运行 `npm.cmd run -w contracts vrf:add-all-pools`
		 - 运行 `npm.cmd run -w contracts vrf:fund` 给订阅充值，然后 `vrf:check` 验证
2) “读取失败/0x 解码失败”
	 - 请在前端 `.env` 配置 `VITE_DEFAULT_RPC`，并确保钱包切到 BSC Testnet（0x61）。
3) 移动端打不开本地地址
	 - 本地 `localhost` 手机无法访问；请先部署到 Vercel 等公网地址，然后用页脚深链按钮打开。

## 9. 安全与注意
- 合约已采用 OZ 安全组件与 VRF v2；仍建议小额测试与外部审计。
- 管理员拥有暂停与提现权限；请妥善保管私钥。

---
## 10. UI / 实时聊天增强
### 3D 水面
已使用 Three.js + 自生成法线贴图改造 `WaterBackground.tsx`：
- 透视相机（俯视）+ 动态波纹，`triggerRipple(count)` 增强扰动。
- 程序化沙地纹理：可在 `generateSandTexture()` 内替换成你提供的海底沙子图片（放 `frontend/public/assets/` 目录）。
- 自生成 Perlin 法线贴图 `generateWaterNormals()` 提升高光与波形细节。
- 体积雾/光效：点云模拟水下颗粒，配合雾化营造深度层次。如需关闭，删除 point cloud 相关代码以及 `scene.fog`。

### 实时聊天（Socket.io）
后端：在 `backend/src/index.ts` 增加 Socket.io 服务，事件：
- `chat:join { pool }` 进入池房间，返回 `chat:history` 最近消息。
- `chat:send { pool,address,token,message }` 验证签名令牌后广播 `chat:message`。
令牌流程：前端打开聊天时调用 `/api/chat/nonce` → 使用钱包签名标准登录字符串 → `/api/chat/auth` 获取 token。

前端：`FloatingChat.tsx` 已接入：
- 自动拉取历史与实时追加消息。
- 连接钱包后自动完成签名认证。
- 输入框发送消息（280 字截断，3s 频率限制）。

### 自定义与性能
- 调整色彩：`waterColor`、点光/平行光颜色。
- 性能优化：减少粒子数量、将纹理尺寸改为 256；用 `import('three')` 做懒加载。
- 关闭体积效果：移除粒子相关创建与更新逻辑即可。

### 下一步可选扩展
- 聊天历史分页与消息撤回（需额外元数据/签名）。
- 支持多池独立房间：前端根据活动卡片传入池地址调用 `chat:join`。
- 后端添加 Redis/数据库持久化与离线分析。

更详细的使用与参数说明请见各子目录内的 README 与代码注释。
