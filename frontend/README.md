# Lucky Pool 前端 (Vite + React + TS)

最小可用前端：支持连接钱包、切换到 BSC Testnet、展示基础活动列表占位。

## 开发
```powershell
cd e:\Lucky-pool\frontend
npm install
npm run dev
```
打开浏览器访问 http://localhost:5173

## 构建
```powershell
npm run build
npm run preview
```

## 注意
- 需结合 `shared/abi` 提供的 ABI 进行链上读写集成（后续将补充活动列表、参与、退款等交互）。
- 默认链：BSC Testnet，可在浏览器中切换网络并连接钱包（MetaMask/OKX 等）。
