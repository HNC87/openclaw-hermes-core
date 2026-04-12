/**
 * TriggerDetector - Detects when to Generate New Skills
 *
 * Implements Hermes's self-learning trigger conditions:
 *
 * | Trigger Condition          | Detection Logic                    |
 * |---------------------------|------------------------------------|
 * | Tool calls >= 5           | Counter incremented per after_tool |
 * | Error recovery            | Error flag + subsequent success    |
 * | User correction           | (detected via separate mechanism)  |
 * | Non-trivial workflow      | Multi-step success without error   |
 */

export class TriggerDetector {
  constructor(minToolCalls = 5) {
    this.minToolCalls = minToolCalls;
    this._toolCallCount = 0;
    this.hasError = false;
    this.recoveredFromError = false;
    this.lastError = null;
    this.consecutiveSuccess = 0;
    this.toolNames = [];
  }

  /**
   * Called after each tool call
   */
  onToolCall(toolName, _result) {
    this._toolCallCount++;
    this.toolNames.push(toolName);
  }

  /**
   * Called when a tool returns an error
   */
  onToolError(error) {
    this.hasError = true;
    this.lastError = error;
    this.consecutiveSuccess = 0;
  }

  /**
   * Called when a tool returns success
   */
  onToolSuccess() {
    if (this.hasError) {
      this.recoveredFromError = true;
    }
    this.consecutiveSuccess++;
  }

  /**
   * Called when user provides corrective feedback
   */
  onUserCorrection() {
    this.recoveredFromError = true; // Reuse the flag for user corrections too
  }

  /**
   * Determine if skill generation should be triggered
   */
  shouldTriggerSkillGeneration() {
    // Condition 1: High tool usage
    if (this._toolCallCount >= this.minToolCalls) {
      return {
        shouldTrigger: true,
        reason: `High tool usage detected: ${this._toolCallCount} tool calls (${this.toolNames.join(', ')})`,
        triggerType: 'high_tool_usage'
      };
    }

    // Condition 2: Recovered from error
    if (this.recoveredFromError) {
      return {
        shouldTrigger: true,
        reason: `Recovered from error: "${this.lastError}"`,
        triggerType: 'error_recovery'
      };
    }

    // Condition 3: Non-trivial workflow (5+ consecutive successes is noteworthy)
    if (this.consecutiveSuccess >= 5 && this._toolCallCount >= 3) {
      return {
        shouldTrigger: true,
        reason: `Non-trivial workflow completed: ${this.consecutiveSuccess} consecutive successes`,
        triggerType: 'non_trivial_workflow'
      };
    }

    return {
      shouldTrigger: false,
      reason: ''
    };
  }

  /**
   * Get current tool call count
   */
  get toolCallCount() {
    return this._toolCallCount;
  }

  /**
   * Reset state for new session
   */
  reset() {
    this._toolCallCount = 0;
    this.hasError = false;
    this.recoveredFromError = false;
    this.lastError = null;
    this.consecutiveSuccess = 0;
    this.toolNames = [];
  }

  /**
   * Get summary of current state (for debugging)
   */
  getState() {
    return {
      toolCallCount: this._toolCallCount,
      hasError: this.hasError,
      recoveredFromError: this.recoveredFromError,
      consecutiveSuccess: this.consecutiveSuccess,
      lastError: this.lastError,
      toolNames: [...this.toolNames]
    };
  }
}
