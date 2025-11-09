// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface VRFConsumerV2 {
    // VRFConsumerBaseV2 要求协调器调用 rawFulfillRandomWords
    function rawFulfillRandomWords(uint256 requestId, uint256[] memory randomWords) external;
}

contract MockVRFCoordinatorV2 {
    uint256 public lastRequestId;
    function requestRandomWords(
        bytes32,
        uint64,
        uint16,
        uint32,
        uint32
    ) external returns (uint256) {
        lastRequestId++;
        // 立即回调
        uint256[] memory words = new uint256[](1);
        words[0] = uint256(keccak256(abi.encode(block.timestamp, lastRequestId)));
        VRFConsumerV2(msg.sender).rawFulfillRandomWords(lastRequestId, words);
        return lastRequestId;
    }
}
