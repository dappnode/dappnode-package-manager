// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlEnumerableUpgradeable.sol";

/**
 * Contract for mapping versions to contentURIs (i.e. IPFS hashes)
 *
 * CREATE_VERSION_ROLE allows adding new versions.
 */
contract Repo is Initializable, AccessControlEnumerableUpgradeable {
  bytes32 public constant CREATE_VERSION_ROLE = keccak256("CREATE_VERSION_ROLE");

  struct Version {
    string version;
    string contentURI;
  }

  // string public name;
  uint256 internal nextIdx;
  mapping(uint256 => Version) public versions;
  mapping(bytes32 => uint256) public versionIdForSemantic;

  event NewVersion(uint256 versionId, string version, string contentURI);

  constructor() initializer {}

  /**
   * @dev Initialize can only be called once.
   * @notice Initialize this Repo
   */
  function initialize(address _admin) public initializer {
    nextIdx = 1;

    _setupRole(DEFAULT_ADMIN_ROLE, _admin);
    _setupRole(CREATE_VERSION_ROLE, _admin);
  }

  /**
   * @notice Create new version with contract `_contractAddress` and content `@fromHex(_contentURI)`
   * @param _version Version string (i.e. semantic version) for new repo version
   * @param _contentURI External URI for fetching new version's content
   */
  function newVersion(string memory _version, string memory _contentURI) external onlyRole(CREATE_VERSION_ROLE) {
    // Can only publish each version string once
    bytes32 versionHash = semanticVersionHash(_version);
    require(versionIdForSemantic[versionHash] == 0, "REPO_EXISTENT_VERSION");

    uint256 versionId = nextIdx++;
    versions[versionId] = Version(_version, _contentURI);
    versionIdForSemantic[versionHash] = versionId;

    emit NewVersion(versionId, _version, _contentURI);
  }

  function getLastPublished() public view returns (Version memory) {
    return getByVersionId(nextIdx - 1);
  }

  function getBySemanticVersion(string memory _version) public view returns (Version memory) {
    return getByVersionId(versionIdForSemantic[semanticVersionHash(_version)]);
  }

  function getByVersionId(uint256 _versionId) public view returns (Version memory) {
    require(_versionId > 0 && _versionId < nextIdx, "REPO_INEXISTENT_VERSION");
    return versions[_versionId];
  }

  function getVersionsCount() public view returns (uint256) {
    return nextIdx - 1;
  }

  function semanticVersionHash(string memory version) internal pure returns (bytes32) {
    return keccak256(abi.encodePacked(version));
  }
}
