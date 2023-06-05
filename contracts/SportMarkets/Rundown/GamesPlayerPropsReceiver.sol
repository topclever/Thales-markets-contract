// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

// internal
import "../../utils/proxy/solidity-0.8.0/ProxyOwned.sol";
import "../../utils/proxy/solidity-0.8.0/ProxyPausable.sol";

// interface
import "../../interfaces/IGamesPlayerProps.sol";
import "../../interfaces/ITherundownConsumer.sol";

/// @title Recieve player props
/// @author gruja
contract GamesPlayerPropsReceiver is Initializable, ProxyOwned, ProxyPausable {
    IGamesPlayerProps public playerProps;
    ITherundownConsumer public consumer;

    mapping(address => bool) public whitelistedAddresses;
    mapping(uint => mapping(uint8 => bool)) public isValidOptionPerSport;
    mapping(uint => uint) public numberOfOptionsPerSport;

    /// @notice public initialize proxy method
    /// @param _owner future owner of a contract
    function initialize(
        address _owner,
        address _consumer,
        address _playerProps,
        address[] memory _whitelistAddresses
    ) public initializer {
        setOwner(_owner);
        consumer = ITherundownConsumer(_consumer);
        playerProps = IGamesPlayerProps(_playerProps);

        for (uint i; i < _whitelistAddresses.length; i++) {
            whitelistedAddresses[_whitelistAddresses[i]] = true;
        }
    }

    /* ========== PLAYER PROPS R. MAIN FUNCTIONS ========== */

    /// @notice receive player props and create markets
    /// @param _gameIds for which gameids market is created (Boston vs Miami etc.)
    /// @param _playerIds for which playerids market is created (12345, 678910 etc.)
    /// @param _options for which options market is created (points, assists, etc.)
    /// @param _names for which player names market is created (Jimmy Buttler etc.)
    /// @param _lines number of points assists per option
    /// @param _linesOdds odds for lines
    function fulfillPlayerProps(
        bytes32[] memory _gameIds,
        bytes32[] memory _playerIds,
        uint8[] memory _options,
        string[] memory _names,
        uint16[] memory _lines,
        int24[] memory _linesOdds
    ) external isAddressWhitelisted {
        for (uint i = 0; i < _gameIds.length; i++) {
            uint sportId = consumer.sportsIdPerGame(_gameIds[i]);
            if (isValidOptionPerSport[sportId][_options[i]]) {
                IGamesPlayerProps.PlayerProps memory player = _castToPlayerProps(
                    i,
                    _gameIds[i],
                    _playerIds[i],
                    _options[i],
                    _names[i],
                    _lines[i],
                    _linesOdds
                );
                // game needs to be fulfilled and market needed to be created
                if (consumer.gameFulfilledCreated(_gameIds[i]) && consumer.marketPerGameId(_gameIds[i]) != address(0)) {
                    playerProps.obtainPlayerProps(player, sportId);
                }
            }
        }
    }

    /// @notice receive resolve properties for markets
    /// @param _gameIds for which gameids market is resolving (Boston vs Miami etc.)
    /// @param _playerIds for which playerids market is resolving (12345, 678910 etc.)
    /// @param _numOfOptionsPerPlayers number of options per player (Jimmy buttler - 2 assists and points)
    /// @param _options options (assists, points etc.)
    /// @param _scores number of points assists etc. which player had
    function fulfillResultOfPlayerProps(
        bytes32[] memory _gameIds,
        bytes32[] memory _playerIds,
        uint8[] memory _numOfOptionsPerPlayers,
        uint8[] memory _options,
        uint16[] memory _scores
    ) external isAddressWhitelisted {
        uint lastProcessedNumber = 0;
        for (uint i = 0; i < _gameIds.length; i++) {
            uint sportId = consumer.sportsIdPerGame(_gameIds[i]);
            if (isValidOptionPerSport[sportId][_options[i]]) {
                IGamesPlayerProps.PlayerPropsResolver memory playerResult = _castToPlayerPropsResolver(
                    _gameIds[i],
                    _playerIds[i],
                    _options,
                    _scores,
                    _numOfOptionsPerPlayers[i],
                    lastProcessedNumber
                );
                lastProcessedNumber = lastProcessedNumber + _numOfOptionsPerPlayers[i];
                // game needs to be resolved or canceled
                if (consumer.isGameResolvedOrCanceled(_gameIds[i])) {
                    playerProps.resolvePlayerProps(playerResult);
                }
            }
        }
    }

    /* ========== INTERNAL FUNCTIONS ========== */

    function _castToPlayerProps(
        uint index,
        bytes32 _gameId,
        bytes32 _playerId,
        uint8 _option,
        string memory _name,
        uint16 _line,
        int24[] memory _linesOdds
    ) internal returns (IGamesPlayerProps.PlayerProps memory) {
        return
            IGamesPlayerProps.PlayerProps(
                _gameId,
                _playerId,
                _option,
                _name,
                _line,
                _linesOdds[index * 2],
                _linesOdds[index * 2 + 1]
            );
    }

    function _castToPlayerPropsResolver(
        bytes32 _gameId,
        bytes32 _playerId,
        uint8[] memory _options,
        uint16[] memory _scores,
        uint _numOfOptionsPerPlayers,
        uint _lastProcessed
    ) internal returns (IGamesPlayerProps.PlayerPropsResolver memory) {
        uint8[] memory options = new uint8[](_numOfOptionsPerPlayers);
        uint16[] memory scores = new uint16[](_numOfOptionsPerPlayers);
        for (uint i = 0; i < _numOfOptionsPerPlayers; i++) {
            options[i] = _options[_lastProcessed + i];
            scores[i] = _scores[_lastProcessed + i];
        }
        return IGamesPlayerProps.PlayerPropsResolver(_gameId, _playerId, options, scores);
    }

    /* ========== OWNER MANAGEMENT FUNCTIONS ========== */

    /// @notice sets valid/invalid options per sport
    /// @param _sportId sport id
    /// @param _options options ids
    /// @param _flag invalid/valid
    function setValidOptionsPerSport(
        uint _sportId,
        uint8[] memory _options,
        bool _flag
    ) external onlyOwner {
        require(consumer.supportedSport(_sportId), "SportId is not supported");
        for (uint index = 0; index < _options.length; index++) {
            // only if current flag is different, if same skip it
            if (isValidOptionPerSport[_sportId][_options[index]] != _flag) {
                // add number of options per sport
                numberOfOptionsPerSport[_sportId] = _flag
                    ? numberOfOptionsPerSport[_sportId] + 1
                    : numberOfOptionsPerSport[_sportId] - 1;
                // set flag
                isValidOptionPerSport[_sportId][_options[index]] = _flag;
                emit IsValidOptionPerSport(_sportId, _options[index], _flag);
            }
        }
    }

    /// @notice sets the consumer contract address, which only owner can execute
    /// @param _consumer address of a consumer contract
    function setConsumerAddress(address _consumer) external onlyOwner {
        require(_consumer != address(0), "Invalid address");
        consumer = ITherundownConsumer(_consumer);
        emit NewConsumerAddress(_consumer);
    }

    /// @notice sets the PlayerProps contract address, which only owner can execute
    /// @param _playerProps address of a player props contract
    function setPlayerPropsAddress(address _playerProps) external onlyOwner {
        require(_playerProps != address(0), "Invalid address");
        playerProps = IGamesPlayerProps(_playerProps);
        emit NewPlayerPropsAddress(_playerProps);
    }

    /// @notice adding/removing whitelist address depending on a flag
    /// @param _whitelistAddresses addresses that needed to be whitelisted/ ore removed from WL
    /// @param _flag adding or removing from whitelist (true: add, false: remove)
    function addToWhitelist(address[] memory _whitelistAddresses, bool _flag) external onlyOwner {
        require(_whitelistAddresses.length > 0, "Whitelisted addresses cannot be empty");
        for (uint256 index = 0; index < _whitelistAddresses.length; index++) {
            require(_whitelistAddresses[index] != address(0), "Can't be zero address");
            // only if current flag is different, if same skip it
            if (whitelistedAddresses[_whitelistAddresses[index]] != _flag) {
                whitelistedAddresses[_whitelistAddresses[index]] = _flag;
                emit AddedIntoWhitelist(_whitelistAddresses[index], _flag);
            }
        }
    }

    /* ========== MODIFIERS ========== */

    modifier isAddressWhitelisted() {
        require(whitelistedAddresses[msg.sender], "Whitelisted address");
        _;
    }

    /* ========== EVENTS ========== */

    event NewPlayerPropsAddress(address _playerProps);
    event NewConsumerAddress(address _consumer);
    event AddedIntoWhitelist(address _whitelistAddress, bool _flag);
    event IsValidOptionPerSport(uint _sport, uint8 _option, bool _flag);
}
