// SPDX-License-Identifier: MIT

pragma solidity >=0.5.16;

interface IAddressManager {
    struct Addresses {
        address safeBox;
        address referrals;
        address stakingThales;
        address multiCollateralOnOffRamp;
        address pyth;
        address speedMarketsAMM;
    }

    function safeBox() external view returns (address);

    function referrals() external view returns (address);

    function stakingThales() external view returns (address);

    function multiCollateralOnOffRamp() external view returns (address);

    function pyth() external view returns (address);

    function speedMarketsAMM() external view returns (address);

    function getAddresses() external view returns (Addresses memory);

    function getAddresses(string[] calldata _contractNames) external view returns (address[] memory contracts);

    function getAddress(string memory _contractName) external view returns (address contract_);

    function checkIfContractExists(string memory _contractName) external view returns (bool contractExists);
}
