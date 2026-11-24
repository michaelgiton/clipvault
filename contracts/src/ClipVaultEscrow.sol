// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title ClipVaultEscrow — clip-bounty escrow on QIE mainnet (QUSDC)
/// @notice A brand locks QUSDC in escrow for a clip bounty. Creators submit
///  clips (URL + content hash). The brand accepts one submission and the
///  locked funds are released to that creator minus a 2% platform fee.
///  If the deadline passes with no accepted submission, the brand can refund
///  the full amount. If a bounty has no submissions at all, the brand can
///  cancel it early for a full refund. No custody beyond escrow, no owner,
///  no upgradeability — the fee recipient is fixed at deploy time.
/// @dev QUSDC: 0x3F43DA82eC9A4f5285F10FaF1F26EcA7319E5DA5 (6 decimals).
contract ClipVaultEscrow is ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice The stablecoin locked in escrow (QUSDC on QIE mainnet).
    IERC20 public immutable token;
    /// @notice Receives the 2% platform fee on every accepted bounty.
    address public immutable feeRecipient;
    /// @notice Platform fee in basis points: 200 = 2%.
    uint256 public constant FEE_BPS = 200;
    uint256 public constant BPS_DENOMINATOR = 10_000;

    enum BountyStatus {
        Open,
        Paid,
        Refunded
    }

    struct Bounty {
        address brand;
        string title;
        string description;
        uint256 amount;
        uint256 deadline;
        BountyStatus status;
        uint256 submissionCount;
        uint256 acceptedSubmissionId; // 0 = none; submission ids start at 1
    }

    struct Submission {
        address creator;
        string clipUrl;
        string contentHash;
        uint256 createdAt;
    }

    /// @notice Total bounties ever created. Bounty ids start at 1.
    uint256 public bountyCount;

    mapping(uint256 => Bounty) private _bounties;
    mapping(uint256 => mapping(uint256 => Submission)) private _submissions;

    event BountyCreated(
        uint256 indexed bountyId,
        address indexed brand,
        uint256 amount,
        uint256 deadline
    );
    event ClipSubmitted(
        uint256 indexed bountyId,
        uint256 indexed submissionId,
        address indexed creator,
        string clipUrl,
        string contentHash
    );
    event SubmissionAccepted(
        uint256 indexed bountyId,
        uint256 indexed submissionId,
        address indexed creator,
        uint256 creatorAmount,
        uint256 feeAmount
    );
    event BountyRefunded(uint256 indexed bountyId, address indexed brand, uint256 amount);
    event BountyCancelled(uint256 indexed bountyId, address indexed brand, uint256 amount);

    error ZeroAmount();
    error DeadlineInPast();
    error BountyNotFound();
    error BountyNotOpen();
    error NotBrand();
    error SubmissionNotFound();
    error DeadlinePassed();
    error DeadlineNotPassed();
    error HasSubmissions();
    error BrandCannotSubmit();
    error EmptyClipUrl();
    error EmptyContentHash();
    error ZeroFeeRecipient();

    constructor(address token_, address feeRecipient_) {
        if (feeRecipient_ == address(0)) revert ZeroFeeRecipient();
        token = IERC20(token_);
        feeRecipient = feeRecipient_;
    }

    /// @notice Create a bounty and lock `amount` QUSDC in escrow.
    /// @dev The caller must approve this contract to pull `amount` first.
    function createBounty(
        string calldata title,
        string calldata description,
        uint256 amount,
        uint256 deadline
    ) external nonReentrant returns (uint256 bountyId) {
        if (amount == 0) revert ZeroAmount();
        if (deadline <= block.timestamp) revert DeadlineInPast();

        bountyId = ++bountyCount;
        _bounties[bountyId] = Bounty({
            brand: msg.sender,
            title: title,
            description: description,
            amount: amount,
            deadline: deadline,
            status: BountyStatus.Open,
            submissionCount: 0,
            acceptedSubmissionId: 0
        });

        token.safeTransferFrom(msg.sender, address(this), amount);
        emit BountyCreated(bountyId, msg.sender, amount, deadline);
    }

    /// @notice Submit a clip to an open bounty. Anyone except the brand.
    function submitClip(
        uint256 bountyId,
        string calldata clipUrl,
        string calldata contentHash
    ) external returns (uint256 submissionId) {
        Bounty storage bounty = _bounties[bountyId];
        if (bounty.brand == address(0)) revert BountyNotFound();
        if (bounty.status != BountyStatus.Open) revert BountyNotOpen();
        if (block.timestamp > bounty.deadline) revert DeadlinePassed();
        if (msg.sender == bounty.brand) revert BrandCannotSubmit();
        if (bytes(clipUrl).length == 0) revert EmptyClipUrl();
        if (bytes(contentHash).length == 0) revert EmptyContentHash();

        submissionId = ++bounty.submissionCount;
        _submissions[bountyId][submissionId] = Submission({
            creator: msg.sender,
            clipUrl: clipUrl,
            contentHash: contentHash,
            createdAt: block.timestamp
        });

        emit ClipSubmitted(bountyId, submissionId, msg.sender, clipUrl, contentHash);
    }

    /// @notice Accept one submission: pays the creator (amount minus 2% fee)
    ///  and the fee recipient (2%). Only the brand, only while Open and
    ///  before the deadline.
    function acceptSubmission(uint256 bountyId, uint256 submissionId) external nonReentrant {
        Bounty storage bounty = _bounties[bountyId];
        if (bounty.brand == address(0)) revert BountyNotFound();
        if (msg.sender != bounty.brand) revert NotBrand();
        if (bounty.status != BountyStatus.Open) revert BountyNotOpen();
        if (block.timestamp > bounty.deadline) revert DeadlinePassed();
        if (submissionId == 0 || submissionId > bounty.submissionCount) revert SubmissionNotFound();

        Submission storage submission = _submissions[bountyId][submissionId];

        bounty.status = BountyStatus.Paid;
        bounty.acceptedSubmissionId = submissionId;

        uint256 feeAmount = (bounty.amount * FEE_BPS) / BPS_DENOMINATOR;
        uint256 creatorAmount = bounty.amount - feeAmount;

        token.safeTransfer(submission.creator, creatorAmount);
        if (feeAmount > 0) {
            token.safeTransfer(feeRecipient, feeAmount);
        }

        emit SubmissionAccepted(
            bountyId, submissionId, submission.creator, creatorAmount, feeAmount
        );
    }

    /// @notice After the deadline, with no accepted submission, the brand
    ///  reclaims the full locked amount.
    function refundBounty(uint256 bountyId) external nonReentrant {
        Bounty storage bounty = _bounties[bountyId];
        if (bounty.brand == address(0)) revert BountyNotFound();
        if (msg.sender != bounty.brand) revert NotBrand();
        if (bounty.status != BountyStatus.Open) revert BountyNotOpen();
        if (block.timestamp <= bounty.deadline) revert DeadlineNotPassed();

        bounty.status = BountyStatus.Refunded;
        token.safeTransfer(bounty.brand, bounty.amount);

        emit BountyRefunded(bountyId, bounty.brand, bounty.amount);
    }

    /// @notice Cancel an Open bounty that has no submissions yet, before the
    ///  deadline. Full refund to the brand.
    function cancelBounty(uint256 bountyId) external nonReentrant {
        Bounty storage bounty = _bounties[bountyId];
        if (bounty.brand == address(0)) revert BountyNotFound();
        if (msg.sender != bounty.brand) revert NotBrand();
        if (bounty.status != BountyStatus.Open) revert BountyNotOpen();
        if (block.timestamp > bounty.deadline) revert DeadlinePassed();
        if (bounty.submissionCount != 0) revert HasSubmissions();

        bounty.status = BountyStatus.Refunded;
        token.safeTransfer(bounty.brand, bounty.amount);

        emit BountyCancelled(bountyId, bounty.brand, bounty.amount);
    }

    // ------------------------------------------------------------ views

    function getBounty(uint256 bountyId) external view returns (Bounty memory) {
        Bounty memory bounty = _bounties[bountyId];
        if (bounty.brand == address(0)) revert BountyNotFound();
        return bounty;
    }

    function getSubmission(
        uint256 bountyId,
        uint256 submissionId
    ) external view returns (Submission memory) {
        Bounty memory bounty = _bounties[bountyId];
        if (bounty.brand == address(0)) revert BountyNotFound();
        if (submissionId == 0 || submissionId > bounty.submissionCount) {
            revert SubmissionNotFound();
        }
        return _submissions[bountyId][submissionId];
    }
}
