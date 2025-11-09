// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/security/Pausable.sol";
import {ILuckyPool} from "./interfaces/ILuckyPool.sol";
import {LuckyPool} from "./LuckyPool.sol";

/// @title LuckyPoolFactory - 管理与创建活动奖池
contract LuckyPoolFactory is Ownable, Pausable {
    // 全局配置
    address public stablecoin;          // USDT/USDC(BEP-20)
    uint256 public ticketPrice;         // 1 单位稳定币（例如 1e18 表示 1 USDT）
    uint64  public countdownSeconds;    // 例如 3 天
    uint64  public refundDeadlineSeconds; // 例如 15 天

    // VRF v2
    address public vrfCoordinator;
    bytes32 public keyHash;
    uint64  public subId;

    address public treasury;            // 资金归集地址

    address[] public allPools;

    event PoolCreated(address pool, uint256 minFill, uint256 maxFill, string metadataURI, uint32 sortOrder);
    event GlobalConfigUpdated();

    constructor(
        address _owner,
        address _stablecoin,
        uint256 _ticketPrice,
        uint64 _countdownSeconds,
        uint64 _refundDeadlineSeconds,
        address _vrfCoordinator,
        bytes32 _keyHash,
        uint64 _subId,
        address _treasury
    ) Ownable() {
        require(_stablecoin != address(0) && _treasury != address(0), "zero addr");
        stablecoin = _stablecoin;
        ticketPrice = _ticketPrice;
        countdownSeconds = _countdownSeconds;
        refundDeadlineSeconds = _refundDeadlineSeconds;
        vrfCoordinator = _vrfCoordinator;
        keyHash = _keyHash;
        subId = _subId;
        treasury = _treasury;
        if (_owner != msg.sender) {
            _transferOwnership(_owner);
        }
    }

    function updateGlobalConfig(
        address _stablecoin,
        uint256 _ticketPrice,
        uint64 _countdownSeconds,
        uint64 _refundDeadlineSeconds,
        address _vrfCoordinator,
        bytes32 _keyHash,
        uint64 _subId,
        address _treasury
    ) external onlyOwner {
        require(_stablecoin != address(0) && _treasury != address(0), "zero addr");
        stablecoin = _stablecoin;
        ticketPrice = _ticketPrice;
        countdownSeconds = _countdownSeconds;
        refundDeadlineSeconds = _refundDeadlineSeconds;
        vrfCoordinator = _vrfCoordinator;
        keyHash = _keyHash;
        subId = _subId;
        treasury = _treasury;
        emit GlobalConfigUpdated();
    }

    struct CreateParams {
        uint256 minFill;
        uint256 maxFill;
        string metadataURI; // 前端可展示的图片/说明链接（链下）
        uint32 sortOrder;   // 排序值（越小越靠前）
    }

    function createPool(CreateParams calldata p) external onlyOwner whenNotPaused returns (address pool) {
        require(p.maxFill > p.minFill && p.minFill > 0, "bad fill");
        pool = address(new LuckyPool({
            _owner: msg.sender,
            _stablecoin: stablecoin,
            _ticketPrice: ticketPrice,
            _minFill: p.minFill,
            _maxFill: p.maxFill,
            _countdownSeconds: countdownSeconds,
            _refundDeadlineSeconds: refundDeadlineSeconds,
            _vrfCoordinator: vrfCoordinator,
            _keyHash: keyHash,
            _subId: subId,
            _treasury: treasury
        }));
        allPools.push(pool);
        emit PoolCreated(pool, p.minFill, p.maxFill, p.metadataURI, p.sortOrder);
    }

    function getPools() external view returns (address[] memory) {
        return allPools;
    }

    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }
}
