pragma solidity ^0.5.16;

// Inheritance
import "../interfaces/IPriceFeed.sol";
import "@openzeppelin/upgrades-core/contracts/Initializable.sol";
// Libraries
import "synthetix-2.50.4-ovm/contracts/SafeDecimalMath.sol";

// Internal references
// AggregatorInterface from Chainlink represents a decentralized pricing network for a single currency key
import "@chainlink/contracts-0.0.10/src/v0.5/interfaces/AggregatorV2V3Interface.sol";

contract PriceFeed is IPriceFeed, Initializable {
    using SafeMath for uint;
    using SafeDecimalMath for uint;

    // Decentralized oracle networks that feed into pricing aggregators
    mapping(bytes32 => AggregatorV2V3Interface) public aggregators;
    mapping(bytes32 => uint8) public currencyKeyDecimals;

    // List of aggregator keys for convenient iteration
    bytes32[] public aggregatorKeys;
    address public owner;
    address public nominatedOwner;

    function initialize(address _owner) public initializer {
        require(_owner != address(0), "Owner address cannot be 0");
        owner = _owner;
        emit OwnerChanged(address(0), _owner);
    }

    /* ========== MUTATIVE FUNCTIONS ========== */
    function addAggregator(bytes32 currencyKey, address aggregatorAddress) external onlyOwner {
        AggregatorV2V3Interface aggregator = AggregatorV2V3Interface(aggregatorAddress);
        require(aggregator.latestRound() >= 0, "Given Aggregator is invalid");
        uint8 decimals = aggregator.decimals();
        require(decimals <= 18, "Aggregator decimals should be lower or equal to 18");
        if (address(aggregators[currencyKey]) == address(0)) {
            aggregatorKeys.push(currencyKey);
        }
        aggregators[currencyKey] = aggregator;
        currencyKeyDecimals[currencyKey] = decimals;
        emit AggregatorAdded(currencyKey, address(aggregator));
    }

    function removeAggregator(bytes32 currencyKey) external onlyOwner {
        address aggregator = address(aggregators[currencyKey]);
        require(aggregator != address(0), "No aggregator exists for key");
        delete aggregators[currencyKey];
        delete currencyKeyDecimals[currencyKey];

        bool wasRemoved = removeFromArray(currencyKey, aggregatorKeys);

        if (wasRemoved) {
            emit AggregatorRemoved(currencyKey, aggregator);
        }
    }

    function getRates() external view returns (uint[] memory rates) {
        uint count = 0;
        rates = new uint[](aggregatorKeys.length);
        for (uint i = 0; i < aggregatorKeys.length; i++) {
            bytes32 currencyKey = aggregatorKeys[i];
            rates[count++] = _getRateAndUpdatedTime(currencyKey).rate;
        }
    }

    function getCurrencies() external view returns (bytes32[] memory) {
        return aggregatorKeys;
    }

    function rateForCurrency(bytes32 currencyKey) external view returns (uint) {
        return _getRateAndUpdatedTime(currencyKey).rate;
    }

    function rateAndUpdatedTime(bytes32 currencyKey) external view returns (uint rate, uint time) {
        RateAndUpdatedTime memory rateAndTime = _getRateAndUpdatedTime(currencyKey);
        return (rateAndTime.rate, rateAndTime.time);
    }

    function removeFromArray(bytes32 entry, bytes32[] storage array) internal returns (bool) {
        for (uint i = 0; i < array.length; i++) {
            if (array[i] == entry) {
                delete array[i];
                array[i] = array[array.length - 1];
                array.length--;
                return true;
            }
        }
        return false;
    }

    function _formatAggregatorAnswer(bytes32 currencyKey, int256 rate) internal view returns (uint) {
        require(rate >= 0, "Negative rate not supported");
        if (currencyKeyDecimals[currencyKey] > 0) {
            uint multiplier = 10**uint(SafeMath.sub(18, currencyKeyDecimals[currencyKey]));
            return uint(uint(rate).mul(multiplier));
        }
        return uint(rate);
    }

    function _getRateAndUpdatedTime(bytes32 currencyKey) internal view returns (RateAndUpdatedTime memory) {
        AggregatorV2V3Interface aggregator = aggregators[currencyKey];
        require(address(aggregator) != address(0), "No aggregator exists for key");

        // this view from the aggregator is the most gas efficient but it can throw when there's no data,
        // so let's call it low-level to suppress any reverts
        bytes memory payload = abi.encodeWithSignature("latestRoundData()");
        // solhint-disable avoid-low-level-calls
        (bool success, bytes memory returnData) = address(aggregator).staticcall(payload);

        if (success) {
            (, int256 answer, , uint256 updatedAt, ) = abi.decode(returnData, (uint80, int256, uint256, uint256, uint80));
            return
                RateAndUpdatedTime({rate: uint216(_formatAggregatorAnswer(currencyKey, answer)), time: uint40(updatedAt)});
        }
    }

    function nominateNewOwner(address _owner) external onlyOwner {
        nominatedOwner = _owner;
        emit OwnerNominated(_owner);
    }

    function acceptOwnership() external {
        require(msg.sender == nominatedOwner, "You must be nominated before you can accept ownership");
        emit OwnerChanged(owner, nominatedOwner);
        owner = nominatedOwner;
        nominatedOwner = address(0);
    }

    modifier onlyOwner() {
        _onlyOwner();
        _;
    }

    function _onlyOwner() private view {
        require(msg.sender == owner, "Only the contract owner may perform this action");
    }

    /* ========== EVENTS ========== */
    event AggregatorAdded(bytes32 currencyKey, address aggregator);
    event AggregatorRemoved(bytes32 currencyKey, address aggregator);
    event OwnerNominated(address newOwner);
    event OwnerChanged(address oldOwner, address newOwner);
}
