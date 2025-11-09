// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/security/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {VRFConsumerBaseV2} from "@chainlink/contracts/src/v0.8/vrf/VRFConsumerBaseV2.sol";
import {VRFCoordinatorV2Interface} from "@chainlink/contracts/src/v0.8/interfaces/VRFCoordinatorV2Interface.sol";

import {ILuckyPool} from "./interfaces/ILuckyPool.sol";

/// @title LuckyPool - 单一活动奖池
/// @notice 1 美金/次，按参与顺序记录序号；达到最小阈值开始倒计时 3 天（可配置），到达最大阈值或倒计时结束后，使用 Chainlink VRF v2 抽取赢家。
///         若 15 天未达最小阈值（可配置），用户可退款；在未达最小阈值前用户随时可退款，一旦达到最小阈值即不允许退款。
contract LuckyPool is Ownable, Pausable, ReentrancyGuard, VRFConsumerBaseV2, ILuckyPool {
    using SafeERC20 for IERC20;

    // ====== 常量/配置 ======
    IERC20 public immutable stablecoin;
    uint256 public immutable ticketPrice; // 1 单位稳定币（如 1e18）
    uint256 public immutable minFill;
    uint256 public immutable maxFill;
    uint64 public immutable countdownSeconds;       // e.g. 3 days
    uint64 public immutable refundDeadlineSeconds;  // e.g. 15 days
    uint64 public immutable createdAt;

    // VRF
    VRFCoordinatorV2Interface public immutable vrfCoordinator;
    bytes32 public immutable keyHash;
    uint64 public immutable subId;

    address public immutable treasury; // 抽奖结束后平台资金接收地址（人工发奖）

    // ====== 状态 ======
    uint256 public totalRaised; // 累计筹集稳定币
    uint32  public totalTickets; // 序号总数（= totalRaised / ticketPrice）
    mapping(address => uint16) public ticketsByUser; // 每地址最多 10 次

    address[] private participants; // 唯一参与地址列表
    mapping(address => bool) private inParticipants;

    bool public minReached;
    uint64 public countdownStartAt; // 达到 minFill 的时间点

    bool public drawn;
    uint32 public winningTicket; // 从 1 开始计数
    address public winner;

    bool public cancelled; // 15 天未达最小阈值时可触发

    // 取消退款批处理进度
    uint256 public refundCursor; // participants 索引游标

    // ====== 事件 ======
    event Participated(address indexed user, uint16 count, uint32 newTotalTickets, uint256 totalRaised);
    event MinReached(uint256 atAmount, uint64 atTime);
    event CountdownStarted(uint64 startTime, uint64 secondsDuration);
    event DrawRequested(uint256 requestId);
    event DrawFulfilled(uint256 requestId, uint32 winningTicket, address winner);
    event Refunded(address indexed user, uint16 tickets, uint256 amount);
    event Cancelled(uint64 atTime);
    event Withdrawn(address indexed to, uint256 amount);

    // ====== 错误 ======
    error AlreadyDrawn();
    error RefundNotAllowed();
    error ExceedsPerAddressLimit();
    error NotReadyToDraw();
    error CancelNotAllowed();

    constructor(
        address _owner,
        address _stablecoin,
        uint256 _ticketPrice,
        uint256 _minFill,
        uint256 _maxFill,
        uint64 _countdownSeconds,
        uint64 _refundDeadlineSeconds,
        address _vrfCoordinator,
        bytes32 _keyHash,
        uint64 _subId,
        address _treasury
    ) VRFConsumerBaseV2(_vrfCoordinator) Ownable() {
        require(_stablecoin != address(0) && _treasury != address(0), "zero addr");
        require(_ticketPrice > 0 && _minFill > 0 && _maxFill > _minFill, "bad conf");
        stablecoin = IERC20(_stablecoin);
        ticketPrice = _ticketPrice;
        minFill = _minFill;
        maxFill = _maxFill;
        countdownSeconds = _countdownSeconds;
        refundDeadlineSeconds = _refundDeadlineSeconds;
        createdAt = uint64(block.timestamp);
        vrfCoordinator = VRFCoordinatorV2Interface(_vrfCoordinator);
        keyHash = _keyHash;
        subId = _subId;
        treasury = _treasury;
        if (_owner != msg.sender) {
            _transferOwnership(_owner);
        }
    }

    // ====== 只读 ======
    // 注意：为避免退款导致的 entries 不一致，不再暴露逐票数组。

    function getInfo() external view returns (PoolInfo memory info) {
        info = PoolInfo({
            stablecoin: address(stablecoin),
            ticketPrice: ticketPrice,
            minFill: minFill,
            maxFill: maxFill,
            createdAt: createdAt,
            countdownSeconds: countdownSeconds,
            refundDeadlineSeconds: refundDeadlineSeconds,
            minReached: minReached,
            drawn: drawn,
            cancelled: cancelled,
            totalTickets: totalTickets,
            totalRaised: totalRaised,
            countdownStartAt: countdownStartAt,
            winner: winner
        });
    }

    // ====== 参与 ======
    function participate(uint16 count) external nonReentrant whenNotPaused {
        require(!drawn && !cancelled, "ended");
        require(count >= 1 && count <= 10, "1..10");
        uint16 prev = ticketsByUser[msg.sender];
        uint16 newTotal = prev + count;
        if (newTotal > 10) revert ExceedsPerAddressLimit();

        uint256 amount = uint256(count) * ticketPrice;
        // 转账到合约托管
        stablecoin.safeTransferFrom(msg.sender, address(this), amount);

        // 首次参与记录唯一参与者
        if (!inParticipants[msg.sender]) {
            inParticipants[msg.sender] = true;
            participants.push(msg.sender);
        }

        ticketsByUser[msg.sender] = newTotal;
        totalTickets += count;
        totalRaised += amount;
        emit Participated(msg.sender, count, totalTickets, totalRaised);

        // 达到最小阈值：开始倒计时（仅第一次触发）
        if (!minReached && totalRaised >= minFill) {
            minReached = true;
            countdownStartAt = uint64(block.timestamp);
            emit MinReached(totalRaised, countdownStartAt);
            emit CountdownStarted(countdownStartAt, countdownSeconds);
        }

        // 达到最大阈值立即尝试开奖
        if (totalRaised >= maxFill) {
            _requestRandomness();
        }
    }

    // 任何人可调用：若到达开奖条件（倒计时结束或金额达上限），请求 VRF
    function tryDrawIfReady() external whenNotPaused {
        if (drawn || cancelled) revert AlreadyDrawn();
        if (totalRaised >= maxFill) {
            _requestRandomness();
            return;
        }
        if (minReached) {
            if (block.timestamp >= countdownStartAt + countdownSeconds) {
                _requestRandomness();
                return;
            }
        }
        revert NotReadyToDraw();
    }

    function _requestRandomness() internal {
        if (drawn || cancelled) revert AlreadyDrawn();
        require(totalTickets > 0, "no tickets");
        uint256 requestId = vrfCoordinator.requestRandomWords(
            keyHash,
            subId,
            3, // requestConfirmations
            200000, // callbackGasLimit
            1 // numWords
        );
        emit DrawRequested(requestId);
    }

    // VRF 回调
    function fulfillRandomWords(uint256 requestId, uint256[] memory randomWords) internal override {
        require(!drawn && !cancelled, "ended");
        require(totalTickets > 0, "no tickets");
        uint256 rnd = randomWords[0];
        uint32 win = uint32((rnd % totalTickets) + 1); // 1-based
        winningTicket = win;
        winner = _ownerOfTicketIndex(win - 1); // 0-based index
        drawn = true;
        emit DrawFulfilled(requestId, win, winner);
    }

    // 将第 index 张票(0-based) 映射到拥有者地址；一次性 O(N) 遍历，N 为参与地址数。
    function _ownerOfTicketIndex(uint32 index) internal view returns (address) {
        uint32 cursor = 0;
        uint256 len = participants.length;
        for (uint256 i = 0; i < len; i++) {
            address p = participants[i];
            uint16 cnt = ticketsByUser[p];
            if (cnt == 0) continue;
            uint32 next = cursor + uint32(cnt);
            if (index < next) {
                return p;
            }
            cursor = next;
        }
        revert("index OOB");
    }

    // ====== 退款 ======
    // 未达最小阈值之前，用户可随时退款；超过 15 天仍未达最小阈值，可触发 cancel 状态（但本函数在未达最小阈值时本就允许）
    function claimRefund() external nonReentrant whenNotPaused {
        if (minReached || drawn) revert RefundNotAllowed();
        uint16 t = ticketsByUser[msg.sender];
        require(t > 0, "no tickets");
        ticketsByUser[msg.sender] = 0; // effects
        uint256 amount = uint256(t) * ticketPrice;
        totalTickets -= t;
        totalRaised -= amount;
        // 直接返还
        stablecoin.safeTransfer(msg.sender, amount);
        emit Refunded(msg.sender, t, amount);
    }

    // 超过退款截止时间仍未达最小阈值时，任何人可触发取消标记（非必需，但有助前端状态展示）
    function triggerCancelAfterDeadline() external whenNotPaused {
        if (minReached || drawn) revert CancelNotAllowed();
        require(block.timestamp >= createdAt + refundDeadlineSeconds, "not yet");
        cancelled = true;
        emit Cancelled(uint64(block.timestamp));
    }

    // ====== 管理员删除并退款（分批）======
    /// @notice 管理员可在开奖前删除活动并原路退还所有款项（分批以避免超出 gas 限制）。
    /// @param maxBatch 本次最多处理的参与地址数量（建议 20~100 之间）
    function adminCancelAndRefundBatch(uint256 maxBatch) external onlyOwner nonReentrant whenNotPaused {
        require(!drawn, "already drawn");
        require(maxBatch > 0, "maxBatch=0");
        if (!cancelled) {
            cancelled = true;
            emit Cancelled(uint64(block.timestamp));
        }
        uint256 len = participants.length;
        uint256 i = refundCursor;
        uint256 processed = 0;
        while (i < len && processed < maxBatch) {
            address p = participants[i];
            uint16 t = ticketsByUser[p];
            if (t > 0) {
                ticketsByUser[p] = 0; // effects
                uint256 amount = uint256(t) * ticketPrice;
                if (amount > 0) {
                    totalTickets -= t;
                    totalRaised -= amount;
                    stablecoin.safeTransfer(p, amount);
                    emit Refunded(p, t, amount);
                }
            }
            unchecked { i++; processed++; }
        }
        refundCursor = i;
    }

    /// @notice 取消退款是否完成（全部地址处理完毕且 totalRaised==0）
    function isCancelRefundFinished() external view returns (bool) {
        return cancelled && refundCursor >= participants.length && totalRaised == 0;
    }

    // ====== 提现 ======
    // 开奖后，平台可以将资金转入 treasury（人工发奖），或在取消情况下结清剩余资金
    function withdrawToTreasury(uint256 amount) external onlyOwner nonReentrant {
        if (!drawn && !cancelled) revert("not ended");
        stablecoin.safeTransfer(treasury, amount);
        emit Withdrawn(treasury, amount);
    }

    // ====== 管理 ======
    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }
}
