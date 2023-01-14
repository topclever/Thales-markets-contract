// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-4.4.1/token/ERC20/IERC20.sol";
import "../interfaces/ISportPositionalMarket.sol";
import "../interfaces/ISportPositionalMarketManager.sol";
import "../interfaces/IPosition.sol";
import "../interfaces/ITherundownConsumer.sol";
import "../interfaces/ISportsAMM.sol";

import "./LiquidityPool/AMMLiquidityPool.sol";

/// @title Sports AMM utils
contract SportsAMMUtils {
    uint private constant ONE = 1e18;
    uint private constant ZERO_POINT_ONE = 1e17;
    uint private constant ONE_PERCENT = 1e16;
    uint private constant MAX_APPROVAL = type(uint256).max;
    int private constant ONE_INT = 1e18;
    int private constant ONE_PERCENT_INT = 1e16;

    ISportsAMM public sportsAMM;

    constructor(address _sportsAMM) {
        sportsAMM = ISportsAMM(_sportsAMM);
    }

    struct DiscountParams {
        uint balancePosition;
        uint balanceOtherSide;
        uint amount;
        uint availableToBuyFromAMM;
    }

    struct NegativeDiscountsParams {
        uint amount;
        uint balancePosition;
        uint balanceOtherSide;
        uint _availableToBuyFromAMMOtherSide;
        uint _availableToBuyFromAMM;
        uint pricePosition;
        uint priceOtherPosition;
    }

    function buyPriceImpactImbalancedSkew(
        uint amount,
        uint balanceOtherSide,
        uint balancePosition,
        uint balanceOtherSideAfter,
        uint balancePositionAfter,
        uint availableToBuyFromAMM
    ) public view returns (uint) {
        uint maxPossibleSkew = balanceOtherSide + availableToBuyFromAMM - balancePosition;
        uint skew = balanceOtherSideAfter - (balancePositionAfter);
        uint newImpact = (sportsAMM.max_spread() * ((skew * ONE) / (maxPossibleSkew))) / ONE;
        if (balancePosition > 0) {
            uint newPriceForMintedOnes = newImpact / (2);
            uint tempMultiplier = (amount - balancePosition) * (newPriceForMintedOnes);
            return (tempMultiplier * ONE) / (amount) / ONE;
        } else {
            uint previousSkew = balanceOtherSide;
            uint previousImpact = (sportsAMM.max_spread() * ((previousSkew * ONE) / (maxPossibleSkew))) / ONE;
            return (newImpact + previousImpact) / (2);
        }
    }

    function calculateDiscount(DiscountParams memory params) public view returns (int) {
        uint currentBuyImpactOtherSide = buyPriceImpactImbalancedSkew(
            params.amount,
            params.balancePosition,
            params.balanceOtherSide,
            params.balanceOtherSide > ONE
                ? params.balancePosition
                : params.balancePosition + (ONE - params.balanceOtherSide),
            params.balanceOtherSide > ONE ? params.balanceOtherSide - ONE : 0,
            params.availableToBuyFromAMM
        );

        uint startDiscount = currentBuyImpactOtherSide;
        uint tempMultiplier = params.balancePosition - params.amount;
        uint finalDiscount = ((startDiscount / 2) * ((tempMultiplier * ONE) / params.balancePosition + ONE)) / ONE;

        return -int(finalDiscount);
    }

    function calculateDiscountFromNegativeToPositive(NegativeDiscountsParams memory params)
        public
        view
        returns (int priceImpact)
    {
        uint amountToBeMinted = params.amount - params.balancePosition;
        uint sum1 = params.balanceOtherSide + params.balancePosition;
        uint sum2 = params.balanceOtherSide + amountToBeMinted;
        uint red3 = params._availableToBuyFromAMM - params.balancePosition;
        uint positiveSkew = buyPriceImpactImbalancedSkew(amountToBeMinted, sum1, 0, sum2, 0, red3);

        uint skew = (params.priceOtherPosition * positiveSkew) / params.pricePosition;

        int discount = calculateDiscount(
            DiscountParams(
                params.balancePosition,
                params.balanceOtherSide,
                params.balancePosition,
                params._availableToBuyFromAMMOtherSide
            )
        );

        int discountBalance = int(params.balancePosition) * discount;
        int discountMinted = int(amountToBeMinted * skew);
        int amountInt = int(params.balancePosition + amountToBeMinted);

        priceImpact = (discountBalance + discountMinted) / amountInt;

        if (priceImpact > 0) {
            int numerator = int(params.pricePosition) * priceImpact;
            priceImpact = numerator / int(params.priceOtherPosition);
        }
    }

    function calculateTempQuote(
        int skewImpact,
        uint baseOdds,
        uint safeBoxImpact,
        uint amount
    ) public pure returns (int tempQuote) {
        if (skewImpact >= 0) {
            int impactPrice = ((ONE_INT - int(baseOdds)) * skewImpact) / ONE_INT;
            // add 2% to the price increase to avoid edge cases on the extremes
            impactPrice = (impactPrice * (ONE_INT + (ONE_PERCENT_INT * 2))) / ONE_INT;
            tempQuote = (int(amount) * (int(baseOdds) + impactPrice)) / ONE_INT;
        } else {
            tempQuote = ((int(amount)) * ((int(baseOdds) * (ONE_INT + skewImpact)) / ONE_INT)) / ONE_INT;
        }
        tempQuote = (tempQuote * (ONE_INT + (int(safeBoxImpact)))) / ONE_INT;
    }

    function calculateAvailableToBuy(
        uint capUsed,
        uint spentOnThisGame,
        uint baseOdds,
        uint balance
    ) public view returns (uint availableAmount) {
        uint discountedPrice = (baseOdds * (ONE - sportsAMM.max_spread() / 2)) / ONE;
        uint additionalBufferFromSelling = (balance * discountedPrice) / ONE;
        if ((capUsed + additionalBufferFromSelling) > spentOnThisGame) {
            uint availableUntilCapSUSD = capUsed + additionalBufferFromSelling - spentOnThisGame;
            if (availableUntilCapSUSD > capUsed) {
                availableUntilCapSUSD = capUsed;
            }

            uint midImpactPriceIncrease = ((ONE - baseOdds) * (sportsAMM.max_spread() / 2)) / ONE;
            uint divider_price = ONE - (baseOdds + midImpactPriceIncrease);

            availableAmount = balance + ((availableUntilCapSUSD * ONE) / divider_price);
        }
    }

    function getCanExercize(address market, address toCheck) public view returns (bool canExercize) {
        if (
            ISportPositionalMarketManager(sportsAMM.manager()).isKnownMarket(market) &&
            !ISportPositionalMarket(market).paused() &&
            ISportPositionalMarket(market).resolved()
        ) {
            (IPosition home, IPosition away, IPosition draw) = ISportPositionalMarket(market).getOptions();
            if (
                (home.getBalanceOf(address(toCheck)) > 0) ||
                (away.getBalanceOf(address(toCheck)) > 0) ||
                (ISportPositionalMarket(market).optionsCount() > 2 && draw.getBalanceOf(address(toCheck)) > 0)
            ) {
                canExercize = true;
            }
        }
    }

    function isMarketInAMMTrading(address market) public view returns (bool isTrading) {
        if (ISportPositionalMarketManager(sportsAMM.manager()).isActiveMarket(market)) {
            (uint maturity, ) = ISportPositionalMarket(market).times();
            if (maturity >= block.timestamp) {
                uint timeLeftToMaturity = maturity - block.timestamp;
                isTrading = timeLeftToMaturity > sportsAMM.minimalTimeLeftToMaturity();
            }
        }
    }

    function obtainOdds(address _market, ISportsAMM.Position _position) public view returns (uint oddsToReturn) {
        if (ISportPositionalMarketManager(sportsAMM.manager()).isDoubleChanceMarket(_market)) {
            if (_position == ISportsAMM.Position.Home) {
                (uint oddsPosition1, uint oddsPosition2) = getBaseOddsForDoubleChance(_market);
                oddsToReturn = oddsPosition1 + oddsPosition2;
            }
        } else {
            address theRundownConsumer = sportsAMM.theRundownConsumer();
            if (ISportPositionalMarket(_market).optionsCount() > uint(_position)) {
                uint[] memory odds = new uint[](ISportPositionalMarket(_market).optionsCount());
                odds = ITherundownConsumer(theRundownConsumer).getNormalizedOddsForMarket(_market);
                oddsToReturn = odds[uint(_position)];
            }
        }
    }

    function getBalanceOtherSideOnThreePositions(
        ISportsAMM.Position position,
        address addressToCheck,
        address market
    ) public view returns (uint balanceOfTheOtherSide) {
        (uint homeBalance, uint awayBalance, uint drawBalance) = getBalanceOfPositionsOnMarket(market, addressToCheck);
        if (position == ISportsAMM.Position.Home) {
            balanceOfTheOtherSide = awayBalance < drawBalance ? awayBalance : drawBalance;
        } else if (position == ISportsAMM.Position.Away) {
            balanceOfTheOtherSide = homeBalance < drawBalance ? homeBalance : drawBalance;
        } else {
            balanceOfTheOtherSide = homeBalance < awayBalance ? homeBalance : awayBalance;
        }
    }

    function getBalanceOfPositionsOnMarket(address market, address addressToCheck)
        public
        view
        returns (
            uint homeBalance,
            uint awayBalance,
            uint drawBalance
        )
    {
        (IPosition home, IPosition away, IPosition draw) = ISportPositionalMarket(market).getOptions();
        homeBalance = home.getBalanceOf(address(addressToCheck));
        awayBalance = away.getBalanceOf(address(addressToCheck));
        if (ISportPositionalMarket(market).optionsCount() == 3) {
            drawBalance = draw.getBalanceOf(address(addressToCheck));
        }
    }

    function balanceOfPositionsOnMarket(
        address market,
        ISportsAMM.Position position,
        address addressToCheck
    )
        public
        view
        returns (
            uint,
            uint,
            uint
        )
    {
        (IPosition home, IPosition away, ) = ISportPositionalMarket(market).getOptions();
        uint balance = position == ISportsAMM.Position.Home
            ? home.getBalanceOf(addressToCheck)
            : away.getBalanceOf(addressToCheck);
        uint balanceOtherSideMax = position == ISportsAMM.Position.Home
            ? away.getBalanceOf(addressToCheck)
            : home.getBalanceOf(addressToCheck);
        uint balanceOtherSideMin = balanceOtherSideMax;
        if (ISportPositionalMarket(market).optionsCount() == 3) {
            (uint homeBalance, uint awayBalance, uint drawBalance) = getBalanceOfPositionsOnMarket(market, addressToCheck);
            if (position == ISportsAMM.Position.Home) {
                balance = homeBalance;
                if (awayBalance < drawBalance) {
                    balanceOtherSideMax = drawBalance;
                    balanceOtherSideMin = awayBalance;
                } else {
                    balanceOtherSideMax = awayBalance;
                    balanceOtherSideMin = drawBalance;
                }
            } else if (position == ISportsAMM.Position.Away) {
                balance = awayBalance;
                if (homeBalance < drawBalance) {
                    balanceOtherSideMax = drawBalance;
                    balanceOtherSideMin = homeBalance;
                } else {
                    balanceOtherSideMax = homeBalance;
                    balanceOtherSideMin = drawBalance;
                }
            } else if (position == ISportsAMM.Position.Draw) {
                balance = drawBalance;
                if (homeBalance < awayBalance) {
                    balanceOtherSideMax = awayBalance;
                    balanceOtherSideMin = homeBalance;
                } else {
                    balanceOtherSideMax = homeBalance;
                    balanceOtherSideMin = awayBalance;
                }
            }
        }
        return (balance, balanceOtherSideMax, balanceOtherSideMin);
    }

    function balanceOfPositionOnMarket(
        address market,
        ISportsAMM.Position position,
        address addressToCheck
    ) public view returns (uint) {
        (IPosition home, IPosition away, IPosition draw) = ISportPositionalMarket(market).getOptions();
        uint balance = position == ISportsAMM.Position.Home
            ? home.getBalanceOf(addressToCheck)
            : away.getBalanceOf(addressToCheck);
        if (ISportPositionalMarket(market).optionsCount() == 3 && position != ISportsAMM.Position.Home) {
            balance = position == ISportsAMM.Position.Away
                ? away.getBalanceOf(addressToCheck)
                : draw.getBalanceOf(addressToCheck);
        }
        return balance;
    }

    function getParentMarketPositions(address market)
        public
        view
        returns (
            ISportsAMM.Position position1,
            ISportsAMM.Position position2,
            address parentMarket
        )
    {
        ISportPositionalMarket parentMarketContract = ISportPositionalMarket(market).parentMarket();
        (IPosition parentPosition1, IPosition parentPosition2) = ISportPositionalMarket(market).getParentMarketPositions();
        (IPosition home, IPosition away, ) = parentMarketContract.getOptions();
        position1 = parentPosition1 == home ? ISportsAMM.Position.Home : parentPosition1 == away
            ? ISportsAMM.Position.Away
            : ISportsAMM.Position.Draw;
        position2 = parentPosition2 == home ? ISportsAMM.Position.Home : parentPosition2 == away
            ? ISportsAMM.Position.Away
            : ISportsAMM.Position.Draw;

        parentMarket = address(parentMarketContract);
    }

    function getParentMarketPositionAddresses(address market)
        public
        view
        returns (address parentMarketPosition1, address parentMarketPosition2)
    {
        (IPosition position1, IPosition position2) = ISportPositionalMarket(market).getParentMarketPositions();

        parentMarketPosition1 = address(position1);
        parentMarketPosition2 = address(position2);
    }

    function getBaseOddsForDoubleChance(address market) public view returns (uint oddsPosition1, uint oddsPosition2) {
        (ISportsAMM.Position position1, ISportsAMM.Position position2, address parentMarket) = getParentMarketPositions(
            market
        );
        oddsPosition1 = obtainOdds(parentMarket, position1);
        oddsPosition2 = obtainOdds(parentMarket, position2);
    }

    function getTarget(address market, ISportsAMM.Position position) external view returns (address target) {
        (IPosition home, IPosition away, IPosition draw) = ISportPositionalMarket(market).getOptions();
        IPosition targetP = position == ISportsAMM.Position.Home ? home : away;
        if (ISportPositionalMarket(market).optionsCount() > 2 && position != ISportsAMM.Position.Home) {
            targetP = position == ISportsAMM.Position.Away ? away : draw;
        }
        target = address(targetP);
    }

    function getAvailableOtherSide(
        address market,
        ISportsAMM.Position position,
        uint amount
    ) external view returns (uint _availableOtherSide) {
        uint _availableOtherSideFirst = sportsAMM.availableToBuyFromAMM(
            market,
            position == ISportsAMM.Position.Home ? ISportsAMM.Position.Draw : position == ISportsAMM.Position.Draw
                ? ISportsAMM.Position.Away
                : ISportsAMM.Position.Home
        );
        uint _availableOtherSideSecond = sportsAMM.availableToBuyFromAMM(
            market,
            position == ISportsAMM.Position.Home ? ISportsAMM.Position.Away : position == ISportsAMM.Position.Draw
                ? ISportsAMM.Position.Home
                : ISportsAMM.Position.Draw
        );
        _availableOtherSide = _availableOtherSideFirst > _availableOtherSideSecond
            ? _availableOtherSideFirst
            : _availableOtherSideSecond;
    }

    function getMarketDefaultOdds(address _market) external view returns (uint[] memory odds) {
        odds = new uint[](ISportPositionalMarket(_market).optionsCount());
        if (sportsAMM.isMarketInAMMTrading(_market)) {
            ISportsAMM.Position position;
            for (uint i = 0; i < odds.length; i++) {
                if (i == 0) {
                    position = ISportsAMM.Position.Home;
                } else if (i == 1) {
                    position = ISportsAMM.Position.Away;
                } else {
                    position = ISportsAMM.Position.Draw;
                }
                odds[i] = sportsAMM.buyFromAmmQuote(_market, position, ONE);
            }
        }
    }

    function buyPriceImpact(
        address market,
        ISportsAMM.Position position,
        uint amount,
        uint _availableToBuyFromAMM,
        uint _availableToBuyFromAMMOtherSide
    ) public view returns (int priceImpact) {
        (uint balancePosition, , uint balanceOtherSide) = balanceOfPositionsOnMarket(
            market,
            position,
            AMMLiquidityPool(sportsAMM.getLiquidityPool()).getMarketPool(market)
        );
        bool isTwoPositional = ISportPositionalMarket(market).optionsCount() == 2;
        uint balancePositionAfter = balancePosition > amount ? balancePosition - amount : 0;
        uint balanceOtherSideAfter = balancePosition > amount
            ? balanceOtherSide
            : balanceOtherSide + (amount - balancePosition);
        if (amount <= balancePosition) {
            priceImpact = calculateDiscount(
                SportsAMMUtils.DiscountParams(balancePosition, balanceOtherSide, amount, _availableToBuyFromAMMOtherSide)
            );
        } else {
            if (balancePosition > 0) {
                uint pricePosition = obtainOdds(market, position);
                uint priceOtherPosition = isTwoPositional
                    ? obtainOdds(
                        market,
                        position == ISportsAMM.Position.Home ? ISportsAMM.Position.Away : ISportsAMM.Position.Home
                    )
                    : ONE - pricePosition;
                priceImpact = calculateDiscountFromNegativeToPositive(
                    NegativeDiscountsParams(
                        amount,
                        balancePosition,
                        balanceOtherSide,
                        _availableToBuyFromAMMOtherSide,
                        _availableToBuyFromAMM,
                        pricePosition,
                        priceOtherPosition
                    )
                );
            } else {
                priceImpact = int(
                    buyPriceImpactImbalancedSkew(
                        amount,
                        balanceOtherSide,
                        balancePosition,
                        balanceOtherSideAfter,
                        balancePositionAfter,
                        _availableToBuyFromAMM
                    )
                );
            }
        }
    }
}
