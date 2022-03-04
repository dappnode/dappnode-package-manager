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
    /**
     * @notice String representing the version. i.e. '0.1.4', '2.0.0-beta.0'
     */
    string version;
    /**
     * @notice ContentURI following ENSIP-7 Contenthash field specification (formerly EIP-1577).
     * Refer to https://docs.ens.domains/ens-improvement-proposals/ensip-7-contenthash-field
     * Examples:
     * - 'ipfs://QmRAQB6YaCyidP37UdDnjFY5vQuiBrcqdyoW1CuDgwxkD'
     * - 'bzz://d1de9994b4d039f6548d191eb26786769f580809256b4685ef316805265ea162'
     */
    string[] contentURIs;
  }

  // string public name;
  uint256 internal nextIdx;
  mapping(uint256 => Version) public versions;
  mapping(bytes32 => uint256) public versionIdForSemantic;

  /**
   * @notice Algorithm to sort versions and derive "latest"
   * - 0: Semver
   * - 1: Alphabetical
   * TBD
   */
  uint256 public versionSorting;

  event NewVersion(uint256 versionId, string version, string[] contentURIs);

  constructor() initializer {}

  /**
   * @dev Initialize can only be called once.
   * @notice Initialize this Repo
   */
  function initialize(address _admin) public initializer {
    __AccessControlEnumerable_init();

    nextIdx = 1;

    _setupRole(DEFAULT_ADMIN_ROLE, _admin);
    _setupRole(CREATE_VERSION_ROLE, _admin);
  }

  /**
   * @notice Create new version with contract `_contractAddress` and content `@fromHex(_contentURI)`
   * @param _version Refer to Version.version for details
   * @param _contentURIs Refer to Version.contentURIs for details
   */
  function newVersion(string memory _version, string[] memory _contentURIs) external onlyRole(CREATE_VERSION_ROLE) {
    require(_contentURIs.length > 0, "EMPTY_CONTENTURIS");

    // Can only publish each version string once
    bytes32 versionHash = semanticVersionHash(_version);
    require(versionIdForSemantic[versionHash] == 0, "REPO_EXISTENT_VERSION");

    uint256 versionId = nextIdx++;
    versions[versionId] = Version(_version, _contentURIs);
    versionIdForSemantic[versionHash] = versionId;

    emit NewVersion(versionId, _version, _contentURIs);
  }

  /**
   * @notice Set the algorithm to sort versions and derive "latest"
   * @param _versionSorting New version sorting algorithm
   */
  function setVersionSorting(uint256 _versionSorting) external onlyRole(CREATE_VERSION_ROLE) {
    versionSorting = _versionSorting;
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
