// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IParlayAMMLiquidityPool {
    function commitTrade(address market, uint amountToMint) external;

    function getMarketRound(address market) external view returns (uint _round);

    function transferToPool(address market, uint amount) external;
}
