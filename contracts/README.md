# Contracts (Truffle + Hardhat node)

本包包含幸运池智能合约与测试。因 Windows 上 Node 22 与 Ganache 的 µWS 兼容问题，推荐使用 Hardhat 本地节点来运行测试。

## 环境
- Node.js >= 18（当前使用 22 也可）
- Windows PowerShell v5.1（若执行策略阻止 `npm`/`npx` 的 `.ps1`，请改用下述命令方式）

## 安装依赖
```powershell
# 在 monorepo 根目录
npm install
# 或进入 contracts 子目录安装
cd .\contracts
npm install
```

## 启动本地节点（Hardhat）
```powershell
# 打开一个新终端，进入 contracts 目录
cd .\contracts
# 启动本地链（127.0.0.1:8545）
# 若 PowerShell 拒绝执行 npx.ps1，可改用 cmd:
#   cmd /c "npx hardhat node --hostname 127.0.0.1 --port 8545"
# 或直接使用 Node 调用（避开 .ps1）：
#   node node_modules\hardhat\internal\cli\cli.js node --hostname 127.0.0.1 --port 8545
npx hardhat node --hostname 127.0.0.1 --port 8545
```

## 运行测试
打开另一个新终端，执行：
```powershell
cd .\contracts
# 方式一（若允许 npx.ps1）：
npx truffle test --network development --show-events
# 方式二（避开 PowerShell 执行策略）：
node node_modules\truffle\build\cli.bundled.js test --network development --show-events
```

## 说明
- `truffle-config.js` 的 `development` 网络已指向 `127.0.0.1:8545`，可直接连接 Hardhat 节点。
- 测试用到了 `contracts/mocks/MockERC20.sol` 与 `contracts/mocks/MockVRFCoordinatorV2.sol`，后者会立即回调 VRF v2 的 `rawFulfillRandomWords`，用于本地快速验证开奖流程。
- 合约用 `participants + ticketsByUser` 来计算中奖者，支持在达到最小阈值前的退款，不会出现“已退款的票仍在数组中被抽中”的问题。
