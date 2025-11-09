# 关键假设与设计说明

- 支付资产：稳定币（BEP-20），推荐 USDT 或 USDC。部署时在 `.env` 配置 `STABLECOIN_ADDRESS_*`。
- 参与价格：每张票固定为 1 单位稳定币（与 token decimals 相同，例如 18 位）。
- 限制策略：链上以地址维度限制每地址最多 10 张票；链下后端可做 IP 限制作为辅控。
- 随机数：Chainlink VRF v2（需在 BSC Testnet/Mainnet 上创建订阅并为合约授权）。
- 阀值与时间：minFill 触发倒计时（默认3天），maxFill 触发即时开奖；refundDeadline 默认15天。
- 开奖与发奖：链上仅确定赢家地址；发放奖品由人工在链下执行（管理员提现到 treasury）。
- 退款规则：未达最小阈值前，用户可随时退款；达到最小阈值后不允许退款；15天未达最小阈值可标记取消。
- Gas 优化：使用 solidity 0.8.x、安全库、紧凑存储、自定义错误，避免昂贵循环；entries 上限由 maxFill 控制。
- 可维护性：通过工厂创建活动，前端/后端读取链上事件与 allPools 列表展示活动。
