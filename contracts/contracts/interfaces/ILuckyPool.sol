// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface ILuckyPool {
    struct PoolInfo {
        address stablecoin;
        uint256 ticketPrice;
        uint256 minFill;
        uint256 maxFill;
        uint64 createdAt;
        uint64 countdownSeconds;
        uint64 refundDeadlineSeconds;
        bool minReached;
        bool drawn;
        bool cancelled;
        uint32 totalTickets;
        uint256 totalRaised;
        uint64 countdownStartAt;
        address winner;
    }

    function getInfo() external view returns (PoolInfo memory);
}
