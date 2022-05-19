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
   * @notice Map of tag hashes to versionId. Allows to map "latest" -> "v1.0.0".
   * use getTag() for querying and setTag() for setting.
   */
  mapping(bytes32 => uint256) internal versionIdByTag;

  event NewVersion(uint256 versionId, string version, string[] contentURIs);
  event NewTag(string tag, uint256 versionId);

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
  function newVersion(
    string memory _version,
    string[] memory _contentURIs,
    string[] memory _tags
  ) external onlyRole(CREATE_VERSION_ROLE) {
    require(_contentURIs.length > 0, "EMPTY_CONTENTURIS");

    // Can only publish each version string once
    bytes32 versionHash = stringHash(_version);
    require(versionIdForSemantic[versionHash] == 0, "REPO_EXISTENT_VERSION");

    uint256 versionId = nextIdx++;
    versions[versionId] = Version(_version, _contentURIs);
    versionIdForSemantic[versionHash] = versionId;

    for (uint256 i = 0; i < _tags.length; i++) {
      _setTag(_tags[i], versionId);
    }

    emit NewVersion(versionId, _version, _contentURIs);
  }

  /**
   * @notice Set a tag to an existing version.
   * @param _tag tag to set.
   * @param _versionId version to point _tag to.
   */
  function setTag(string memory _tag, uint256 _versionId) external onlyRole(CREATE_VERSION_ROLE) {
    require(_versionId > 0 && _versionId < nextIdx, "REPO_INEXISTENT_VERSION");
    _setTag(_tag, _versionId);
  }

  function getTag(string memory _tag) public view returns (Version memory) {
    return getByVersionId(versionIdByTag[stringHash(_tag)]);
  }

  function getLastPublished() public view returns (Version memory) {
    return getByVersionId(nextIdx - 1);
  }

  function getBySemanticVersion(string memory _version) public view returns (Version memory) {
    return getByVersionId(versionIdForSemantic[stringHash(_version)]);
  }

  function getByVersionId(uint256 _versionId) public view returns (Version memory) {
    require(_versionId > 0 && _versionId < nextIdx, "REPO_INEXISTENT_VERSION");
    return versions[_versionId];
  }

  function getVersionsCount() public view returns (uint256) {
    return nextIdx - 1;
  }

  function _setTag(string memory _tag, uint256 _versionId) internal {
    bytes32 tagHash = stringHash(_tag);
    versionIdByTag[tagHash] = _versionId;

    emit NewTag(_tag, _versionId);
  }

  function stringHash(string memory version) internal pure returns (bytes32) {
    return keccak256(abi.encodePacked(version));
  }
}
