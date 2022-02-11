pragma solidity ^0.8.0;

// import "@openzeppelin/contracts-4.4.1/access/Ownable.sol";
import "@openzeppelin/contracts-4.4.1/utils/math/SafeMath.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "../utils/proxy/solidity-0.8.0/ProxyOwned.sol";
import "@openzeppelin/contracts-4.4.1/token/ERC20/IERC20.sol";

contract ExoticPositionalMarket is Initializable, ProxyOwned {
    using SafeMath for uint;

    // struct Position {
    //     bytes32 phrase;
    //     uint position;
    //     uint amount;
    // }

    // struct User {
    //     address account;
    //     uint position;
    //     uint amount;
    // }

    enum TicketType{ FIXED_TICKET_PRICE, FLEXIBLE_BID }
    uint constant HUNDRED = 100;

    uint public creationTime;
    bool public disputed;
    bool public outcomeUpdated;

    // from init
    string public marketQuestion;
    // Position[] public positions;
    uint public positionCount;
    mapping(uint => string) public positionPhrase;
    uint public endOfPositioning;
    uint public marketMaturity;
    TicketType public ticketType;
    uint public fixedTicketPrice;
    bool public withdrawalAllowed;
    uint public withdrawalFeePercentage;
    uint public tag;
    IERC20 public paymentToken;
    
    //stats
    uint public totalTicketHolders;
    mapping(uint => uint) public ticketsPerPosition;
    mapping(address => uint) public ticketHolder;


    function initializeWithTwoParameters(
        string memory _marketQuestion, 
        uint _endOfPositioning,
        uint _marketMaturity,
        uint _fixedTicketPrice,
        uint _withdrawalFeePercentage,
        uint[] memory _tag,
        address _paymentToken,
        string memory _phrase1,
        string memory _phrase2
    ) external initializer {
        setOwner(msg.sender);
        _initializeWithTwoParameters(
            _marketQuestion, 
            _endOfPositioning,
            _marketMaturity,
            _fixedTicketPrice,
            _withdrawalFeePercentage,
            _tag,
            _paymentToken,
            _phrase1,
            _phrase2
        );
    }

    function initializeWithThreeParameters(
        string memory _marketQuestion, 
        uint _endOfPositioning,
        uint _marketMaturity,
        uint _fixedTicketPrice,
        uint _withdrawalFeePercentage,
        uint[] memory _tag,
        address _paymentToken,
        string memory _phrase1,
        string memory _phrase2,
        string memory _phrase3
    ) external initializer {
        setOwner(msg.sender);
        _initializeWithTwoParameters(
            _marketQuestion, 
            _endOfPositioning,
            _marketMaturity,
            _fixedTicketPrice,
            _withdrawalFeePercentage,
            _tag,
            _paymentToken,
            _phrase1,
            _phrase2
        );
        _addPosition(_phrase3);
    }

    // market resolved only through the Manager
    function resolveMarket(uint _outcomePosition) external onlyOwner{
        require(canResolveMarket(), "Market can not be resolved");
        require(_outcomePosition < positionCount, "Outcome position exeeds the position");

        if(ticketType == TicketType.FIXED_TICKET_PRICE) {
            // _resolveFixedPrice(_outcomePosition);
        }
        else{
            // _resolveFlexibleBid(_outcomePosition);
        }

    }

    // to be used within the Manager
    function chooseDefaultPosition(uint _position, address account) external onlyOwner{
        require(_position > 0, "Position can not be zero. Non-zero position expected");
        require(_position <= positionCount, "Position exceeds number of positions");
        require(block.timestamp <= creationTime.add(endOfPositioning), "Positioning time finished");
    }


    function takeAPosition(uint _position) external {
        require(_position > 0, "Position can not be zero. Non-zero position expected");
        require(_position <= positionCount, "Position exceeds number of positions");
        require(canPlacePosition(), "Positioning time finished");
        if(ticketType == TicketType.FIXED_TICKET_PRICE) {
            if(getTicketHolderPosition(msg.sender) == 0) {
                require(paymentToken.allowance(msg.sender, address(this)) >=  fixedTicketPrice, "No allowance. Please approve ticket price allowance");
                paymentToken.transferFrom(msg.sender, address(this), fixedTicketPrice);
                totalTicketHolders = totalTicketHolders.add(1);
            }
            else {
                ticketsPerPosition[getTicketHolderPosition(msg.sender)] = ticketsPerPosition[getTicketHolderPosition(msg.sender)].sub(1);
            }
            ticketsPerPosition[_position] = ticketsPerPosition[_position].add(1);
            ticketHolder[msg.sender] = _position;
        }
        else{
            // _resolveFlexibleBid(_outcomePosition);
        }
    }

    function openDispute(uint _disputeCode) external {
        require(isMarketCreated(), "Market not created");
        //
        // CODE TO BE ADDED
        //
        disputed = true;
        emit MarketDisputed(true);
    }
    // VIEWS
    function isMarketCreated() public view returns (bool) {
        return creationTime > 0;
    }

    function canResolveMarket() public view returns (bool) {
        return block.timestamp >= creationTime.add(marketMaturity) && creationTime > 0 && disputed;
    }
    function canPlacePosition() public view returns (bool) {
        return block.timestamp <= creationTime.add(endOfPositioning) && creationTime > 0;
    }
    
    function getPositionPhrase(uint index) public view returns (string memory) {
        return (index <= positionCount && index > 0) ? positionPhrase[index] : string("");
    }

    // function getAllPositions() public view returns (bytes32[] memory) {
    //     bytes32[] memory positionPhrases_ = new bytes32[](positionCount);
    //     for(uint i=1; i <= positionCount; i++) {
    //         positionPhrases_[i] = positionPhrase[i];
    //     }
    //     return positionPhrases_;
    // }

    function getTicketHolderPosition(address _account) public view returns (uint) {
        return ticketHolder[_account];
    }
    function getTicketHolderPositionPhrase(address _account) public view returns (string memory) {
        return (ticketHolder[_account] > 0) ? positionPhrase[ticketHolder[_account]] : string("");
    }

    
    // INTERNAL FUNCTIONS

    function _initializeWithTwoParameters(
        string memory _marketQuestion, 
        uint _endOfPositioning,
        uint _marketMaturity,
        uint _fixedTicketPrice,
        uint _withdrawalFeePercentage,
        uint[] memory _tag,
        address _paymentToken,
        string memory _phrase1,
        string memory _phrase2
    ) internal {
        creationTime = block.timestamp;
        marketQuestion = _marketQuestion;
        endOfPositioning = block.timestamp.add(_endOfPositioning);
        marketMaturity = block.timestamp.add(_marketMaturity);
        paymentToken = IERC20(_paymentToken);
        // Ticket Type can be determined based on ticket price
        ticketType = _fixedTicketPrice > 0 ? TicketType.FIXED_TICKET_PRICE : TicketType.FLEXIBLE_BID;
        fixedTicketPrice = _fixedTicketPrice;
        // Withdrawal allowance determined based on withdrawal percentage, if it is over 100% then it is forbidden
        withdrawalAllowed = _withdrawalFeePercentage < HUNDRED ? true : false;
        withdrawalFeePercentage = _withdrawalFeePercentage;
        // The tag is just a number for now
        // tag = _tag;
        _addPosition(_phrase1);
        _addPosition(_phrase2);
    }


    function _addPosition(string memory _position) internal {
        // require(_position != "" || _position != " ", "Invalid phrase. Please assign non-zero position");
        positionCount = positionCount.add(1);
        positionPhrase[positionCount] = _position;
    }
 
    event MarketDisputed(bool _disputed);
    event MarketCreated(uint _creationTime, uint positionCount, bytes32 phrase);

}