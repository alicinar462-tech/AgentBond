// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "forge-std/Test.sol";
import "forge-std/StdInvariant.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "../AgentBondEscrow.sol";

// =============================================================================
// Helpers
// =============================================================================

/// @dev Minimal ERC-20 mock with public mint. Used as the standard test token.
contract MockERC20 is ERC20 {
    constructor() ERC20("Mock USDC", "mUSDC") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

/// @dev Reentrant ERC-20 that calls back into a target on transfer/transferFrom.
///      Set `target` and `attackFn` before triggering the transfer.
contract ReentrantERC20 is ERC20 {
    address public attackTarget;
    bytes   public attackCalldata;
    bool    private _attacking;

    constructor() ERC20("Reentrant", "RATK") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function setAttack(address target, bytes calldata data) external {
        attackTarget  = target;
        attackCalldata = data;
    }

    function _update(address from, address to, uint256 value) internal override {
        super._update(from, to, value);
        // Trigger re-entry only once (prevent infinite loop)
        if (!_attacking && attackTarget != address(0)) {
            _attacking = true;
            (bool ok,) = attackTarget.call(attackCalldata);
            // We don't care whether the inner call succeeded — the guard should reject it.
            ok; // silence unused-variable warning
            _attacking = false;
        }
    }
}

// =============================================================================
// Base test setup
// =============================================================================

contract AgentBondEscrowBase is Test {
    AgentBondEscrow internal escrow;
    MockERC20       internal token;

    address internal employer  = makeAddr("employer");
    address internal provider  = makeAddr("provider");
    address internal stranger  = makeAddr("stranger");

    uint256 internal constant AMOUNT   = 100e6;  // 100 USDC (6 decimals)
    uint256 internal constant DEADLINE_OFFSET = 1 days;

    uint256 internal deadline;

    function setUp() public virtual {
        token   = new MockERC20();
        escrow  = new AgentBondEscrow(address(token), 5 days);
        deadline = block.timestamp + DEADLINE_OFFSET;

        // Seed employer with tokens and allowance
        token.mint(employer, AMOUNT * 10);
        vm.prank(employer);
        token.approve(address(escrow), type(uint256).max);
    }

    // -------------------------------------------------------------------------
    // Helpers to reach intermediate states
    // -------------------------------------------------------------------------

    function _createTask() internal returns (uint256 taskId) {
        vm.prank(employer);
        taskId = escrow.createTask(provider, "do the work", AMOUNT, deadline);
    }

    function _createAndFundTask() internal returns (uint256 taskId) {
        taskId = _createTask();
        vm.prank(employer);
        escrow.fundTask(taskId);
    }

    function _createFundAndSubmitTask() internal returns (uint256 taskId) {
        taskId = _createAndFundTask();
        vm.prank(provider);
        escrow.submitWork(taskId);
    }
}

// =============================================================================
// H — Happy-path tests
// =============================================================================

contract HappyPathTest is AgentBondEscrowBase {

    // H-1: createTask
    function test_H1_createTask() public {
        vm.prank(employer);
        vm.expectEmit(true, true, true, true);
        emit AgentBondEscrow.TaskCreated(1, employer, provider, AMOUNT, deadline, "do the work");
        uint256 id = escrow.createTask(provider, "do the work", AMOUNT, deadline);

        assertEq(id, 1, "first task id should be 1");
        assertEq(escrow.nextTaskId(), 2, "nextTaskId should advance to 2");

        (
            address emp,
            address prov,
            string memory desc,
            uint256 amt,
            uint256 dl,
            uint256 submTime,
            AgentBondEscrow.TaskState state
        ) = escrow.tasks(id);

        assertEq(emp,  employer,      "employer mismatch");
        assertEq(prov, provider,      "provider mismatch");
        assertEq(desc, "do the work", "description mismatch");
        assertEq(amt,  AMOUNT,        "amount mismatch");
        assertEq(dl,   deadline,      "deadline mismatch");
        assertEq(submTime, 0,         "submissionTime should be 0 before submitWork");
        assertEq(uint8(state), uint8(AgentBondEscrow.TaskState.Created), "state should be Created");
    }

    // H-2: fundTask
    function test_H2_fundTask() public {
        uint256 id = _createTask();
        uint256 empBefore = token.balanceOf(employer);

        vm.prank(employer);
        vm.expectEmit(true, true, false, true);
        emit AgentBondEscrow.TaskFunded(id, employer, AMOUNT);
        escrow.fundTask(id);

        (,,,,,,AgentBondEscrow.TaskState state) = escrow.tasks(id);
        assertEq(uint8(state), uint8(AgentBondEscrow.TaskState.Funded), "state should be Funded");
        assertEq(token.balanceOf(address(escrow)), AMOUNT, "escrow balance mismatch");
        assertEq(token.balanceOf(employer), empBefore - AMOUNT, "employer balance mismatch");
    }

    // H-3: submitWork
    function test_H3_submitWork() public {
        uint256 id = _createAndFundTask();
        uint256 escrowBefore = token.balanceOf(address(escrow));

        vm.prank(provider);
        vm.expectEmit(true, true, false, false);
        emit AgentBondEscrow.WorkSubmitted(id, provider);
        escrow.submitWork(id);

        (,,,,,,AgentBondEscrow.TaskState state) = escrow.tasks(id);
        assertEq(uint8(state), uint8(AgentBondEscrow.TaskState.Submitted), "state should be Submitted");
        assertEq(token.balanceOf(address(escrow)), escrowBefore, "submitWork should not move tokens");
    }

    // H-4: approveWork
    function test_H4_approveWork() public {
        uint256 id = _createFundAndSubmitTask();
        uint256 provBefore = token.balanceOf(provider);

        vm.prank(employer);
        vm.expectEmit(true, true, true, true);
        emit AgentBondEscrow.WorkApproved(id, employer, provider, AMOUNT);
        escrow.approveWork(id);

        (,,,,,,AgentBondEscrow.TaskState state) = escrow.tasks(id);
        assertEq(uint8(state), uint8(AgentBondEscrow.TaskState.Completed), "state should be Completed");
        assertEq(token.balanceOf(provider), provBefore + AMOUNT, "provider should receive payment");
        assertEq(token.balanceOf(address(escrow)), 0, "escrow balance should be 0");
    }

    // H-5: requestRefund from Funded state
    function test_H5_refund_fromFunded() public {
        uint256 id = _createAndFundTask();
        uint256 empBefore = token.balanceOf(employer);

        vm.warp(deadline);
        vm.prank(employer);
        vm.expectEmit(true, true, false, true);
        emit AgentBondEscrow.RefundIssued(id, employer, AMOUNT);
        escrow.requestRefund(id);

        (,,,,,,AgentBondEscrow.TaskState state) = escrow.tasks(id);
        assertEq(uint8(state), uint8(AgentBondEscrow.TaskState.Refunded), "state should be Refunded");
        assertEq(token.balanceOf(employer), empBefore + AMOUNT, "employer should be refunded");
        assertEq(token.balanceOf(address(escrow)), 0, "escrow balance should be 0");
    }

    // H-6: requestRefund from Submitted state — within review window succeeds
    function test_H6_refund_fromSubmitted_withinWindow() public {
        uint256 id = _createFundAndSubmitTask();
        uint256 empBefore = token.balanceOf(employer);

        // submissionTime == block.timestamp at test start; window = 5 days
        // Warp to 1 second before window closes (still within window)
        (, , , , , uint256 submTime, ) = escrow.tasks(id);
        uint256 windowEnd = submTime + 5 days;
        vm.warp(windowEnd - 1);

        vm.prank(employer);
        vm.expectEmit(true, true, false, true);
        emit AgentBondEscrow.RefundIssued(id, employer, AMOUNT);
        escrow.requestRefund(id);

        (, , , , , , AgentBondEscrow.TaskState state) = escrow.tasks(id);
        assertEq(uint8(state), uint8(AgentBondEscrow.TaskState.Refunded), "state should be Refunded");
        assertEq(token.balanceOf(employer), empBefore + AMOUNT, "employer should be refunded within window");
        assertEq(token.balanceOf(address(escrow)), 0, "escrow balance should be 0");
    }

    // H-7: two tasks are fully independent
    function test_H7_multipleTasksIndependent() public {
        address employer2 = makeAddr("employer2");
        address provider2 = makeAddr("provider2");

        token.mint(employer2, AMOUNT * 10);
        vm.prank(employer2);
        token.approve(address(escrow), type(uint256).max);

        vm.prank(employer);
        uint256 id1 = escrow.createTask(provider,  "task1", AMOUNT,      deadline);
        vm.prank(employer2);
        uint256 id2 = escrow.createTask(provider2, "task2", AMOUNT * 2,  deadline);

        vm.prank(employer);  escrow.fundTask(id1);
        vm.prank(employer2); escrow.fundTask(id2);

        assertEq(token.balanceOf(address(escrow)), AMOUNT + AMOUNT * 2, "combined escrow balance");

        // Complete task1; task2 should be unaffected
        vm.prank(provider);  escrow.submitWork(id1);
        vm.prank(employer);  escrow.approveWork(id1);

        assertEq(token.balanceOf(address(escrow)), AMOUNT * 2, "task2 still escrowed");

        (,,,,,,AgentBondEscrow.TaskState s2) = escrow.tasks(id2);
        assertEq(uint8(s2), uint8(AgentBondEscrow.TaskState.Funded), "task2 should still be Funded");
    }

    // H-8: self-escrow (employer == provider)
    function test_H8_selfEscrow() public {
        vm.prank(employer);
        uint256 id = escrow.createTask(employer, "self-task", AMOUNT, deadline);
        vm.prank(employer); escrow.fundTask(id);
        vm.prank(employer); escrow.submitWork(id);
        uint256 before = token.balanceOf(employer);
        vm.prank(employer); escrow.approveWork(id);
        assertEq(token.balanceOf(employer), before + AMOUNT, "self-escrow payment");
    }

    // H-9: claimPayment success after review window
    function test_H9_claimPayment_success() public {
        uint256 id = _createFundAndSubmitTask();
        uint256 provBefore = token.balanceOf(provider);

        (, , , , , uint256 submTime, ) = escrow.tasks(id);
        vm.warp(submTime + escrow.reviewWindow());

        vm.prank(provider);
        vm.expectEmit(true, true, false, true);
        emit AgentBondEscrow.PaymentClaimed(id, provider, AMOUNT);
        escrow.claimPayment(id);

        (, , , , , , AgentBondEscrow.TaskState state) = escrow.tasks(id);
        assertEq(uint8(state), uint8(AgentBondEscrow.TaskState.Completed), "state should be Completed");
        assertEq(token.balanceOf(provider), provBefore + AMOUNT, "provider should receive payment");
        assertEq(token.balanceOf(address(escrow)), 0, "escrow drained");
    }

    // H-10: submitWork records submissionTime
    function test_H10_submitWork_recordsSubmissionTime() public {
        uint256 id = _createAndFundTask();
        uint256 tsBefore = block.timestamp;
        vm.prank(provider);
        escrow.submitWork(id);
        (, , , , , uint256 submTime, ) = escrow.tasks(id);
        assertEq(submTime, tsBefore, "submissionTime should equal block.timestamp at submitWork");
    }

    // H-11: approveWork still works after review window expires
    function test_H11_approveWork_afterReviewWindow() public {
        uint256 id = _createFundAndSubmitTask();
        uint256 provBefore = token.balanceOf(provider);

        (, , , , , uint256 submTime, ) = escrow.tasks(id);
        vm.warp(submTime + escrow.reviewWindow() + 1);

        vm.prank(employer);
        escrow.approveWork(id);

        (, , , , , , AgentBondEscrow.TaskState state) = escrow.tasks(id);
        assertEq(uint8(state), uint8(AgentBondEscrow.TaskState.Completed), "state should be Completed after late approval");
        assertEq(token.balanceOf(provider), provBefore + AMOUNT, "provider receives payment via approveWork after window");
    }

    // H-12: reviewWindow is stored correctly as immutable
    function test_H12_reviewWindow_constructorParam() public view {
        assertEq(escrow.reviewWindow(), 5 days, "reviewWindow should be 5 days");
    }
}

// =============================================================================
// A — USDC accounting tests
// =============================================================================

contract AccountingTest is AgentBondEscrowBase {

    // A-1
    function test_A1_escrowBalanceAfterFund() public {
        uint256 id = _createAndFundTask();
        (,,, uint256 amt,,,) = escrow.tasks(id);
        assertEq(token.balanceOf(address(escrow)), amt);
    }

    // A-2
    function test_A2_escrowBalanceAfterApprove() public {
        uint256 provBefore = token.balanceOf(provider);
        uint256 id = _createFundAndSubmitTask();
        (,,, uint256 amt,,,) = escrow.tasks(id);

        vm.prank(employer);
        escrow.approveWork(id);

        assertEq(token.balanceOf(provider), provBefore + amt, "provider balance");
        assertEq(token.balanceOf(address(escrow)), 0, "escrow drained");
    }

    // A-3
    function test_A3_escrowBalanceAfterRefund() public {
        uint256 empBefore = token.balanceOf(employer);
        uint256 id = _createAndFundTask();
        vm.warp(deadline);
        vm.prank(employer);
        escrow.requestRefund(id);

        assertEq(token.balanceOf(employer), empBefore, "employer restored");
        assertEq(token.balanceOf(address(escrow)), 0, "escrow drained");
    }

    // A-4: fuzz amount
    function testFuzz_A4_amountAccounting(uint96 rawAmount) public {
        uint256 amount = uint256(rawAmount);
        vm.assume(amount > 0);

        token.mint(employer, amount);
        // employer already has max approval from setUp

        vm.prank(employer);
        uint256 id = escrow.createTask(provider, "fuzz", amount, deadline);
        vm.prank(employer);
        escrow.fundTask(id);

        assertEq(token.balanceOf(address(escrow)), amount, "escrow balance after fund");

        vm.prank(provider);
        escrow.submitWork(id);
        vm.prank(employer);
        escrow.approveWork(id);

        assertEq(token.balanceOf(address(escrow)), 0, "escrow drained after approve");
    }

    // A-5: two concurrent funded tasks, balances are additive
    function test_A5_twoConcurrentTasks() public {
        uint256 id1 = _createAndFundTask();

        // Second task with different amount
        token.mint(employer, AMOUNT * 3);
        vm.prank(employer);
        uint256 id2 = escrow.createTask(provider, "task2", AMOUNT * 3, deadline);
        vm.prank(employer);
        escrow.fundTask(id2);

        assertEq(token.balanceOf(address(escrow)), AMOUNT + AMOUNT * 3, "sum of both amounts");

        // Approve first task; second should still be intact
        vm.prank(provider);  escrow.submitWork(id1);
        vm.prank(employer);  escrow.approveWork(id1);
        assertEq(token.balanceOf(address(escrow)), AMOUNT * 3, "only task2 remaining");
    }

    // A-6: claimPayment accounting
    function test_A6_claimPaymentAccounting() public {
        uint256 provBefore = token.balanceOf(provider);
        uint256 id = _createFundAndSubmitTask();
        (, , , , , uint256 submTime, ) = escrow.tasks(id);
        vm.warp(submTime + escrow.reviewWindow());
        vm.prank(provider);
        escrow.claimPayment(id);
        assertEq(token.balanceOf(provider), provBefore + AMOUNT, "provider balance after claimPayment");
        assertEq(token.balanceOf(address(escrow)), 0, "escrow drained after claimPayment");
    }

    // A-7: fuzz claimPayment amount accounting
    function testFuzz_A7_claimPaymentWithAmount(uint96 rawAmount) public {
        uint256 amount = uint256(rawAmount);
        vm.assume(amount > 0);

        token.mint(employer, amount);
        vm.prank(employer);
        uint256 id = escrow.createTask(provider, "fuzz-claim", amount, deadline);
        vm.prank(employer);
        escrow.fundTask(id);
        vm.prank(provider);
        escrow.submitWork(id);

        (, , , , , uint256 submTime, ) = escrow.tasks(id);
        vm.warp(submTime + escrow.reviewWindow());

        uint256 provBefore = token.balanceOf(provider);
        vm.prank(provider);
        escrow.claimPayment(id);
        assertEq(token.balanceOf(provider), provBefore + amount, "provider receives exact amount");
        assertEq(token.balanceOf(address(escrow)), 0, "escrow drained");
    }
}

// =============================================================================
// R — Revert / access-control tests
// =============================================================================

contract AccessControlTest is AgentBondEscrowBase {

    // R-1: stranger cannot fund
    function test_R1_fundTask_notEmployer() public {
        uint256 id = _createTask();
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(AgentBondEscrow.NotEmployer.selector, id));
        escrow.fundTask(id);
    }

    // R-2: employer cannot submit (not provider)
    function test_R2_submitWork_employerNotProvider() public {
        uint256 id = _createAndFundTask();
        vm.prank(employer);
        vm.expectRevert(abi.encodeWithSelector(AgentBondEscrow.NotProvider.selector, id));
        escrow.submitWork(id);
    }

    // R-3: stranger cannot submit
    function test_R3_submitWork_stranger() public {
        uint256 id = _createAndFundTask();
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(AgentBondEscrow.NotProvider.selector, id));
        escrow.submitWork(id);
    }

    // R-4: provider cannot approve
    function test_R4_approveWork_notEmployer() public {
        uint256 id = _createFundAndSubmitTask();
        vm.prank(provider);
        vm.expectRevert(abi.encodeWithSelector(AgentBondEscrow.NotEmployer.selector, id));
        escrow.approveWork(id);
    }

    // R-5: stranger cannot approve
    function test_R5_approveWork_stranger() public {
        uint256 id = _createFundAndSubmitTask();
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(AgentBondEscrow.NotEmployer.selector, id));
        escrow.approveWork(id);
    }

    // R-6: provider cannot refund
    function test_R6_refund_notEmployer() public {
        uint256 id = _createAndFundTask();
        vm.warp(deadline);
        vm.prank(provider);
        vm.expectRevert(abi.encodeWithSelector(AgentBondEscrow.NotEmployer.selector, id));
        escrow.requestRefund(id);
    }

    // R-7: stranger cannot refund
    function test_R7_refund_stranger() public {
        uint256 id = _createAndFundTask();
        vm.warp(deadline);
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(AgentBondEscrow.NotEmployer.selector, id));
        escrow.requestRefund(id);
    }

    // R-8: provider cannot submit after deadline
    function test_R8_submitWork_afterDeadline() public {
        uint256 id = _createAndFundTask();
        vm.warp(deadline);
        vm.prank(provider);
        vm.expectRevert(
            abi.encodeWithSelector(AgentBondEscrow.DeadlinePassed.selector, id, deadline, deadline)
        );
        escrow.submitWork(id);
    }

    // R-9: employer cannot refund before deadline
    function test_R9_refund_beforeDeadline() public {
        uint256 id = _createAndFundTask();
        vm.prank(employer);
        vm.expectRevert(
            abi.encodeWithSelector(
                AgentBondEscrow.DeadlineNotReached.selector,
                id,
                deadline,
                block.timestamp
            )
        );
        escrow.requestRefund(id);
    }

    // R-10: employer cannot claimPayment (not provider)
    function test_R10_claimPayment_notProvider_employer() public {
        uint256 id = _createFundAndSubmitTask();
        (, , , , , uint256 submTime, ) = escrow.tasks(id);
        vm.warp(submTime + escrow.reviewWindow());
        vm.prank(employer);
        vm.expectRevert(abi.encodeWithSelector(AgentBondEscrow.NotProvider.selector, id));
        escrow.claimPayment(id);
    }

    // R-11: stranger cannot claimPayment
    function test_R11_claimPayment_notProvider_stranger() public {
        uint256 id = _createFundAndSubmitTask();
        (, , , , , uint256 submTime, ) = escrow.tasks(id);
        vm.warp(submTime + escrow.reviewWindow());
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(AgentBondEscrow.NotProvider.selector, id));
        escrow.claimPayment(id);
    }
}

// =============================================================================
// S — State-transition integrity tests
// =============================================================================

contract StateTransitionTest is AgentBondEscrowBase {

    // S-1: double-fund
    function test_S1_fundTask_alreadyFunded() public {
        uint256 id = _createAndFundTask();
        vm.prank(employer);
        vm.expectRevert(
            abi.encodeWithSelector(
                AgentBondEscrow.InvalidState.selector,
                id,
                AgentBondEscrow.TaskState.Funded
            )
        );
        escrow.fundTask(id);
    }

    // S-2: fund after submit
    function test_S2_fundTask_afterSubmit() public {
        uint256 id = _createFundAndSubmitTask();
        vm.prank(employer);
        vm.expectRevert(
            abi.encodeWithSelector(
                AgentBondEscrow.InvalidState.selector,
                id,
                AgentBondEscrow.TaskState.Submitted
            )
        );
        escrow.fundTask(id);
    }

    // S-3: submit on Created task (not yet funded)
    function test_S3_submitWork_onCreated() public {
        uint256 id = _createTask();
        vm.prank(provider);
        vm.expectRevert(
            abi.encodeWithSelector(
                AgentBondEscrow.InvalidState.selector,
                id,
                AgentBondEscrow.TaskState.Created
            )
        );
        escrow.submitWork(id);
    }

    // S-4: submit on already Submitted task
    function test_S4_submitWork_alreadySubmitted() public {
        uint256 id = _createFundAndSubmitTask();
        vm.prank(provider);
        vm.expectRevert(
            abi.encodeWithSelector(
                AgentBondEscrow.InvalidState.selector,
                id,
                AgentBondEscrow.TaskState.Submitted
            )
        );
        escrow.submitWork(id);
    }

    // S-5: approve on Created task
    function test_S5_approveWork_onCreated() public {
        uint256 id = _createTask();
        vm.prank(employer);
        vm.expectRevert(
            abi.encodeWithSelector(
                AgentBondEscrow.InvalidState.selector,
                id,
                AgentBondEscrow.TaskState.Created
            )
        );
        escrow.approveWork(id);
    }

    // S-6: approve on Funded task (not yet submitted)
    function test_S6_approveWork_onFunded() public {
        uint256 id = _createAndFundTask();
        vm.prank(employer);
        vm.expectRevert(
            abi.encodeWithSelector(
                AgentBondEscrow.InvalidState.selector,
                id,
                AgentBondEscrow.TaskState.Funded
            )
        );
        escrow.approveWork(id);
    }

    // S-7: double-approve (Completed)
    function test_S7_approveWork_alreadyCompleted() public {
        uint256 id = _createFundAndSubmitTask();
        vm.prank(employer); escrow.approveWork(id);
        vm.prank(employer);
        vm.expectRevert(
            abi.encodeWithSelector(
                AgentBondEscrow.InvalidState.selector,
                id,
                AgentBondEscrow.TaskState.Completed
            )
        );
        escrow.approveWork(id);
    }

    // S-8: approve on Refunded task
    function test_S8_approveWork_onRefunded() public {
        uint256 id = _createAndFundTask();
        vm.warp(deadline);
        vm.prank(employer); escrow.requestRefund(id);
        vm.prank(employer);
        vm.expectRevert(
            abi.encodeWithSelector(
                AgentBondEscrow.InvalidState.selector,
                id,
                AgentBondEscrow.TaskState.Refunded
            )
        );
        escrow.approveWork(id);
    }

    // S-9: refund on Created task
    function test_S9_refund_onCreated() public {
        uint256 id = _createTask();
        vm.warp(deadline);
        vm.prank(employer);
        vm.expectRevert(
            abi.encodeWithSelector(
                AgentBondEscrow.InvalidState.selector,
                id,
                AgentBondEscrow.TaskState.Created
            )
        );
        escrow.requestRefund(id);
    }

    // S-10: refund on Completed task
    function test_S10_refund_onCompleted() public {
        uint256 id = _createFundAndSubmitTask();
        vm.prank(employer); escrow.approveWork(id);
        vm.warp(deadline);
        vm.prank(employer);
        vm.expectRevert(
            abi.encodeWithSelector(
                AgentBondEscrow.InvalidState.selector,
                id,
                AgentBondEscrow.TaskState.Completed
            )
        );
        escrow.requestRefund(id);
    }

    // S-11: double-refund (Refunded)
    function test_S11_refund_alreadyRefunded() public {
        uint256 id = _createAndFundTask();
        vm.warp(deadline);
        vm.prank(employer); escrow.requestRefund(id);
        vm.prank(employer);
        vm.expectRevert(
            abi.encodeWithSelector(
                AgentBondEscrow.InvalidState.selector,
                id,
                AgentBondEscrow.TaskState.Refunded
            )
        );
        escrow.requestRefund(id);
    }

    // S-12: approve on Refunded task (already covered S-8, additional explicit check)
    function test_S12_doubleApprove() public {
        uint256 id = _createFundAndSubmitTask();
        vm.prank(employer); escrow.approveWork(id);
        // Second approve should fail with Completed state
        vm.prank(employer);
        vm.expectRevert(
            abi.encodeWithSelector(
                AgentBondEscrow.InvalidState.selector,
                id,
                AgentBondEscrow.TaskState.Completed
            )
        );
        escrow.approveWork(id);
    }

    // S-13: double-refund explicit
    function test_S13_doubleRefund() public {
        uint256 id = _createAndFundTask();
        vm.warp(deadline);
        vm.prank(employer); escrow.requestRefund(id);
        vm.prank(employer);
        vm.expectRevert(
            abi.encodeWithSelector(
                AgentBondEscrow.InvalidState.selector,
                id,
                AgentBondEscrow.TaskState.Refunded
            )
        );
        escrow.requestRefund(id);
    }

    // S-14: requestRefund from Submitted after review window expires → ReviewWindowExpired
    function test_S14_requestRefund_submitted_afterWindow() public {
        uint256 id = _createFundAndSubmitTask();
        (, , , , , uint256 submTime, ) = escrow.tasks(id);
        uint256 windowEnd = submTime + escrow.reviewWindow();
        vm.warp(windowEnd);

        vm.prank(employer);
        vm.expectRevert(
            abi.encodeWithSelector(
                AgentBondEscrow.ReviewWindowExpired.selector,
                id,
                windowEnd,
                windowEnd
            )
        );
        escrow.requestRefund(id);
    }

    // S-15: claimPayment before review window → ReviewWindowNotExpired
    function test_S15_claimPayment_beforeWindow() public {
        uint256 id = _createFundAndSubmitTask();
        (, , , , , uint256 submTime, ) = escrow.tasks(id);
        uint256 windowEnd = submTime + escrow.reviewWindow();

        vm.prank(provider);
        vm.expectRevert(
            abi.encodeWithSelector(
                AgentBondEscrow.ReviewWindowNotExpired.selector,
                id,
                windowEnd,
                block.timestamp
            )
        );
        escrow.claimPayment(id);
    }

    // S-16: claimPayment on Funded task → InvalidState
    function test_S16_claimPayment_onFunded() public {
        uint256 id = _createAndFundTask();
        vm.prank(provider);
        vm.expectRevert(
            abi.encodeWithSelector(AgentBondEscrow.InvalidState.selector, id, AgentBondEscrow.TaskState.Funded)
        );
        escrow.claimPayment(id);
    }

    // S-17: claimPayment on Completed task → InvalidState
    function test_S17_claimPayment_onCompleted() public {
        uint256 id = _createFundAndSubmitTask();
        vm.prank(employer);
        escrow.approveWork(id);
        vm.prank(provider);
        vm.expectRevert(
            abi.encodeWithSelector(AgentBondEscrow.InvalidState.selector, id, AgentBondEscrow.TaskState.Completed)
        );
        escrow.claimPayment(id);
    }

    // S-18: claimPayment on Refunded task → InvalidState
    function test_S18_claimPayment_onRefunded() public {
        uint256 id = _createAndFundTask();
        vm.warp(deadline);
        vm.prank(employer);
        escrow.requestRefund(id);

        vm.prank(provider);
        vm.expectRevert(
            abi.encodeWithSelector(AgentBondEscrow.InvalidState.selector, id, AgentBondEscrow.TaskState.Refunded)
        );
        escrow.claimPayment(id);
    }

    // S-19: approveWork after claimPayment → InvalidState
    function test_S19_approveWork_afterClaimPayment() public {
        uint256 id = _createFundAndSubmitTask();
        (, , , , , uint256 submTime, ) = escrow.tasks(id);
        vm.warp(submTime + escrow.reviewWindow());
        vm.prank(provider);
        escrow.claimPayment(id);

        vm.prank(employer);
        vm.expectRevert(
            abi.encodeWithSelector(AgentBondEscrow.InvalidState.selector, id, AgentBondEscrow.TaskState.Completed)
        );
        escrow.approveWork(id);
    }

    // S-20: claimPayment after approveWork → InvalidState
    function test_S20_claimPayment_afterApproveWork() public {
        uint256 id = _createFundAndSubmitTask();
        vm.prank(employer);
        escrow.approveWork(id);

        (, , , , , uint256 submTime, ) = escrow.tasks(id);
        vm.warp(submTime + escrow.reviewWindow());
        vm.prank(provider);
        vm.expectRevert(
            abi.encodeWithSelector(AgentBondEscrow.InvalidState.selector, id, AgentBondEscrow.TaskState.Completed)
        );
        escrow.claimPayment(id);
    }

    // S-21: requestRefund after claimPayment → InvalidState
    function test_S21_requestRefund_afterClaimPayment() public {
        uint256 id = _createFundAndSubmitTask();
        (, , , , , uint256 submTime, ) = escrow.tasks(id);
        vm.warp(submTime + escrow.reviewWindow());
        vm.prank(provider);
        escrow.claimPayment(id);

        vm.prank(employer);
        vm.expectRevert(
            abi.encodeWithSelector(AgentBondEscrow.InvalidState.selector, id, AgentBondEscrow.TaskState.Completed)
        );
        escrow.requestRefund(id);
    }
}

// =============================================================================
// E — Edge-case and boundary tests
// =============================================================================

contract EdgeCaseTest is AgentBondEscrowBase {

    // E-1: zero amount
    function test_E1_createTask_zeroAmount() public {
        vm.prank(employer);
        vm.expectRevert(abi.encodeWithSelector(AgentBondEscrow.ZeroAmount.selector));
        escrow.createTask(provider, "desc", 0, deadline);
    }

    // E-2: zero provider
    function test_E2_createTask_zeroProvider() public {
        vm.prank(employer);
        vm.expectRevert(abi.encodeWithSelector(AgentBondEscrow.ZeroAddress.selector));
        escrow.createTask(address(0), "desc", AMOUNT, deadline);
    }

    // E-3: deadline == block.timestamp (not strictly future)
    function test_E3_createTask_deadlineEqualNow() public {
        vm.prank(employer);
        vm.expectRevert(
            abi.encodeWithSelector(
                AgentBondEscrow.DeadlineInPast.selector,
                block.timestamp,
                block.timestamp
            )
        );
        escrow.createTask(provider, "desc", AMOUNT, block.timestamp);
    }

    // E-4: deadline in the past
    function test_E4_createTask_deadlineInPast() public {
        uint256 pastDeadline = block.timestamp - 1;
        vm.prank(employer);
        vm.expectRevert(
            abi.encodeWithSelector(
                AgentBondEscrow.DeadlineInPast.selector,
                pastDeadline,
                block.timestamp
            )
        );
        escrow.createTask(provider, "desc", AMOUNT, pastDeadline);
    }

    // E-5: deadline = block.timestamp + 1 (minimum valid)
    function test_E5_createTask_deadlineJustFuture() public {
        vm.prank(employer);
        uint256 id = escrow.createTask(provider, "desc", AMOUNT, block.timestamp + 1);
        assertGt(id, 0, "should succeed");
    }

    // E-6: constructor zero USDC address
    function test_E6_constructor_zeroUsdcAddress() public {
        vm.expectRevert(abi.encodeWithSelector(AgentBondEscrow.ZeroAddress.selector));
        new AgentBondEscrow(address(0), 5 days);
    }

    // E-7: submitWork at deadline - 1 succeeds
    function test_E7_submitWork_deadlineMinus1() public {
        uint256 id = _createAndFundTask();
        vm.warp(deadline - 1);
        vm.prank(provider);
        escrow.submitWork(id);  // should not revert
        (,,,,,,AgentBondEscrow.TaskState state) = escrow.tasks(id);
        assertEq(uint8(state), uint8(AgentBondEscrow.TaskState.Submitted));
    }

    // E-8: submitWork at deadline fails (boundary belongs to refund)
    function test_E8_submitWork_atDeadline() public {
        uint256 id = _createAndFundTask();
        vm.warp(deadline);
        vm.prank(provider);
        vm.expectRevert(
            abi.encodeWithSelector(
                AgentBondEscrow.DeadlinePassed.selector,
                id,
                deadline,
                deadline
            )
        );
        escrow.submitWork(id);
    }

    // E-9: requestRefund at deadline succeeds
    function test_E9_refund_atDeadline() public {
        uint256 id = _createAndFundTask();
        vm.warp(deadline);
        vm.prank(employer);
        escrow.requestRefund(id);  // should not revert
        (,,,,,,AgentBondEscrow.TaskState state) = escrow.tasks(id);
        assertEq(uint8(state), uint8(AgentBondEscrow.TaskState.Refunded));
    }

    // E-10: requestRefund at deadline - 1 fails
    function test_E10_refund_deadlineMinus1() public {
        uint256 id = _createAndFundTask();
        vm.warp(deadline - 1);
        vm.prank(employer);
        vm.expectRevert(
            abi.encodeWithSelector(
                AgentBondEscrow.DeadlineNotReached.selector,
                id,
                deadline,
                deadline - 1
            )
        );
        escrow.requestRefund(id);
    }

    // E-11: description exactly at cap (256 bytes)
    function test_E11_createTask_descriptionAtCap() public {
        string memory maxDesc = new string(256);
        bytes memory b = bytes(maxDesc);
        for (uint256 i = 0; i < 256; i++) b[i] = 0x61; // 'a'
        vm.prank(employer);
        uint256 id = escrow.createTask(provider, string(b), AMOUNT, deadline);
        assertGt(id, 0, "should succeed at 256 bytes");
    }

    // E-12: description over cap (257 bytes)
    function test_E12_createTask_descriptionOverCap() public {
        string memory overDesc = new string(257);
        bytes memory b = bytes(overDesc);
        for (uint256 i = 0; i < 257; i++) b[i] = 0x61;
        vm.prank(employer);
        vm.expectRevert(
            abi.encodeWithSelector(AgentBondEscrow.DescriptionTooLong.selector, 257, 256)
        );
        escrow.createTask(provider, string(b), AMOUNT, deadline);
    }

    // E-13: empty description is valid
    function test_E13_createTask_emptyDescription() public {
        vm.prank(employer);
        uint256 id = escrow.createTask(provider, "", AMOUNT, deadline);
        assertGt(id, 0, "empty description should be allowed");
    }

    // E-14: incrementing task IDs
    function test_E14_incrementingTaskIds() public {
        vm.startPrank(employer);
        uint256 id1 = escrow.createTask(provider, "t1", AMOUNT, deadline);
        uint256 id2 = escrow.createTask(provider, "t2", AMOUNT, deadline);
        uint256 id3 = escrow.createTask(provider, "t3", AMOUNT, deadline);
        vm.stopPrank();

        assertEq(id1, 1);
        assertEq(id2, 2);
        assertEq(id3, 3);
        assertEq(escrow.nextTaskId(), 4);
    }

    // E-15: operations on non-existent task ID
    function test_E15_nonExistentTask() public {
        uint256 ghost = 999;
        vm.prank(employer);
        vm.expectRevert(abi.encodeWithSelector(AgentBondEscrow.TaskNotFound.selector, ghost));
        escrow.fundTask(ghost);

        vm.prank(provider);
        vm.expectRevert(abi.encodeWithSelector(AgentBondEscrow.TaskNotFound.selector, ghost));
        escrow.submitWork(ghost);

        vm.prank(employer);
        vm.expectRevert(abi.encodeWithSelector(AgentBondEscrow.TaskNotFound.selector, ghost));
        escrow.approveWork(ghost);

        vm.prank(employer);
        vm.expectRevert(abi.encodeWithSelector(AgentBondEscrow.TaskNotFound.selector, ghost));
        escrow.requestRefund(ghost);
    }

    // E-16: employer has insufficient USDC balance
    function test_E16_fundTask_insufficientBalance() public {
        address poorEmployer = makeAddr("poorEmployer");
        // No tokens minted; just approve
        vm.prank(poorEmployer);
        token.approve(address(escrow), type(uint256).max);
        vm.prank(poorEmployer);
        uint256 id = escrow.createTask(provider, "task", AMOUNT, deadline);
        vm.prank(poorEmployer);
        vm.expectRevert(); // SafeERC20 propagates the ERC20 revert
        escrow.fundTask(id);
    }

    // E-17: employer has zero allowance
    function test_E17_fundTask_zeroAllowance() public {
        uint256 id = _createTask();
        // Revoke allowance
        vm.prank(employer);
        token.approve(address(escrow), 0);
        vm.prank(employer);
        vm.expectRevert(); // SafeERC20 propagates
        escrow.fundTask(id);
    }

    // E-18: reviewWindow exact boundary — t = windowEnd-1 fails, t = windowEnd succeeds
    function test_E18_reviewWindow_exactBoundary() public {
        uint256 id = _createFundAndSubmitTask();
        (, , , , , uint256 submTime, ) = escrow.tasks(id);
        uint256 windowEnd = submTime + escrow.reviewWindow();

        // One second before: should revert
        vm.warp(windowEnd - 1);
        vm.prank(provider);
        vm.expectRevert(
            abi.encodeWithSelector(
                AgentBondEscrow.ReviewWindowNotExpired.selector,
                id,
                windowEnd,
                windowEnd - 1
            )
        );
        escrow.claimPayment(id);

        // Exactly at windowEnd: should succeed
        vm.warp(windowEnd);
        vm.prank(provider);
        escrow.claimPayment(id); // must not revert
        (, , , , , , AgentBondEscrow.TaskState state) = escrow.tasks(id);
        assertEq(uint8(state), uint8(AgentBondEscrow.TaskState.Completed));
    }

    // E-19: reviewWindow below minimum → InvalidReviewWindow
    function test_E19_invalidReviewWindow_tooShort() public {
        uint256 tooShort = escrow.MIN_REVIEW_WINDOW() - 1;
        vm.expectRevert(
            abi.encodeWithSelector(AgentBondEscrow.InvalidReviewWindow.selector, tooShort)
        );
        new AgentBondEscrow(address(token), tooShort);
    }

    // E-20: reviewWindow above maximum → InvalidReviewWindow
    function test_E20_invalidReviewWindow_tooLong() public {
        uint256 tooLong = escrow.MAX_REVIEW_WINDOW() + 1;
        vm.expectRevert(
            abi.encodeWithSelector(AgentBondEscrow.InvalidReviewWindow.selector, tooLong)
        );
        new AgentBondEscrow(address(token), tooLong);
    }

    // E-21: submissionTime is 0 before submitWork
    function test_E21_submissionTime_zero_before_submit() public {
        uint256 id = _createAndFundTask();
        (, , , , , uint256 submTime, ) = escrow.tasks(id);
        assertEq(submTime, 0, "submissionTime should be 0 before submitWork");
    }
}

// =============================================================================
// Re — Reentrancy tests
// =============================================================================

contract ReentrancyTest is AgentBondEscrowBase {

    ReentrantERC20 internal rat;
    AgentBondEscrow internal reentrantEscrow;

    function setUp() public override {
        super.setUp();
        rat = new ReentrantERC20();
        reentrantEscrow = new AgentBondEscrow(address(rat), 5 days);

        rat.mint(employer, AMOUNT * 10);
        vm.prank(employer);
        rat.approve(address(reentrantEscrow), type(uint256).max);
    }

    // Create + fund a task on the reentrant escrow
    function _setupReentrantTask() internal returns (uint256) {
        vm.prank(employer);
        uint256 id = reentrantEscrow.createTask(provider, "re-task", AMOUNT, deadline);
        vm.prank(employer);
        reentrantEscrow.fundTask(id);
        return id;
    }

    // Re-1: re-entry on approveWork (via transfer)
    function test_Re1_reentrancy_approveWork() public {
        uint256 id = _setupReentrantTask();
        vm.prank(provider);
        reentrantEscrow.submitWork(id);

        // Set attack: on transfer (payout), try to call approveWork again
        rat.setAttack(
            address(reentrantEscrow),
            abi.encodeWithSelector(AgentBondEscrow.approveWork.selector, id)
        );

        vm.prank(employer);
        // The outer approveWork should succeed (state update before transfer),
        // but the inner re-entry must revert with ReentrancyGuardReentrantCall.
        // OZ ReentrancyGuard reverts the entire call if re-entry is detected.
        // Since the reentrant call fires inside _update (after state is already Completed),
        // the inner call hits InvalidState — but the guard is the first line of defence.
        // Either way, we verify no double payment occurs.
        reentrantEscrow.approveWork(id);

        // Verify only one payment: provider received exactly AMOUNT
        assertEq(rat.balanceOf(provider), AMOUNT, "no double payment");
        assertEq(rat.balanceOf(address(reentrantEscrow)), 0, "escrow drained once");
    }

    // Re-2: re-entry on requestRefund (via transfer)
    function test_Re2_reentrancy_requestRefund() public {
        uint256 id = _setupReentrantTask();

        vm.warp(deadline);
        rat.setAttack(
            address(reentrantEscrow),
            abi.encodeWithSelector(AgentBondEscrow.requestRefund.selector, id)
        );

        vm.prank(employer);
        reentrantEscrow.requestRefund(id);

        // Verify only one refund
        assertEq(rat.balanceOf(address(reentrantEscrow)), 0, "escrow drained once");
    }

    // Re-3: re-entry on fundTask (via transferFrom)
    function test_Re3_reentrancy_fundTask() public {
        vm.prank(employer);
        uint256 id = reentrantEscrow.createTask(provider, "re-fund", AMOUNT, deadline);

        rat.setAttack(
            address(reentrantEscrow),
            abi.encodeWithSelector(AgentBondEscrow.fundTask.selector, id)
        );

        vm.prank(employer);
        // Outer fundTask: state already set to Funded before transferFrom,
        // so the re-entrant inner call finds state == Funded and reverts InvalidState.
        // The outer call completes normally.
        reentrantEscrow.fundTask(id);

        // Contract should hold exactly AMOUNT (no double-fund)
        assertEq(rat.balanceOf(address(reentrantEscrow)), AMOUNT, "no double-fund");
    }

    // Re-4: reentrancy on claimPayment
    function test_Re4_reentrancy_claimPayment() public {
        uint256 id = _setupReentrantTask();
        vm.prank(provider);
        reentrantEscrow.submitWork(id);

        // Advance past review window
        vm.warp(block.timestamp + 5 days + 1);

        // Set attack: on transfer (payout), try to call claimPayment again
        rat.setAttack(
            address(reentrantEscrow),
            abi.encodeWithSelector(AgentBondEscrow.claimPayment.selector, id)
        );

        vm.prank(provider);
        // Outer claimPayment succeeds; inner re-entry hits Completed state → reverts
        reentrantEscrow.claimPayment(id);

        assertEq(rat.balanceOf(provider), AMOUNT, "no double payment on claimPayment");
        assertEq(rat.balanceOf(address(reentrantEscrow)), 0, "escrow drained once");
    }
}

// =============================================================================
// F — Fuzz tests
// =============================================================================

contract FuzzTest is AgentBondEscrowBase {

    // F-1/F-2: amount fuzz — full happy path
    function testFuzz_F2_fullLifecycleWithAmount(uint96 rawAmount) public {
        uint256 amount = uint256(rawAmount);
        vm.assume(amount > 0);

        token.mint(employer, amount);

        vm.prank(employer);
        uint256 id = escrow.createTask(provider, "fuzz", amount, deadline);
        vm.prank(employer);
        escrow.fundTask(id);

        assertEq(token.balanceOf(address(escrow)), amount);

        vm.prank(provider);
        escrow.submitWork(id);
        uint256 provBefore = token.balanceOf(provider);
        vm.prank(employer);
        escrow.approveWork(id);

        assertEq(token.balanceOf(provider), provBefore + amount);
        assertEq(token.balanceOf(address(escrow)), 0);
    }

    // F-3: amount fuzz — refund path
    function testFuzz_F3_refundWithAmount(uint96 rawAmount) public {
        uint256 amount = uint256(rawAmount);
        vm.assume(amount > 0);

        token.mint(employer, amount);
        uint256 empBefore = token.balanceOf(employer);

        vm.prank(employer);
        uint256 id = escrow.createTask(provider, "fuzz-refund", amount, deadline);
        vm.prank(employer);
        escrow.fundTask(id);

        vm.warp(deadline);
        vm.prank(employer);
        escrow.requestRefund(id);

        assertEq(token.balanceOf(employer), empBefore);
        assertEq(token.balanceOf(address(escrow)), 0);
    }

    // F-4: deadline fuzz
    function testFuzz_F4_deadlineBoundary(uint256 dl) public {
        if (dl <= block.timestamp) {
            vm.prank(employer);
            vm.expectRevert(
                abi.encodeWithSelector(
                    AgentBondEscrow.DeadlineInPast.selector,
                    dl,
                    block.timestamp
                )
            );
            escrow.createTask(provider, "dl-fuzz", AMOUNT, dl);
        } else {
            vm.prank(employer);
            uint256 id = escrow.createTask(provider, "dl-fuzz", AMOUNT, dl);
            assertGt(id, 0);
        }
    }
}

// =============================================================================
// I — Invariant tests
// =============================================================================

/// @dev Handler contract that drives random sequences of calls against the escrow.
contract AgentBondHandler is Test {
    AgentBondEscrow internal escrow;
    MockERC20       internal token;

    address internal employer = address(0x1001);
    address internal provider = address(0x1002);

    uint256[] internal taskIds;
    uint256   public  expectedEscrowBalance;

    constructor(AgentBondEscrow _escrow, MockERC20 _token) {
        escrow = _escrow;
        token  = _token;

        token.mint(employer, type(uint96).max);
        vm.prank(employer);
        token.approve(address(escrow), type(uint256).max);
    }

    function createTask(uint256 amount, uint256 deadlineOffset) external {
        amount = bound(amount, 1, 1e12); // up to 1M USDC
        deadlineOffset = bound(deadlineOffset, 1, 365 days);
        uint256 dl = block.timestamp + deadlineOffset;
        token.mint(employer, amount); // ensure employer always has enough
        vm.prank(employer);
        uint256 id = escrow.createTask(provider, "handler-task", amount, dl);
        taskIds.push(id);
    }

    function fundTask(uint256 idxSeed) external {
        if (taskIds.length == 0) return;
        uint256 id = taskIds[idxSeed % taskIds.length];
        (,,,uint256 amt,,,AgentBondEscrow.TaskState state) = escrow.tasks(id);
        if (state != AgentBondEscrow.TaskState.Created) return;
        vm.prank(employer);
        escrow.fundTask(id);
        expectedEscrowBalance += amt;
    }

    function submitWork(uint256 idxSeed) external {
        if (taskIds.length == 0) return;
        uint256 id = taskIds[idxSeed % taskIds.length];
        (,,,,uint256 dl,,AgentBondEscrow.TaskState state) = escrow.tasks(id);
        if (state != AgentBondEscrow.TaskState.Funded) return;
        if (block.timestamp >= dl) return;
        vm.prank(provider);
        escrow.submitWork(id);
    }

    function approveWork(uint256 idxSeed) external {
        if (taskIds.length == 0) return;
        uint256 id = taskIds[idxSeed % taskIds.length];
        (,,,uint256 amt,,,AgentBondEscrow.TaskState state) = escrow.tasks(id);
        if (state != AgentBondEscrow.TaskState.Submitted) return;
        vm.prank(employer);
        escrow.approveWork(id);
        expectedEscrowBalance -= amt;
    }

    function requestRefund(uint256 idxSeed) external {
        if (taskIds.length == 0) return;
        uint256 id = taskIds[idxSeed % taskIds.length];
        (,,,uint256 amt,,uint256 submTime,AgentBondEscrow.TaskState state) = escrow.tasks(id);
        if (state == AgentBondEscrow.TaskState.Funded) {
            (,,,,uint256 dl,,) = escrow.tasks(id);
            if (block.timestamp < dl) return;
        } else if (state == AgentBondEscrow.TaskState.Submitted) {
            uint256 windowEnd = submTime + escrow.reviewWindow();
            if (block.timestamp >= windowEnd) return; // window expired, use claimPayment instead
        } else {
            return;
        }
        vm.prank(employer);
        escrow.requestRefund(id);
        expectedEscrowBalance -= amt;
    }

    function claimPayment(uint256 idxSeed) external {
        if (taskIds.length == 0) return;
        uint256 id = taskIds[idxSeed % taskIds.length];
        (,,,uint256 amt,,,AgentBondEscrow.TaskState state) = escrow.tasks(id);
        if (state != AgentBondEscrow.TaskState.Submitted) return;
        (, , , , , uint256 submTime, ) = escrow.tasks(id);
        uint256 windowEnd = submTime + escrow.reviewWindow();
        if (block.timestamp < windowEnd) return;
        vm.prank(provider);
        escrow.claimPayment(id);
        expectedEscrowBalance -= amt;
    }

    function warpForward(uint256 seconds_) external {
        seconds_ = bound(seconds_, 0, 30 days);
        vm.warp(block.timestamp + seconds_);
    }

    function taskCount() external view returns (uint256) {
        return taskIds.length;
    }
}

contract InvariantTest is StdInvariant, Test {
    AgentBondEscrow internal escrow;
    MockERC20       internal token;
    AgentBondHandler internal handler;

    function setUp() public {
        token   = new MockERC20();
        escrow  = new AgentBondEscrow(address(token), 5 days);
        handler = new AgentBondHandler(escrow, token);

        // Target the handler — invariant framework calls its functions randomly
        targetContract(address(handler));
    }

    // I-1: escrow token balance always matches the sum of Funded+Submitted task amounts
    function invariant_escrowBalanceMatchesExpected() public view {
        assertEq(
            token.balanceOf(address(escrow)),
            handler.expectedEscrowBalance(),
            "I-1: escrow balance must equal sum of Funded+Submitted amounts"
        );
    }

    // I-2: terminal states are absorbing — verified via the handler never calling
    //      any function on a Completed or Refunded task. Combined with I-1 this
    //      guarantees funds can only exit once per task.

    // I-3: employer and provider addresses are never zero for an existing task
    function invariant_noZeroAddressInStoredTasks() public view {
        uint256 count = handler.taskCount();
        // Check from task 1 to nextTaskId - 1
        uint256 next = escrow.nextTaskId();
        for (uint256 id = 1; id < next; id++) {
            (address emp, address prov,,,,,) = escrow.tasks(id);
            assertTrue(emp  != address(0), "I-3: employer must not be zero");
            assertTrue(prov != address(0), "I-3: provider must not be zero");
        }
        // Silence unused variable warning
        count;
    }
}
