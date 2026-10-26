// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title AgentBondEscrow
 * @notice Escrow contract for USDC-funded tasks on Arc. Both humans and AI agents
 *         may create tasks and act as providers. The employer funds the task,
 *         the provider submits work, and the employer approves payment release.
 *         After the deadline the employer may request a refund regardless of
 *         whether work was submitted.
 *
 * @dev    Task lifecycle:
 *           createTask()     →  Created
 *           fundTask()       →  Funded       (employer, Created → Funded)
 *           submitWork()     →  Submitted    (provider, Funded → Submitted, before deadline)
 *           approveWork()    →  Completed    (employer, Submitted → Completed, any time)
 *           claimPayment()   →  Completed    (provider, Submitted → Completed, after reviewWindow)
 *           requestRefund()  →  Refunded     (employer, Funded → Refunded, >= deadline)
 *                                            (employer, Submitted → Refunded, within reviewWindow)
 *
 *         Security: checks-effects-interactions on every state-mutating function;
 *         ReentrancyGuard on every function that calls the token contract;
 *         SafeERC20 for all token interactions; no admin escape hatch.
 *
 *         Arc note: USDC on Arc is the native gas token (18-decimal native view)
 *         AND an ERC-20 (6-decimal view). This contract exclusively uses the
 *         ERC-20 view; msg.value is never touched.
 */
contract AgentBondEscrow is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // -------------------------------------------------------------------------
    // Types
    // -------------------------------------------------------------------------

    enum TaskState {
        Created,
        Funded,
        Submitted,
        Completed,
        Refunded
    }

    struct Task {
        address employer;     // msg.sender of createTask; funds, approves, and can refund
        address provider;     // submits work; receives payment on approval
        string  description;  // task description / work reference (max MAX_REF_LENGTH bytes)
        uint256 amount;       // USDC amount in 6-decimal ERC-20 units
        uint256 deadline;     // Unix timestamp; refund eligible at block.timestamp >= deadline
        uint256 submissionTime; // Unix timestamp set by submitWork(); 0 until then
        TaskState state;
    }

    // -------------------------------------------------------------------------
    // Constants
    // -------------------------------------------------------------------------

    /// @notice Maximum byte length of the description field.
    uint256 public constant MAX_REF_LENGTH = 256;
    /// @notice Minimum review window the deployer may configure.
    uint256 public constant MIN_REVIEW_WINDOW = 1 days;
    /// @notice Maximum review window the deployer may configure.
    uint256 public constant MAX_REVIEW_WINDOW = 30 days;

    // -------------------------------------------------------------------------
    // State
    // -------------------------------------------------------------------------

    /// @notice The USDC ERC-20 contract. Immutable after construction.
    IERC20 public immutable usdc;
    /// @notice Review window duration set at deployment. Immutable after construction.
    uint256 public immutable reviewWindow;

    /// @notice Next task ID to assign. Starts at 1; ID 0 is never valid.
    uint256 public nextTaskId;

    /// @notice task ID → Task struct.
    mapping(uint256 => Task) public tasks;

    // -------------------------------------------------------------------------
    // Errors
    // -------------------------------------------------------------------------

    error ZeroAddress();
    error ZeroAmount();
    error TaskNotFound(uint256 taskId);
    error NotEmployer(uint256 taskId);
    error NotProvider(uint256 taskId);
    /// @dev current is the state the task is actually in when the call was made.
    error InvalidState(uint256 taskId, TaskState current);
    error DeadlinePassed(uint256 taskId, uint256 deadline, uint256 currentTime);
    error DeadlineNotReached(uint256 taskId, uint256 deadline, uint256 currentTime);
    error DeadlineInPast(uint256 deadline, uint256 currentTime);
    error DescriptionTooLong(uint256 length, uint256 max);
    /// @dev Emitted when requestRefund() is called on a Submitted task after the review window has expired.
    error ReviewWindowExpired(uint256 taskId, uint256 expiredAt, uint256 currentTime);
    /// @dev Emitted when claimPayment() is called before the review window has elapsed.
    error ReviewWindowNotExpired(uint256 taskId, uint256 releaseTime, uint256 currentTime);
    /// @dev Emitted when the reviewWindow_ constructor argument is outside [MIN_REVIEW_WINDOW, MAX_REVIEW_WINDOW].
    error InvalidReviewWindow(uint256 provided);

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    event TaskCreated(
        uint256 indexed taskId,
        address indexed employer,
        address indexed provider,
        uint256 amount,
        uint256 deadline,
        string  description
    );

    event TaskFunded(
        uint256 indexed taskId,
        address indexed employer,
        uint256 amount
    );

    event WorkSubmitted(
        uint256 indexed taskId,
        address indexed provider
    );

    event WorkApproved(
        uint256 indexed taskId,
        address indexed employer,
        address indexed provider,
        uint256 amount
    );

    event RefundIssued(
        uint256 indexed taskId,
        address indexed employer,
        uint256 amount
    );

    event PaymentClaimed(
        uint256 indexed taskId,
        address indexed provider,
        uint256 amount
    );

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    /**
     * @param usdcToken   The ERC-20 USDC token address.
     *                    On Arc: 0x3600000000000000000000000000000000000000
     * @param reviewWindow_ Duration (seconds) the employer has to approve or
     *                    refund after submitWork(). Must be in
     *                    [MIN_REVIEW_WINDOW, MAX_REVIEW_WINDOW].
     *                    Recommended default: 432000 (5 days).
     */
    constructor(address usdcToken, uint256 reviewWindow_) {
        if (usdcToken == address(0)) revert ZeroAddress();
        if (reviewWindow_ < MIN_REVIEW_WINDOW || reviewWindow_ > MAX_REVIEW_WINDOW) {
            revert InvalidReviewWindow(reviewWindow_);
        }
        usdc = IERC20(usdcToken);
        reviewWindow = reviewWindow_;
        nextTaskId = 1;
    }

    // -------------------------------------------------------------------------
    // External functions
    // -------------------------------------------------------------------------

    /**
     * @notice Create a new task. The caller becomes the employer.
     * @param provider    Address that will submit work and receive payment.
     * @param description Task description or off-chain work reference (max 256 bytes).
     * @param amount      USDC amount to escrow, in 6-decimal ERC-20 units. Must be > 0.
     * @param deadline    Unix timestamp after which the employer may request a refund.
     *                    Must be strictly greater than block.timestamp.
     * @return taskId     The newly assigned task ID (starts at 1).
     */
    function createTask(
        address provider,
        string calldata description,
        uint256 amount,
        uint256 deadline
    ) external returns (uint256 taskId) {
        if (provider == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        if (deadline <= block.timestamp) revert DeadlineInPast(deadline, block.timestamp);
        uint256 descLen = bytes(description).length;
        if (descLen > MAX_REF_LENGTH) revert DescriptionTooLong(descLen, MAX_REF_LENGTH);

        taskId = nextTaskId;
        nextTaskId = taskId + 1;

        tasks[taskId] = Task({
            employer:       msg.sender,
            provider:       provider,
            description:    description,
            amount:         amount,
            deadline:       deadline,
            submissionTime: 0,
            state:          TaskState.Created
        });

        emit TaskCreated(taskId, msg.sender, provider, amount, deadline, description);
    }

    /**
     * @notice Fund the task with USDC. Caller must be the employer.
     *         The employer must have approved this contract for at least task.amount
     *         USDC before calling.
     * @param taskId Task to fund.
     */
    function fundTask(uint256 taskId) external nonReentrant {
        Task storage task = _requireExists(taskId);
        if (msg.sender != task.employer) revert NotEmployer(taskId);
        if (task.state != TaskState.Created) revert InvalidState(taskId, task.state);

        // Effects before interaction
        task.state = TaskState.Funded;

        emit TaskFunded(taskId, msg.sender, task.amount);

        // Interaction: pull USDC from employer into this contract
        usdc.safeTransferFrom(msg.sender, address(this), task.amount);
    }

    /**
     * @notice Submit work for the task. Caller must be the designated provider.
     *         Must be called before the deadline.
     * @param taskId Task to mark as submitted.
     */
    function submitWork(uint256 taskId) external {
        Task storage task = _requireExists(taskId);
        if (msg.sender != task.provider) revert NotProvider(taskId);
        if (task.state != TaskState.Funded) revert InvalidState(taskId, task.state);
        if (block.timestamp >= task.deadline) revert DeadlinePassed(taskId, task.deadline, block.timestamp);

        // No external call; no nonReentrant needed.
        task.state = TaskState.Submitted;
        task.submissionTime = block.timestamp;

        emit WorkSubmitted(taskId, msg.sender);
    }

    /**
     * @notice Approve submitted work and release escrowed USDC to the provider.
     *         Caller must be the employer. Task must be in Submitted state.
     * @param taskId Task to approve.
     */
    function approveWork(uint256 taskId) external nonReentrant {
        Task storage task = _requireExists(taskId);
        if (msg.sender != task.employer) revert NotEmployer(taskId);
        if (task.state != TaskState.Submitted) revert InvalidState(taskId, task.state);

        address provider = task.provider;
        uint256 amount   = task.amount;

        // Effects before interaction
        task.state = TaskState.Completed;

        emit WorkApproved(taskId, msg.sender, provider, amount);

        // Interaction: push USDC to provider
        usdc.safeTransfer(provider, amount);
    }

    /**
     * @notice Request a refund of the escrowed USDC back to the employer.
     *         Caller must be the employer.
     *         - Funded state: refund requires block.timestamp >= deadline.
     *         - Submitted state: refund requires block.timestamp < submissionTime + reviewWindow.
     *           Once the review window expires, the provider may call claimPayment() instead.
     *
     * @dev    Checks-Effects-Interactions. nonReentrant.
     *
     * @param taskId Task to refund.
     */
    function requestRefund(uint256 taskId) external nonReentrant {
        Task storage task = _requireExists(taskId);
        if (msg.sender != task.employer) revert NotEmployer(taskId);

        TaskState state = task.state;
        if (state != TaskState.Funded && state != TaskState.Submitted) {
            revert InvalidState(taskId, state);
        }

        if (state == TaskState.Funded) {
            // Funded path: refund eligible once the deadline has passed.
            if (block.timestamp < task.deadline) {
                revert DeadlineNotReached(taskId, task.deadline, block.timestamp);
            }
        } else {
            // Submitted path: refund eligible only within the review window.
            uint256 releaseTime = task.submissionTime + reviewWindow;
            if (block.timestamp >= releaseTime) {
                revert ReviewWindowExpired(taskId, releaseTime, block.timestamp);
            }
        }

        address employer = task.employer;
        uint256 amount   = task.amount;

        // Effects before interaction
        task.state = TaskState.Refunded;

        emit RefundIssued(taskId, employer, amount);

        // Interaction: push USDC back to employer
        usdc.safeTransfer(employer, amount);
    }

    /**
     * @notice Claim payment after the review window has elapsed without employer action.
     *         Caller must be the designated provider. Task must be in Submitted state.
     *         The review window (submissionTime + reviewWindow) must have passed.
     *
     * @dev    This transitions the task to Completed, identical to approveWork().
     *         A separate PaymentClaimed event is emitted so indexers can distinguish
     *         the two completion paths. The employer may still call approveWork() at
     *         any time — including after the review window — to release payment; only
     *         the employer's refund right expires.
     *
     * @param taskId Task to claim payment for.
     */
    function claimPayment(uint256 taskId) external nonReentrant {
        Task storage task = _requireExists(taskId);
        if (msg.sender != task.provider) revert NotProvider(taskId);
        if (task.state != TaskState.Submitted) revert InvalidState(taskId, task.state);

        uint256 releaseTime = task.submissionTime + reviewWindow;
        if (block.timestamp < releaseTime) {
            revert ReviewWindowNotExpired(taskId, releaseTime, block.timestamp);
        }

        address provider = task.provider;
        uint256 amount   = task.amount;

        // Effects before interaction
        task.state = TaskState.Completed;

        emit PaymentClaimed(taskId, provider, amount);

        // Interaction: push USDC to provider
        usdc.safeTransfer(provider, amount);
    }

    // -------------------------------------------------------------------------
    // Internal helpers
    // -------------------------------------------------------------------------

    /**
     * @dev Returns a storage reference to the task, reverting with TaskNotFound
     *      if the task does not exist (employer == address(0)).
     */
    function _requireExists(uint256 taskId) internal view returns (Task storage task) {
        task = tasks[taskId];
        if (task.employer == address(0)) revert TaskNotFound(taskId);
    }
}
