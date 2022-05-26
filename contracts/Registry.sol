// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlEnumerableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/ClonesUpgradeable.sol";
import "./Repo.sol";

/**
 * Registry is the single authority for
 * - assign names to packages within a registry
 * - assign package statuses: visible, active, validated, banned, etc
 * - basic priorization between packages in the registry in the form of a sorted non-exhaustive list
 */
contract Registry is Initializable, AccessControlEnumerableUpgradeable {
  bytes32 public constant ADD_PACKAGE_ROLE = keccak256("ADD_PACKAGE_ROLE");
  bytes32 public constant SET_STATUS_ROLE = keccak256("SET_STATUS_ROLE");
  // This role should be used only for extreme cirumstances since it breaks the immutability of packages.
  // If this Registry is properly mantain this role should be burned to ensure such immutability.
  bytes32 public constant SET_REPO_ROLE = keccak256("SET_REPO_ROLE");
  bytes32 public constant SET_LIST_ROLE = keccak256("SET_LIST_ROLE");

  /**
   * @dev Package static data and status
   */
  struct Package {
    /**
     * @dev Bitfield with status flags, TBD
     * 0 - visible: Display in a public list. Can be set to false for early stage
     *     packages or while testing.
     * 1 - validated: The quality of this package has been validated. Useful for a
     *     governing authority to attest the package.
     * 2 - banned: This package is damaging in some way and must not be installed
     *     nor showed. Useful for a governing authority to attest the package and
     *     override `visible` which may be controlled by the developer.
     */
    uint64 flags;
    /**
     * @dev Address of the Repo contract
     * TODO: Consider making it generic to non blockchain sources
     */
    address repo;
    /**
     * @dev Name of the package. For example: "geth", or "prysm".
     * For short strings, only takes a single storage 32 bytes slot.
     */
    string name;
  }

  /**
   * @dev Name to identify this registry, i.e. 'dnp.dappnode.eth'
   */
  string public registryName;
  address public repoImplementation;

  uint64 internal nextIdx;
  /**
   * @dev Bytes per list item in packed bytes `packageList`.
   * Refer to `packageList` for examples
   */
  uint64 public bytesPerListItem;
  /**
   * @dev Extension logic to ADD_PACKAGE_ROLE. If true any address can add package.
   */
  bool public addPackageAnyAddress;
  /**
   * @dev Map of packages by sequential indexes to allow iterating
   * packageIdx => Package
   */
  mapping(uint256 => Package) public packages;
  /**
   * @dev Map of package nameHash to packageIdx to ensure name uniqueness
   * packageIdx => Package
   */
  mapping(bytes32 => uint256) public packageIdxByName;

  /**
   * @dev Compact list of packageIdx'es in some order. This list may signal
   * ordering for quality, relevance, etc.
   *
   * For example, to represent the list [1,2]:
   * | bytesPerListItem | packageList |
   * | ---------------- | ----------- |
   * | 1                | 0x0102      |
   * | 2                | 0x00010002  |
   *
   * This allows to support very big registries while keeping small lists cheap.
   */
  bytes public packageList;

  event AddPackage(uint256 packageIdx, string name, address repo);
  event UpdateStatus(uint256 packageIdx, uint64 flags);
  event UpdateRepo(uint256 packageIdx, address repo);

  /**
   * @param _registryName Name to identify this registry, i.e. 'dnp.dappnode.eth'
   */
  function initialize(string memory _registryName) public initializer {
    __AccessControlEnumerable_init();

    registryName = _registryName;
    nextIdx = 1;
    bytesPerListItem = 1;

    repoImplementation = address(new Repo());

    _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
    _setupRole(ADD_PACKAGE_ROLE, msg.sender);
    _setupRole(SET_STATUS_ROLE, msg.sender);
    _setupRole(SET_LIST_ROLE, msg.sender);
    _setupRole(SET_REPO_ROLE, msg.sender);
  }

  /**
   * @notice Create new repo in registry with `_name`
   * @param _name Repo name, must be ununsed
   * @param _dev Address that will be given permission to create versions
   * @param _flags Initial status of the package
   */
  function newPackage(
    string memory _name,
    address _dev,
    uint64 _flags
  ) external onlyAddPackageRole returns (Repo) {
    Repo repo = Repo(ClonesUpgradeable.clone(repoImplementation));

    repo.initialize(_dev);

    _addPackage(_name, address(repo), _flags);

    return repo;
  }

  /**
   * @notice Create new repo in registry with `_name`
   * @param _name Repo name, must be ununsed
   * @param _dev Address that will be given permission to create versions
   */
  function newPackageWithVersion(
    string memory _name,
    address _dev,
    uint64 flags,
    string calldata _version,
    string[] calldata _contentURIs,
    string[] calldata _tags
  ) external onlyAddPackageRole returns (Repo) {
    Repo repo = Repo(ClonesUpgradeable.clone(repoImplementation));

    // Registry must have permissions to create the first version
    repo.initialize(address(this));

    repo.newVersion(_version, _contentURIs, _tags);

    // Revoke permissions and grant to dev
    repo.grantRole(repo.DEFAULT_ADMIN_ROLE(), _dev);
    repo.grantRole(repo.CREATE_VERSION_ROLE(), _dev);
    repo.renounceRole(repo.DEFAULT_ADMIN_ROLE(), address(this));
    repo.renounceRole(repo.CREATE_VERSION_ROLE(), address(this));

    _addPackage(_name, address(repo), flags);

    return repo;
  }

  /**
   * @notice Add an already deployed repo to the registry
   */
  function addPackage(
    string memory _name,
    address _repo,
    uint64 flags
  ) external onlyAddPackageRole {
    _addPackage(_name, _repo, flags);
  }

  /**
   * @notice Change package list with a new compact list of packageIdx'es
   * @param _packageList See `packageList` for format details.
   * @param _bytesPerListItem See `packageList` for format details. Set to 0 to not update.
   */
  function setList(bytes memory _packageList, uint64 _bytesPerListItem) external onlyRole(SET_LIST_ROLE) {
    packageList = _packageList;

    if (_bytesPerListItem > 0) {
      bytesPerListItem = _bytesPerListItem;
    }
  }

  /**
   * @notice Change package status with a new flags bitfield
   */
  function setPackageStatus(uint256 packageIdx, uint64 flags) external onlyRole(SET_STATUS_ROLE) {
    Package storage package = packages[packageIdx];
    package.flags = flags;

    emit UpdateStatus(packageIdx, flags);
  }

  /**
   * @notice Change package repo address.
   * Should only be used in extreme circumstances to recover a useful name.
   */
  function setPackageRepo(uint256 packageIdx, address repo) external onlyRole(SET_REPO_ROLE) {
    Package storage package = packages[packageIdx];
    package.repo = repo;

    emit UpdateRepo(packageIdx, repo);
  }

  /**
   * @dev Extension logic to ADD_PACKAGE_ROLE. If true any address can add package.
   */
  function setAddPackageAnyAddress(bool _addPackageAnyAddress) external onlyRole(getRoleAdmin(ADD_PACKAGE_ROLE)) {
    addPackageAnyAddress = _addPackageAnyAddress;
  }

  /**
   * @dev Return the index of a package name if existent
   */
  function getPackageIdx(string memory _name) public view returns (uint256) {
    bytes32 nameHash = keccak256(abi.encodePacked(_name));
    uint256 packageIdx = packageIdxByName[nameHash];
    require(packageIdx > 0, "REGISTRY_INEXISTENT_NAME");

    return packageIdx;
  }

  /**
   * @dev Return the package data of a package name if existent
   */
  function getPackage(string memory _name) public view returns (Package memory) {
    Package storage package = packages[getPackageIdx(_name)];
    return (package);
  }

  /**
   * @dev Return total count of packages to iterate `packageIdxByName`
   */
  function getPackageCount() public view returns (uint256) {
    return nextIdx - 1;
  }

  /**
   * @dev Extension logic to `onlyRole(ADD_PACKAGE_ROLE)` allowing any address
   * if addPackageAnyAddress == true
   */
  modifier onlyAddPackageRole() {
    require(hasRole(ADD_PACKAGE_ROLE, _msgSender()) || addPackageAnyAddress, "NO_ADD_PACKAGE_ROLE");
    _;
  }

  /**
   * @dev Add a new package to the registry
   */
  function _addPackage(
    string memory _name,
    address _repo,
    uint64 _flags
  ) internal {
    require(bytes(_name).length > 0, "REGISTRY_EMPTY_NAME");

    bytes32 nameHash = keccak256(abi.encodePacked(_name));
    require(packageIdxByName[nameHash] == 0, "REGISTRY_EXISTENT_NAME");

    // To set non-default flags must have SET_STATUS_ROLE. If the ADD_PACKAGE_ROLE
    // is permission-less flags should be used to curate packages.
    // Admins should set initial flags to add a package and set flags in one tx.
    if (_flags > 0) {
      require(hasRole(SET_STATUS_ROLE, msg.sender), "NO_SET_STATUS_ROLE");
    }

    uint256 packageIdx = nextIdx++;
    packages[packageIdx] = Package(_flags, _repo, _name);
    packageIdxByName[nameHash] = packageIdx;

    emit AddPackage(packageIdx, _name, _repo);
  }
}
