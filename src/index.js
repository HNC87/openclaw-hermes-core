/**
 * Hermes Core Plugin for OpenClaw
 *
 * Integrates Hermes Agent's four-layer memory architecture and self-learning loop
 * into the OpenClaw framework.
 *
 * License: MIT (Hermes Agent) + Apache 2.0 (OpenClaw)
 */

import { HermesContextEngine } from './context-engine/hermes-context-engine.js';
import { beforePromptHook } from './hooks/before-prompt-hook.js';
import { afterToolCallHook, agentEndHook } from './hooks/learning-hooks.js';
import { sessionSearchTool } from './tools/session-search.js';
import { memoryManageTool } from './tools/memory-manage.js';
import { skillManageTool } from './tools/skill-manage.js';

const hermesCorePlugin = {
  id: 'hermes-core',
  name: 'Hermes Core Integration',
  description: 'Adds self-learning loop and four-layer memory architecture from Hermes Agent',

  register(api) {
    // Register ContextEngine
    api.registerContextEngine('hermes-engine', () => new HermesContextEngine());

    // Register Hooks
    api.registerHook('before_prompt_build', beforePromptHook, { name: 'hermes-before-prompt' });
    api.registerHook('after_tool_call', afterToolCallHook, { name: 'hermes-after-tool' });
    api.registerHook('agent_end', agentEndHook, { name: 'hermes-agent-end' });

    // Register Tools
    api.registerTool(sessionSearchTool);
    api.registerTool(memoryManageTool);
    api.registerTool(skillManageTool);
  }
};

export default hermesCorePlugin;

// Export for external access / testing
export { HermesContextEngine } from './context-engine/hermes-context-engine.js';
export { skillManageTool } from './tools/skill-manage.js';
export { TriggerDetector } from './learning/trigger-detector.js';