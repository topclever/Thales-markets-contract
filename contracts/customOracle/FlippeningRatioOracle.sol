// SPDX-License-Identifier: MIT
pragma solidity ^0.5.16;

import "@chainlink/contracts/src/v0.5/interfaces/AggregatorV2V3Interface.sol";
import "synthetix-2.43.1/contracts/SafeDecimalMath.sol";

contract FlippeningRatioOracle {
    using SafeMath for uint;
    using SafeDecimalMath for uint;

    AggregatorV2V3Interface internal firstMarketcap;
    AggregatorV2V3Interface internal secondMarketcap;

    constructor(address _first, address _second) public {
        firstMarketcap = AggregatorV2V3Interface(_first);
        secondMarketcap = AggregatorV2V3Interface(_second);
    }

    function getRatio() public view returns (uint) {
        uint firstPrice = uint(firstMarketcap.latestAnswer());
        uint secondPrice = uint(secondMarketcap.latestAnswer());

        uint ratio = firstPrice.mul(1e18).div(secondPrice);

        return ratio;
    }
}
