pragma solidity ^0.5.16;

// external
import "openzeppelin-solidity-2.3.0/contracts/token/ERC20/SafeERC20.sol";
import "openzeppelin-solidity-2.3.0/contracts/math/Math.sol";
import "@openzeppelin/upgrades-core/contracts/Initializable.sol";
import "synthetix-2.50.4-ovm/contracts/SafeDecimalMath.sol";

// interfaces
import "../interfaces/IPriceFeed.sol";

// internal
import "../utils/proxy/ProxyReentrancyGuard.sol";
import "../utils/proxy/ProxyOwned.sol";
import "../utils/proxy/ProxyPausable.sol";

contract ThalesRoyalePrivateRoom is Initializable, ProxyOwned, ProxyReentrancyGuard, ProxyPausable {

    /* ========== LIBRARIES ========== */

    using SafeMath for uint;
    using SafeDecimalMath for uint;
    using SafeERC20 for IERC20;

    /* ========== CONSTANTS =========== */

    uint public constant DOWN = 1;
    uint public constant UP = 2;

    /* ========== ROOM TYPES ========== */

    enum GameType{LAST_MAN_STANDING, LIMITED_NUMBER_OF_ROUNDS}
    enum RoomType{OPEN, CLOSED}

    /* ========== ROOM VARIABLES ========== */

    mapping(uint => address) public roomOwner;
    mapping(uint => bool) public roomPublished;
    mapping(uint => bytes32) public oracleKeyPerRoom;
    mapping(uint => uint) public roomCreationTime;
    mapping(uint => uint) public roomEndTime;
    mapping(uint => uint) public roomSignUpPeriod;
    mapping(uint => uint) public numberOfRoundsInRoom;
    mapping(uint => uint) public roundChoosingLengthInRoom;
    mapping(uint => uint) public climeTimePerRoom;
    mapping(uint => uint) public roundLengthInRoom;
    mapping(uint => uint) public currentRoundInRoom;
    mapping(uint => bool) public roomStarted;
    mapping(uint => bool) public roomFinished;
    mapping(uint => bool) public playerStartedSignUp;
    mapping(uint => bool) public isReversedPositioningInRoom;
    mapping(uint => RoomType) public roomTypePerRoom;
    mapping(uint => GameType) public gameTypeInRoom;
    mapping(uint => address[]) public alowedPlayersPerRoom;
    mapping(uint => address[]) public playersInRoom;
    mapping(uint => mapping(address => uint256)) public playerSignedUpPerRoom;
    mapping(uint => mapping(address => bool)) public playerCanPlayInRoom;
    mapping(uint => uint) public buyInPerPlayerRerRoom;
    mapping(uint => uint) public numberOfPlayersInRoom;
    mapping(uint => uint) public numberOfAlowedPlayersInRoom;

    mapping(uint => uint) public roundTargetPriceInRoom;

    mapping(uint => mapping(uint => uint)) public roundResultPerRoom;
    mapping(uint =>mapping(uint => uint)) public targetPricePerRoundPerRoom;
    mapping(uint => mapping(uint => uint)) public finalPricePerRoundPerRoom;
    mapping(uint =>mapping(uint => uint)) public totalPlayersInARoomInARound;
    mapping(uint => mapping(uint => uint)) public eliminatedPerRoundPerRoom;

    mapping(uint => uint) public roundStartTimeInRoom;
    mapping(uint => uint) public roundEndTimeInRoom;

    mapping(uint => mapping(uint256 => mapping(uint256 => uint256))) public positionsPerRoundPerRoom; 
    mapping(uint => mapping(address => mapping(uint256 => uint256))) public positionInARoundPerRoom;
    
    mapping(uint => uint) public rewardPerRoom;
    mapping(uint => uint) public rewardPerPlayerPerRoom;
    mapping(uint => mapping(address => bool)) public rewardCollectedPerRoom;
    mapping(uint => uint) public unclaimedRewardPerRoom;

    /* ========== STATE VARIABLES ========== */

    IERC20 public rewardToken;
    IPriceFeed public priceFeed;

    uint public roomNumberCounter;

    uint public minTimeSignUp;
    uint public minRoundTime;
    uint public minChooseTime;
    uint public offsetBeteweenChooseAndEndRound;
    uint public minClaimTime;
    uint public maxPlayersInClosedRoom;
    uint public minBuyIn;
    uint public minNumberOfRounds;
    bytes32 [] public allowedAssets;

    /* ========== CONSTRUCTOR ========== */

    function initialize(
        address _owner,
        IPriceFeed _priceFeed,
        address _rewardToken,
        uint _minTimeSignUp,
        uint _minRoundTime,
        uint _minChooseTime,
        uint _offsetBeteweenChooseAndEndRound,
        uint _minClaimTime,
        uint _maxPlayersInClosedRoom,
        uint _minBuyIn,
        bytes32 [] memory _allowedAssets,
        uint _minNumberOfRounds
    ) public initializer {
        setOwner(_owner);
        initNonReentrant();
        priceFeed = _priceFeed;
        rewardToken = IERC20(_rewardToken);
        minTimeSignUp = _minTimeSignUp;
        minRoundTime = _minRoundTime;
        minChooseTime = _minChooseTime;
        offsetBeteweenChooseAndEndRound = _offsetBeteweenChooseAndEndRound;
        minClaimTime = _minClaimTime;
        maxPlayersInClosedRoom = _maxPlayersInClosedRoom;
        minBuyIn = _minBuyIn;
       allowedAssets = _allowedAssets;
       minNumberOfRounds = _minNumberOfRounds;
    }

    /* ========== ROOM CREATION ========== */

    function createARoom(
        bytes32 _oracleKey,
        RoomType _roomType, 
        GameType _gameType, 
        address[] calldata _alowedPlayers,
        uint _buyInAmount,
        uint _amuontOfPlayersinRoom,
        uint _roomSignUpPeriod,
        uint _numberOfRoundsInRoom,
        uint _roundChoosingLength,
        uint _roundLength,
        uint _claimTime
        ) external {
        require(_buyInAmount >= minBuyIn, "Buy in must be greather then minimum");
        require(_roomSignUpPeriod >= minTimeSignUp, "Sign in period lower then minimum");
        require(_numberOfRoundsInRoom >= minNumberOfRounds, "Must be more minimum rounds");
        require(_roundChoosingLength >= minChooseTime, "Round chosing lower then minimum");
        require(_roundLength >= minRoundTime, "Round length lower then minimum");
        require(_claimTime >= minClaimTime, "Claim time must be more then one day.");
        require(_roundLength >= _roundChoosingLength + offsetBeteweenChooseAndEndRound, "Offset lower then minimum");
        require((_roomType == RoomType.CLOSED && _alowedPlayers.length > 0 && _alowedPlayers.length < maxPlayersInClosedRoom) ||
                (_roomType == RoomType.OPEN && _amuontOfPlayersinRoom > 1), 
                "Room must be open and have total players in room or closed with allowed players");
        require(isAssetAllowed(_oracleKey), "Not allowed assets");
        require(rewardToken.allowance(msg.sender, address(this)) >= _buyInAmount, "No allowance.");

        // set room_id
        roomNumberCounter++;

        // setting global room variables
        roomOwner[roomNumberCounter] = msg.sender;
        roomCreationTime[roomNumberCounter] = block.timestamp;
        roomSignUpPeriod[roomNumberCounter] = _roomSignUpPeriod;
        numberOfRoundsInRoom[roomNumberCounter] = _numberOfRoundsInRoom;
        roundChoosingLengthInRoom[roomNumberCounter] = _roundChoosingLength;
        roundLengthInRoom[roomNumberCounter] = _roundLength;
        climeTimePerRoom[roomNumberCounter] = _claimTime;
        roomTypePerRoom[roomNumberCounter] = _roomType;
        gameTypeInRoom[roomNumberCounter] = _gameType;
        oracleKeyPerRoom[roomNumberCounter] = _oracleKey;

        // set only if it closed 
        if(_roomType == RoomType.CLOSED){
            alowedPlayersPerRoom[roomNumberCounter] = _alowedPlayers;
            alowedPlayersPerRoom[roomNumberCounter].push(msg.sender);
            numberOfAlowedPlayersInRoom[roomNumberCounter] = alowedPlayersPerRoom[roomNumberCounter].length;

            for (uint i = 0; i < alowedPlayersPerRoom[roomNumberCounter].length; i++) {
                playerCanPlayInRoom[roomNumberCounter][alowedPlayersPerRoom[roomNumberCounter][i]] = true;
            }

        }else{
            numberOfAlowedPlayersInRoom[roomNumberCounter] = _amuontOfPlayersinRoom;
            playerCanPlayInRoom[roomNumberCounter][msg.sender] = true;
        }

        // adding amount
        buyInPerPlayerRerRoom[roomNumberCounter] = _buyInAmount;

        // first emit event for room creation
        emit RoomCreated(msg.sender, roomNumberCounter, _roomType, _gameType);

        // automaticlly sign up owner of a group as first player
        _signUpOwnerIntoRoom(msg.sender, roomNumberCounter);

        roomPublished[roomNumberCounter] = true;
    }

    /* ========== GAME ========== */

    function signUpForRoom(uint _roomNumber) external {
        require(roomPublished[_roomNumber], "Room deleted or not published yet");
        require(block.timestamp < (roomCreationTime[_roomNumber] + roomSignUpPeriod[_roomNumber]), "Sign up period has expired");
        require(playerSignedUpPerRoom[_roomNumber][msg.sender] == 0, "Player already signed up, for this room.");
        require(
                (roomTypePerRoom[_roomNumber] == RoomType.CLOSED && isPlayerAllowed(msg.sender, _roomNumber)) ||
                (roomTypePerRoom[_roomNumber] == RoomType.OPEN && numberOfPlayersInRoom[_roomNumber] < numberOfAlowedPlayersInRoom[roomNumberCounter])
            , "Can not sign up for room, not allowed or it is full");
        require(rewardToken.allowance(msg.sender, address(this)) >= buyInPerPlayerRerRoom[_roomNumber], "No allowance.");

        numberOfPlayersInRoom[_roomNumber]++;
        playerSignedUpPerRoom[_roomNumber][msg.sender] = block.timestamp;
        playersInRoom[_roomNumber].push(msg.sender);
        if (roomTypePerRoom[_roomNumber] == RoomType.OPEN){
            playerCanPlayInRoom[_roomNumber][msg.sender] = true;
        }

        _buyIn(msg.sender, _roomNumber, buyInPerPlayerRerRoom[_roomNumber]);

        if(!playerStartedSignUp[_roomNumber]){
            playerStartedSignUp[_roomNumber] = true;
        }

        emit SignedUpInARoom(msg.sender, _roomNumber);
    }

    function startRoyaleInRoom(uint _roomNumber) external onlyRoomParticipantes(_roomNumber) {
        require(roomPublished[_roomNumber], "Room deleted or not published yet");
        require(block.timestamp > (roomCreationTime[_roomNumber] + roomSignUpPeriod[_roomNumber]), "Can not start until signup period expires for that room");
        require(roomStarted[_roomNumber] == false, "Royale already started for that room");

        roundTargetPriceInRoom[_roomNumber] = priceFeed.rateForCurrency(oracleKeyPerRoom[_roomNumber]);
        targetPricePerRoundPerRoom[_roomNumber][1] = roundTargetPriceInRoom[_roomNumber];
        roomStarted[_roomNumber] = true;
        currentRoundInRoom[_roomNumber] = 1;
        roundStartTimeInRoom[_roomNumber] = block.timestamp;
        roundEndTimeInRoom[_roomNumber] = roundStartTimeInRoom[_roomNumber] + roundLengthInRoom[_roomNumber];
        totalPlayersInARoomInARound[_roomNumber][1] = numberOfPlayersInRoom[_roomNumber];
        unclaimedRewardPerRoom[_roomNumber] = rewardPerRoom[_roomNumber];

        emit RoyaleStartedForRoom(_roomNumber);
    }

    function takeAPositionInRoom(uint _roomNumber, uint _position) external onlyRoomParticipantes(_roomNumber) {
        require(_position == DOWN || _position == UP, "Position can only be 1 or 2");
        require(roomStarted[_roomNumber], "Competition not started yet");
        require(!roomFinished[_roomNumber], "Competition finished");
        require(positionInARoundPerRoom[_roomNumber][msg.sender][currentRoundInRoom[_roomNumber]] != _position, "Same position");

         if (currentRoundInRoom[_roomNumber] != 1) {
            require(isPlayerAliveInASpecificRoom(msg.sender, _roomNumber), "Player no longer alive");
        }

        require(block.timestamp < roundStartTimeInRoom[_roomNumber] + roundChoosingLengthInRoom[_roomNumber], "Round positioning finished");

        // this block is when sender change positions in a round - first reduce
        if(positionInARoundPerRoom[_roomNumber][msg.sender][currentRoundInRoom[_roomNumber]] == DOWN){
            positionsPerRoundPerRoom[_roomNumber][currentRoundInRoom[_roomNumber]][DOWN]--;
        }else if (positionInARoundPerRoom[_roomNumber][msg.sender][currentRoundInRoom[_roomNumber]] == UP) {
            positionsPerRoundPerRoom[_roomNumber][currentRoundInRoom[_roomNumber]][UP]--;
        }

        // set new value
        positionInARoundPerRoom[_roomNumber][msg.sender][currentRoundInRoom[_roomNumber]] = _position;

        // add number of positions
        if(_position == UP){
            positionsPerRoundPerRoom[_roomNumber][currentRoundInRoom[_roomNumber]][_position]++;
        }else{
            positionsPerRoundPerRoom[_roomNumber][currentRoundInRoom[_roomNumber]][_position]++;
        }

        emit TookAPosition(msg.sender, _roomNumber, currentRoundInRoom[_roomNumber], _position);
    }

    function closeRound(uint _roomNumber) external onlyRoomParticipantes(_roomNumber){
        require(roomStarted[_roomNumber], "Competition not started yet");
        require(!roomFinished[_roomNumber], "Competition finished");
        require(block.timestamp > (roundStartTimeInRoom[_roomNumber] + roundLengthInRoom[_roomNumber]), "Can not close round yet");

        uint currentRound = currentRoundInRoom[_roomNumber];
        uint nextRound = currentRound + 1;

        // getting price
        uint currentPriceFromOracle = priceFeed.rateForCurrency(oracleKeyPerRoom[_roomNumber]);

        finalPricePerRoundPerRoom[_roomNumber][currentRound] = currentPriceFromOracle;
        roundResultPerRoom[_roomNumber][currentRound] = currentPriceFromOracle >= roundTargetPriceInRoom[_roomNumber] ? UP : DOWN;
        roundTargetPriceInRoom[_roomNumber] = currentPriceFromOracle;

        uint winningPositionsPerRound = roundResultPerRoom[_roomNumber][currentRound] == UP ? positionsPerRoundPerRoom[_roomNumber][currentRound][UP] : positionsPerRoundPerRoom[_roomNumber][currentRound][DOWN];
        uint losingPositions = roundResultPerRoom[_roomNumber][currentRound] == DOWN ? positionsPerRoundPerRoom[_roomNumber][currentRound][UP] : positionsPerRoundPerRoom[_roomNumber][currentRound][DOWN];

        if (nextRound <= numberOfRoundsInRoom[_roomNumber] || gameTypeInRoom[_roomNumber] == GameType.LAST_MAN_STANDING){
            // setting total players for next round (round + 1) to be result of position in a previous round
            if(winningPositionsPerRound == 0 && gameTypeInRoom[_roomNumber] == GameType.LAST_MAN_STANDING){
                totalPlayersInARoomInARound[_roomNumber][nextRound] = losingPositions;
            }else{
                totalPlayersInARoomInARound[_roomNumber][nextRound] = winningPositionsPerRound;
            }
        }

        // setting eliminated players to be total players - number of winning players
        if(winningPositionsPerRound == 0 && gameTypeInRoom[_roomNumber] == GameType.LAST_MAN_STANDING){
            eliminatedPerRoundPerRoom[_roomNumber][currentRound] = totalPlayersInARoomInARound[_roomNumber][currentRound] - losingPositions;   
        }else{
            eliminatedPerRoundPerRoom[_roomNumber][currentRound] = totalPlayersInARoomInARound[_roomNumber][currentRound] - winningPositionsPerRound;   
        }

        // if no one is left no need to set values
        if(winningPositionsPerRound > 0 || (winningPositionsPerRound == 0 && gameTypeInRoom[_roomNumber] == GameType.LAST_MAN_STANDING)){
            currentRoundInRoom[_roomNumber] = nextRound;
            targetPricePerRoundPerRoom[_roomNumber][nextRound] = roundTargetPriceInRoom[_roomNumber];
            isReversedPositioningInRoom[_roomNumber] = false;
        }

        // IF number of rounds is limmited and next round is crosses that limmit 
        // OR winning people is less or equal to 1 FINISH game (LIMITED_NUMBER_OF_ROUNDS)
        // OR winning people is equal to 1 FINISH game (LAST_MAN_STANDING)
        if ((nextRound > numberOfRoundsInRoom[_roomNumber] && gameTypeInRoom[_roomNumber] == GameType.LIMITED_NUMBER_OF_ROUNDS)
                || (winningPositionsPerRound <= 1 && gameTypeInRoom[_roomNumber] == GameType.LIMITED_NUMBER_OF_ROUNDS)
                || (winningPositionsPerRound == 1 && gameTypeInRoom[_roomNumber] == GameType.LAST_MAN_STANDING)) {

            roomFinished[_roomNumber] = true;

            // in no one is winner pick from lest round
            if (winningPositionsPerRound == 0) {
                _populateRewardForRoom(_roomNumber, totalPlayersInARoomInARound[_roomNumber][currentRound]);
                emit SplitBetweenLoosers(_roomNumber, currentRound, totalPlayersInARoomInARound[_roomNumber][currentRound]);
            } else{ 
                // there is min 1 winner
                _populateRewardForRoom(_roomNumber, winningPositionsPerRound);
            }

            roomEndTime[_roomNumber] = block.timestamp;
            // first close previous round then royale
            emit RoundClosedInRoom(_roomNumber, currentRound, roundResultPerRoom[_roomNumber][currentRound]);
            emit RoyaleFinishedForRoom(_roomNumber);
        } else {
            // need to reverse result because of isPlayerAliveInASpecificRoom() in positioning a new round so the play can continue
            if(winningPositionsPerRound == 0 && gameTypeInRoom[_roomNumber] == GameType.LAST_MAN_STANDING){
                isReversedPositioningInRoom[_roomNumber] = true;
            }

            roundStartTimeInRoom[_roomNumber] = block.timestamp;
            roundEndTimeInRoom[_roomNumber] = roundStartTimeInRoom[_roomNumber] + roundLengthInRoom[_roomNumber];
            emit RoundClosedInRoom(_roomNumber, currentRound, roundResultPerRoom[_roomNumber][currentRound]);
        }
        
    }

    function claimRewardForRoom(uint _roomNumber) external onlyWinners(_roomNumber){
        require(rewardPerRoom[_roomNumber] > 0, "Reward must be set");
        require(rewardPerPlayerPerRoom[_roomNumber] > 0, "Reward per player must be more then zero");
        require(rewardCollectedPerRoom[_roomNumber][msg.sender] == false, "Player already collected reward");
        require(block.timestamp < (roomEndTime[_roomNumber] + climeTimePerRoom[_roomNumber]), "Time for reward claiming expired");

        // set collected -> true
        rewardCollectedPerRoom[_roomNumber][msg.sender] = true;
        unclaimedRewardPerRoom[_roomNumber] = unclaimedRewardPerRoom[_roomNumber].sub(rewardPerPlayerPerRoom[_roomNumber]);
        // transfering rewardPerPlayer
        rewardToken.transfer(msg.sender, rewardPerPlayerPerRoom[_roomNumber]);
        // emit event
        emit RewardClaimed(_roomNumber, msg.sender, rewardPerPlayerPerRoom[_roomNumber]);
    }

    /* ========== INTERNALS ========== */

    function _signUpOwnerIntoRoom(address _owner, uint _roomNumber) internal {
        
        numberOfPlayersInRoom[_roomNumber]++;
        playerSignedUpPerRoom[_roomNumber][_owner] = block.timestamp;
        playersInRoom[_roomNumber].push(_owner);

        _buyIn(_owner, _roomNumber ,buyInPerPlayerRerRoom[_roomNumber]);

        emit SignedUpInARoom(_owner, _roomNumber);

    }

    function _populateRewardForRoom(uint _roomNumber, uint _numberOfWinners) internal {
        rewardPerPlayerPerRoom[_roomNumber] = rewardPerRoom[_roomNumber].div(_numberOfWinners);
    }

    function _buyIn(address _sender, uint _roomNumber, uint _amount) internal {

        rewardToken.transferFrom(_sender, address(this), _amount);
        rewardPerRoom[_roomNumber] += _amount;

        emit BuyIn(_sender, _amount, _roomNumber);
    }

    function _isPlayerAliveInASpecificRoomReverseOrder(address player, uint _roomNumber) internal view returns (bool) {
        if (roundResultPerRoom[_roomNumber][currentRoundInRoom[_roomNumber] - 1] == DOWN) {
            return positionInARoundPerRoom[_roomNumber][player][currentRoundInRoom[_roomNumber] - 1] == UP;
        } else if (roundResultPerRoom[_roomNumber][currentRoundInRoom[_roomNumber] - 1] == UP) {
            return positionInARoundPerRoom[_roomNumber][player][currentRoundInRoom[_roomNumber] - 1] == DOWN;
        }else{
            return false;
        }
    }

    function _isPlayerAliveInASpecificRoomNormalOrder(address player, uint _roomNumber) internal view returns (bool) {
        if (currentRoundInRoom[_roomNumber] > 1) {
            return (positionInARoundPerRoom[_roomNumber][player][currentRoundInRoom[_roomNumber] - 1] == roundResultPerRoom[_roomNumber][currentRoundInRoom[_roomNumber] - 1]);
        } else {
            return playerSignedUpPerRoom[_roomNumber][player] != 0;
        }
    
    }

    /* ========== VIEW ========== */

    function isAssetAllowed(bytes32 _oracleKey) public view returns (bool) {
        for (uint256 i = 0; i < allowedAssets.length; i++) {
            if(allowedAssets[i] == _oracleKey){
                return true;
            }
        }
        return false;
    }

    function isPlayerAliveInASpecificRoom(address player, uint _roomNumber) public view returns (bool) {
        if (!isReversedPositioningInRoom[_roomNumber]) {
            return _isPlayerAliveInASpecificRoomNormalOrder(player, _roomNumber);
        } else {
            return _isPlayerAliveInASpecificRoomReverseOrder(player, _roomNumber);
        }
    }

    function isPlayerAllowed(address _player, uint _roomNumber) public view returns (bool) {
        return playerCanPlayInRoom[_roomNumber][_player];
    }

    function isPlayerOwner(address _player, uint _roomNumber) public view returns (bool) {
        return _player == roomOwner[_roomNumber];
    }

    function canStartRoyaleInRoom(uint _roomNumber) public view returns (bool) {
        return block.timestamp > (roomCreationTime[_roomNumber] + roomSignUpPeriod[_roomNumber]) && 
            !roomStarted[_roomNumber];
    }

    function canCloseRoundInRoom(uint _roomNumber) public view returns (bool) {
        return roomStarted[_roomNumber] && 
            !roomFinished[_roomNumber] && 
            block.timestamp > (roundStartTimeInRoom[_roomNumber] + roundLengthInRoom[_roomNumber]);
    }

    /* ========== ROOM MANAGEMENT ========== */

    function setBuyInAmount(
        uint _roomNumber, 
        uint _buyInAmount
        ) public canChangeRoomVariables(_roomNumber) {      
        require(_buyInAmount >= minBuyIn, "Buy in must be greather then minimum");
        require(buyInPerPlayerRerRoom[_roomNumber] != _buyInAmount, "Same amount");
        
        // if _buyInAmount is increased 
        if(_buyInAmount > buyInPerPlayerRerRoom[_roomNumber]){
            
            require(rewardToken.allowance(msg.sender, address(this)) >= _buyInAmount.sub(buyInPerPlayerRerRoom[_roomNumber]), "No allowance.");
            
            _buyIn(msg.sender, _roomNumber ,_buyInAmount - buyInPerPlayerRerRoom[_roomNumber]);
            buyInPerPlayerRerRoom[_roomNumber] = _buyInAmount;
        // or decreased
        }else{
            uint difference = buyInPerPlayerRerRoom[_roomNumber].sub(_buyInAmount);
            rewardPerRoom[_roomNumber]= rewardPerRoom[_roomNumber].sub(difference);
            buyInPerPlayerRerRoom[_roomNumber] = _buyInAmount;
            rewardToken.transfer(msg.sender, difference);
        }

        emit BuyInAmountChanged(_roomNumber, _buyInAmount);
    }

    function setRoundLength(
        uint _roomNumber, 
        uint _roundLength
        ) public canChangeRoomVariables(_roomNumber) {
        require(_roundLength >= minRoundTime, "Round length lower then minimum");
        require(_roundLength >= roundChoosingLengthInRoom[_roomNumber] + offsetBeteweenChooseAndEndRound, "Offset lower then minimum");
        
        roundLengthInRoom[_roomNumber] = _roundLength;

        emit NewRoundLength(_roomNumber, _roundLength);

    }

    function setClaimTimePerRoom(
        uint _roomNumber, 
        uint _claimTime
        ) public canChangeRoomVariables(_roomNumber) {
        require(_claimTime >= minClaimTime, "Claim time lower then minimum");
        
        climeTimePerRoom[_roomNumber] = _claimTime;
        
        emit NewClaimTime(_roomNumber, _claimTime);

    }

    function setRoomSignUpPeriod(
        uint _roomNumber, 
        uint _roomSignUpPeriod
        ) public canChangeRoomVariables(_roomNumber) {
        require(_roomSignUpPeriod >= minTimeSignUp, "Sign in period lower then minimum");
        
        roomSignUpPeriod[_roomNumber] = _roomSignUpPeriod;

        emit NewRoomSignUpPeriod(_roomNumber, _roomSignUpPeriod);

    }

    function setNumberOfRoundsInRoom(
        uint _roomNumber, 
        uint _numberOfRoundsInRoom
        ) public canChangeRoomVariables(_roomNumber) {
        require(_numberOfRoundsInRoom > minNumberOfRounds, "Must be more then minimum");
        
        numberOfRoundsInRoom[_roomNumber] = _numberOfRoundsInRoom;

        emit NewNumberOfRounds(_roomNumber, _numberOfRoundsInRoom);
    }

    function setRoundChoosingLength(
        uint _roomNumber, 
        uint _roundChoosingLength
        ) public canChangeRoomVariables(_roomNumber) {
        require(_roundChoosingLength >= minChooseTime, "Round chosing lower then minimum");
        require(roundLengthInRoom[_roomNumber] >= _roundChoosingLength + offsetBeteweenChooseAndEndRound, "Round length lower then minimum");
        
        roundChoosingLengthInRoom[_roomNumber] = _roundChoosingLength;

        emit NewRoundChoosingLength(_roomNumber, _roundChoosingLength);
    }

    function setOracleKey(
        uint _roomNumber, 
        bytes32 _oracleKey
        ) public canChangeRoomVariables(_roomNumber) {
        require(isAssetAllowed(_oracleKey), "Not allowed assets");
        
        oracleKeyPerRoom[_roomNumber] = _oracleKey;

        emit NewOracleKeySetForRoom(_roomNumber, _oracleKey);

    }

    function setNewAllowedPlayersPerRoomClosedRoom(
        uint _roomNumber, 
        address[] memory _alowedPlayers
        ) public canChangeRoomVariables(_roomNumber) {
        require(roomTypePerRoom[_roomNumber] == RoomType.CLOSED && _alowedPlayers.length > 0, "Room need to be closed and  allowed players not empty");

        // setting players - no play
        for (uint i = 0; i < alowedPlayersPerRoom[roomNumberCounter].length; i++) {
            playerCanPlayInRoom[roomNumberCounter][alowedPlayersPerRoom[roomNumberCounter][i]] = false;
        }

        // setting players that can play
        alowedPlayersPerRoom[_roomNumber] = _alowedPlayers;
        alowedPlayersPerRoom[_roomNumber].push(msg.sender);
        numberOfAlowedPlayersInRoom[_roomNumber] = alowedPlayersPerRoom[_roomNumber].length;

        for (uint i = 0; i < alowedPlayersPerRoom[_roomNumber].length; i++) {
            playerCanPlayInRoom[_roomNumber][alowedPlayersPerRoom[_roomNumber][i]] = true;
        }

        emit NewPlayersAllowed(_roomNumber, numberOfAlowedPlayersInRoom[_roomNumber]);

    }

    function addAllowedPlayerPerRoomClosedRoom(
        uint _roomNumber, 
        address _alowedPlayer
        ) public canChangeRoomVariables(_roomNumber) {
        require(roomTypePerRoom[_roomNumber] == RoomType.CLOSED, "Type of room needs to be closed");
        require(!playerCanPlayInRoom[_roomNumber][_alowedPlayer], "Already allowed");

        alowedPlayersPerRoom[_roomNumber].push(_alowedPlayer);
        playerCanPlayInRoom[_roomNumber][_alowedPlayer] = true;
        numberOfAlowedPlayersInRoom[_roomNumber]++;

        emit NewPlayerAddedIntoRoom(_roomNumber, _alowedPlayer);
    }

    function setAmuontOfPlayersInOpenRoom(
        uint _roomNumber, 
        uint _amuontOfPlayersinRoom
        ) public canChangeRoomVariables(_roomNumber) {
        require(roomTypePerRoom[_roomNumber] == RoomType.OPEN && _amuontOfPlayersinRoom > 1, "Must be more then one player and open room");
        
        numberOfAlowedPlayersInRoom[_roomNumber] = _amuontOfPlayersinRoom;
        
        emit NewAmountOfPlayersInOpenRoom(_roomNumber, _amuontOfPlayersinRoom);

    }

    function deleteRoom(
        uint _roomNumber
        ) public canChangeRoomVariables(_roomNumber) {
        require(roomPublished[_roomNumber], "Already deleted");
        
        roomPublished[_roomNumber] = false;
        rewardToken.safeTransfer(msg.sender, buyInPerPlayerRerRoom[_roomNumber]);

        emit RoomDeleted(_roomNumber, msg.sender);

    }

    /* ========== CONTRACT MANAGEMENT ========== */

    function addAsset(bytes32 asset) public onlyOwner {
        allowedAssets.push(asset);
    }

    function setPriceFeed(IPriceFeed _priceFeed) public onlyOwner {
        priceFeed = _priceFeed;
    }

    function setMinTimeSignUp(uint _minTimeSignUp) public onlyOwner {
        minTimeSignUp = _minTimeSignUp;
    }

    function setMinRoundTime(uint _minRoundTime) public onlyOwner {
        minRoundTime = _minRoundTime;
    }

    function setMinChooseTime(uint _minChooseTime) public onlyOwner {
        minChooseTime = _minChooseTime;
    }

    function setOffsetBeteweenChooseAndEndRound(uint _offsetBeteweenChooseAndEndRound) public onlyOwner {
        offsetBeteweenChooseAndEndRound = _offsetBeteweenChooseAndEndRound;
    }

    function setMinClaimTime(uint _minClaimTime) public onlyOwner {
        minClaimTime = _minClaimTime;
    }

    function setMaxPlayersInClosedRoom(uint _maxPlayersInClosedRoom) public onlyOwner {
        maxPlayersInClosedRoom = _maxPlayersInClosedRoom;
    }

    function setMinBuyIn(uint _minBuyIn) public onlyOwner {
        minBuyIn = _minBuyIn;
    }

    function claimUnclaimedRewards(address _treasuryAddress, uint _roomNumber) external onlyOwner {
        require(block.timestamp > roomEndTime[_roomNumber] + climeTimePerRoom[_roomNumber], "Time for reward claiming not expired");
        require(unclaimedRewardPerRoom[_roomNumber] > 0, "Nothing to claim");

        uint unclaimedAmount = unclaimedRewardPerRoom[_roomNumber];
        unclaimedRewardPerRoom[_roomNumber] = 0;
        rewardToken.transfer(_treasuryAddress, unclaimedAmount);

        emit UnclaimedRewardClaimed(_roomNumber, _treasuryAddress, unclaimedAmount);
    }

    function pullFunds(address payable account) external onlyOwner {
        rewardToken.safeTransfer(account, rewardToken.balanceOf(address(this)));
    }

    /* ========== MODIFIERS ========== */

    modifier canChangeRoomVariables(uint _roomNumber) {
        require(msg.sender == roomOwner[_roomNumber], "You are not owner of room.");
        require(!playerStartedSignUp[_roomNumber], "Player already sign up for room, no change allowed");
        require(roomPublished[_roomNumber], "Deleted room");
        _;
    }

    modifier onlyRoomParticipantes(uint _roomNumber) {
        require(playerSignedUpPerRoom[_roomNumber][msg.sender] != 0 , "You are not room participant");
        _;
    }

    modifier onlyWinners (uint _roomNumber) {
        require(roomFinished[_roomNumber], "Royale must be finished!");
        require(isPlayerAliveInASpecificRoom(msg.sender, _roomNumber) == true, "Player is not alive");
        _;
    }

    /* ========== EVENTS ========== */

    event RoomCreated(address _owner, uint _roomNumberCounter, RoomType _roomType, GameType _gameType);
    event SignedUpInARoom(address _account, uint _roomNumber);
    event RoyaleStartedForRoom(uint _roomNumber);
    event TookAPosition(address _user, uint _roomNumber, uint _round, uint _position);
    event RoundClosedInRoom(uint _roomNumber, uint _round, uint _result);
    event SplitBetweenLoosers(uint _roomNumber, uint _round, uint _numberOfPlayers);
    event RoyaleFinishedForRoom(uint _roomNumber);
    event BuyIn(address _user, uint _amount, uint _roomNumber);
    event RewardClaimed(uint _roomNumber, address _winner, uint _reward);
    event NewAmountOfPlayersInOpenRoom(uint _roomNumber, uint _amuontOfPlayersinRoom);
    event NewPlayerAddedIntoRoom(uint _roomNumber, address _alowedPlayer);
    event NewPlayersAllowed(uint _roomNumber, uint _numberOfPlayers);
    event NewOracleKeySetForRoom(uint _roomNumber, bytes32 _oracleKey);
    event BuyInAmountChanged(uint _roomNumber, uint _buyInAmount);
    event NewRoundLength(uint _roomNumber, uint _roundLength);
    event NewRoundChoosingLength(uint _roomNumber, uint _roundChoosingLength);
    event NewRoomSignUpPeriod(uint _roomNumber, uint _signUpPeriod);
    event NewNumberOfRounds(uint _roomNumber, uint _numberRounds);
    event NewClaimTime(uint _roomNumber, uint _claimTime);
    event UnclaimedRewardClaimed(uint _roomNumber, address account, uint reward);
    event RoomDeleted(uint _roomNumber, address _roomOwner);
}