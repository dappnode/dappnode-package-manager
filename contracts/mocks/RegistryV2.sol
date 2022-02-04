// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../Registry.sol";

/**
 * This contract is only used for a upgradability test
 */
contract RegistryV2Mock is Registry {
    // upgradability test
    uint256 public version;

    // upgradability test
    function setVersion() public {
        version = 2;
    }

    function getVersion() external view returns (uint256) {
        return version;
    }

}
