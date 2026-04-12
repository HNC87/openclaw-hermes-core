/**
 * Learning Hooks - Trigger Detection for Self-Learning Loop
 *
 * These hooks monitor tool usage patterns to detect when the Agent
 * has completed a complex task worthy of skill generation:
 *
 * Trigger Conditions:
 * 1. Tool calls >= 5 (complex task)
 * 2. Error recovery (recovered from a tool error)
 * 3. User correction (user provided corrective feedback)
 * 4. Non-trivial workflow (multi-step success without error)
 */

import { TriggerDetector } from '../learning/trigger-detector.js';

// Per-session trigger state
const sessionDetectors = new Map();

function getOrCreateDetector(sessionId) {
  let detector = sessionDetectors.get(sessionId);
  if (!detector) {
    detector = new TriggerDetector();
    sessionDetectors.set(sessionId, detector);
  }
  return detector;
}

/**
 * after_tool_call Hook - Tracks tool usage for trigger detection
 */
export async function afterToolCallHook(event) {
  const sessionId = event.sessionId || event.context?.sessionId || 'default';
  const detector = getOrCreateDetector(sessionId);

  const toolName = event.toolName || event.tool?.name || 'unknown';
  const error = event.error || (event.result?.error ?? null);

  if (error) {
    detector.onToolError(error);
  } else {
    detector.onToolSuccess();
  }

  detector.onToolCall(toolName, event.result);
}

/**
 * agent_end Hook - Evaluates trigger conditions and sets flags
 */
export async function agentEndHook(event) {
  const sessionId = event.sessionId || event.context?.sessionId || 'default';
  const detector = getOrCreateDetector(sessionId);
  const triggerResult = detector.shouldTriggerSkillGeneration();

  if (triggerResult.shouldTrigger && event.runtimeContext) {
    // Set a flag that the Agent can check
    event.runtimeContext.setFlag?.('hermes_should_generate_skill', true);
    event.runtimeContext.setFlag?.('hermes_trigger_reason', triggerResult.reason);

    // Store tool call count for skill generation context (use public getter)
    event.runtimeContext.setFlag?.('hermes_tool_call_count', detector.toolCallCount);
  }

  // Clean up for next session
  if (sessionId) {
    sessionDetectors.delete(sessionId);
  }
}

/**
 * Clear detector for a specific session (for testing/reset)
 */
export function clearSessionDetector(sessionId) {
  sessionDetectors.delete(sessionId);
}
