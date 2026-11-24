// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ClipVaultEscrow} from "../src/ClipVaultEscrow.sol";
import {MockQUSDC} from "./mocks/MockQUSDC.sol";

contract ClipVaultEscrowTest is Test {
    ClipVaultEscrow internal vault;
    MockQUSDC internal token;

    address internal brand = makeAddr("brand");
    address internal creator1 = makeAddr("creator1");
    address internal creator2 = makeAddr("creator2");
    address internal feeRecipient = makeAddr("feeRecipient");

    uint256 internal constant BOUNTY_AMOUNT = 100_000_000; // 100 QUSDC (6 dec)
    uint256 internal deadline;

    // ------------------------------------------------------------ events
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

    function setUp() public {
        token = new MockQUSDC();
        vault = new ClipVaultEscrow(address(token), feeRecipient);
        deadline = block.timestamp + 7 days;

        token.mint(brand, 10_000_000_000); // 10,000 QUSDC
        token.mint(creator1, 1_000_000);
        token.mint(creator2, 1_000_000);

        vm.prank(brand);
        token.approve(address(vault), type(uint256).max);
    }

    function _createBounty() internal returns (uint256 bountyId) {
        vm.prank(brand);
        bountyId = vault.createBounty("Best Clip Wins", "30s hype clip", BOUNTY_AMOUNT, deadline);
    }

    function _submit(uint256 bountyId, address creator) internal returns (uint256 submissionId) {
        vm.prank(creator);
        submissionId = vault.submitClip(bountyId, "https://youtube.com/shorts/abc", "0xhash123");
    }

    // ------------------------------------------------------------ create

    function testCreateLocksFunds() public {
        vm.expectEmit(true, true, false, true, address(vault));
        emit BountyCreated(1, brand, BOUNTY_AMOUNT, deadline);

        uint256 bountyId = _createBounty();
        assertEq(bountyId, 1);
        assertEq(vault.bountyCount(), 1);
        assertEq(token.balanceOf(address(vault)), BOUNTY_AMOUNT);
        assertEq(token.balanceOf(brand), 10_000_000_000 - BOUNTY_AMOUNT);

        ClipVaultEscrow.Bounty memory b = vault.getBounty(bountyId);
        assertEq(b.brand, brand);
        assertEq(b.title, "Best Clip Wins");
        assertEq(b.amount, BOUNTY_AMOUNT);
        assertEq(b.deadline, deadline);
        assertEq(uint256(b.status), uint256(ClipVaultEscrow.BountyStatus.Open));
        assertEq(b.submissionCount, 0);
        assertEq(b.acceptedSubmissionId, 0);
    }

    function testCreateZeroAmountReverts() public {
        vm.prank(brand);
        vm.expectRevert(ClipVaultEscrow.ZeroAmount.selector);
        vault.createBounty("t", "d", 0, deadline);
    }

    function testCreatePastDeadlineReverts() public {
        vm.prank(brand);
        vm.expectRevert(ClipVaultEscrow.DeadlineInPast.selector);
        vault.createBounty("t", "d", BOUNTY_AMOUNT, block.timestamp);
    }

    function testCreateWithoutApprovalReverts() public {
        vm.prank(creator1); // creator1 never approved the vault
        vm.expectRevert();
        vault.createBounty("t", "d", BOUNTY_AMOUNT, deadline);
    }

    // ------------------------------------------------------------ submit

    function testSubmitWorks() public {
        uint256 bountyId = _createBounty();

        vm.expectEmit(true, true, true, true, address(vault));
        emit ClipSubmitted(bountyId, 1, creator1, "https://youtube.com/shorts/abc", "0xhash123");
        uint256 subId = _submit(bountyId, creator1);
        assertEq(subId, 1);

        uint256 subId2 = _submit(bountyId, creator2);
        assertEq(subId2, 2);

        ClipVaultEscrow.Submission memory s = vault.getSubmission(bountyId, 1);
        assertEq(s.creator, creator1);
        assertEq(s.clipUrl, "https://youtube.com/shorts/abc");
        assertEq(s.contentHash, "0xhash123");

        ClipVaultEscrow.Bounty memory b = vault.getBounty(bountyId);
        assertEq(b.submissionCount, 2);
    }

    function testSubmitAfterDeadlineReverts() public {
        uint256 bountyId = _createBounty();
        vm.warp(deadline + 1);
        vm.prank(creator1);
        vm.expectRevert(ClipVaultEscrow.DeadlinePassed.selector);
        vault.submitClip(bountyId, "https://youtube.com/shorts/abc", "0xhash123");
    }

    function testBrandCannotSubmitToOwnBounty() public {
        uint256 bountyId = _createBounty();
        vm.prank(brand);
        vm.expectRevert(ClipVaultEscrow.BrandCannotSubmit.selector);
        vault.submitClip(bountyId, "https://youtube.com/shorts/abc", "0xhash123");
    }

    function testSubmitToMissingBountyReverts() public {
        vm.prank(creator1);
        vm.expectRevert(ClipVaultEscrow.BountyNotFound.selector);
        vault.submitClip(999, "https://youtube.com/shorts/abc", "0xhash123");
    }

    function testSubmitEmptyClipUrlReverts() public {
        uint256 bountyId = _createBounty();
        vm.prank(creator1);
        vm.expectRevert(ClipVaultEscrow.EmptyClipUrl.selector);
        vault.submitClip(bountyId, "", "0xhash123");
    }

    // ------------------------------------------------------------ accept

    function testAcceptPaysCreatorMinusFee() public {
        uint256 bountyId = _createBounty();
        uint256 subId = _submit(bountyId, creator1);

        uint256 fee = (BOUNTY_AMOUNT * 200) / 10_000; // 2,000,000 = 2 QUSDC
        uint256 creatorShare = BOUNTY_AMOUNT - fee; // 98,000,000 = 98 QUSDC

        vm.expectEmit(true, true, true, true, address(vault));
        emit SubmissionAccepted(bountyId, subId, creator1, creatorShare, fee);

        uint256 creatorBefore = token.balanceOf(creator1);
        uint256 feeBefore = token.balanceOf(feeRecipient);

        vm.prank(brand);
        vault.acceptSubmission(bountyId, subId);

        assertEq(token.balanceOf(creator1), creatorBefore + creatorShare);
        assertEq(token.balanceOf(feeRecipient), feeBefore + fee);
        assertEq(token.balanceOf(address(vault)), 0);

        ClipVaultEscrow.Bounty memory b = vault.getBounty(bountyId);
        assertEq(uint256(b.status), uint256(ClipVaultEscrow.BountyStatus.Paid));
        assertEq(b.acceptedSubmissionId, subId);
    }

    function testAcceptOddAmountRoundsFeeDown() public {
        // 1.000001 QUSDC = 1,000,001 base units; fee = 20,000 (20,000.02 truncated)
        vm.prank(brand);
        uint256 bountyId = vault.createBounty("odd", "d", 1_000_001, deadline);
        uint256 subId = _submit(bountyId, creator1);

        uint256 creatorBefore = token.balanceOf(creator1);
        vm.prank(brand);
        vault.acceptSubmission(bountyId, subId);

        assertEq(token.balanceOf(creator1), creatorBefore + 980_001);
        assertEq(token.balanceOf(feeRecipient), 20_000);
    }

    function testDoubleAcceptReverts() public {
        uint256 bountyId = _createBounty();
        uint256 subId = _submit(bountyId, creator1);
        vm.prank(brand);
        vault.acceptSubmission(bountyId, subId);

        vm.prank(brand);
        vm.expectRevert(ClipVaultEscrow.BountyNotOpen.selector);
        vault.acceptSubmission(bountyId, subId);
    }

    function testNonBrandAcceptReverts() public {
        uint256 bountyId = _createBounty();
        uint256 subId = _submit(bountyId, creator1);
        vm.prank(creator2);
        vm.expectRevert(ClipVaultEscrow.NotBrand.selector);
        vault.acceptSubmission(bountyId, subId);
    }

    function testAcceptAfterDeadlineReverts() public {
        uint256 bountyId = _createBounty();
        uint256 subId = _submit(bountyId, creator1);
        vm.warp(deadline + 1);
        vm.prank(brand);
        vm.expectRevert(ClipVaultEscrow.DeadlinePassed.selector);
        vault.acceptSubmission(bountyId, subId);
    }

    function testAcceptMissingSubmissionReverts() public {
        uint256 bountyId = _createBounty();
        vm.prank(brand);
        vm.expectRevert(ClipVaultEscrow.SubmissionNotFound.selector);
        vault.acceptSubmission(bountyId, 7);
    }

    // ------------------------------------------------------------ refund / cancel

    function testRefundAfterDeadlineReturnsFullAmount() public {
        uint256 bountyId = _createBounty();
        _submit(bountyId, creator1); // submissions exist, none accepted
        vm.warp(deadline + 1);

        vm.expectEmit(true, true, false, true, address(vault));
        emit BountyRefunded(bountyId, brand, BOUNTY_AMOUNT);

        uint256 brandBefore = token.balanceOf(brand);
        vm.prank(brand);
        vault.refundBounty(bountyId);

        assertEq(token.balanceOf(brand), brandBefore + BOUNTY_AMOUNT);
        assertEq(token.balanceOf(address(vault)), 0);
        ClipVaultEscrow.Bounty memory b = vault.getBounty(bountyId);
        assertEq(uint256(b.status), uint256(ClipVaultEscrow.BountyStatus.Refunded));
    }

    function testRefundBeforeDeadlineReverts() public {
        uint256 bountyId = _createBounty();
        vm.prank(brand);
        vm.expectRevert(ClipVaultEscrow.DeadlineNotPassed.selector);
        vault.refundBounty(bountyId);
    }

    function testRefundAfterPaidReverts() public {
        uint256 bountyId = _createBounty();
        uint256 subId = _submit(bountyId, creator1);
        vm.prank(brand);
        vault.acceptSubmission(bountyId, subId);
        vm.warp(deadline + 1);
        vm.prank(brand);
        vm.expectRevert(ClipVaultEscrow.BountyNotOpen.selector);
        vault.refundBounty(bountyId);
    }

    function testCancelWithNoSubmissionsRefunds() public {
        uint256 bountyId = _createBounty();

        vm.expectEmit(true, true, false, true, address(vault));
        emit BountyCancelled(bountyId, brand, BOUNTY_AMOUNT);

        uint256 brandBefore = token.balanceOf(brand);
        vm.prank(brand);
        vault.cancelBounty(bountyId);

        assertEq(token.balanceOf(brand), brandBefore + BOUNTY_AMOUNT);
        assertEq(token.balanceOf(address(vault)), 0);
        ClipVaultEscrow.Bounty memory b = vault.getBounty(bountyId);
        assertEq(uint256(b.status), uint256(ClipVaultEscrow.BountyStatus.Refunded));
    }

    function testCancelWithSubmissionsReverts() public {
        uint256 bountyId = _createBounty();
        _submit(bountyId, creator1);
        vm.prank(brand);
        vm.expectRevert(ClipVaultEscrow.HasSubmissions.selector);
        vault.cancelBounty(bountyId);
    }

    function testCancelAfterDeadlineReverts() public {
        uint256 bountyId = _createBounty();
        vm.warp(deadline + 1);
        vm.prank(brand);
        vm.expectRevert(ClipVaultEscrow.DeadlinePassed.selector);
        vault.cancelBounty(bountyId);
    }

    function testNonBrandRefundAndCancelRevert() public {
        uint256 bountyId = _createBounty();
        vm.prank(creator1);
        vm.expectRevert(ClipVaultEscrow.NotBrand.selector);
        vault.cancelBounty(bountyId);
        vm.warp(deadline + 1);
        vm.prank(creator1);
        vm.expectRevert(ClipVaultEscrow.NotBrand.selector);
        vault.refundBounty(bountyId);
    }

    function testZeroFeeRecipientReverts() public {
        vm.expectRevert(ClipVaultEscrow.ZeroFeeRecipient.selector);
        new ClipVaultEscrow(address(token), address(0));
    }
}
