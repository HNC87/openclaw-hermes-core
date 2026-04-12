/**
 * Hermes Core Plugin for OpenClaw
 *
 * Integrates Hermes Agent's four-layer memory architecture and self-learning loop
 * into the OpenClaw framework.
 *
 * Features:
 * - Self-Learning Loop (automatic skill generation)
 * - Four-Layer Memory Architecture
 * - Semantic Memory (embedding-based search)
 * - Context Compression (Token optimization)
 * - Task Planning & Decomposition
 * - Real-time Data Integration
 * - Multi-modal Memory (images, charts)
 *
 * License: MIT (Hermes Agent) + Apache 2.0 (OpenClaw)
 */

import { HermesContextEngine } from './context-engine/hermes-context-engine.js';
import { beforePromptHook } from './hooks/before-prompt-hook.js';
import { afterToolCallHook, agentEndHook } from './hooks/learning-hooks.js';
import { sessionSearchTool } from './tools/session-search.js';
import { memoryManageTool } from './tools/memory-manage.js';
import { skillManageTool } from './tools/skill-manage.js';
import { SemanticMemory } from './memory/semantic-memory.js';
import { ContextCompressor } from './memory/context-compressor.js';
import { Planner } from './learning/planner.js';
import { MultiModalMemory } from './memory/multimodal-memory.js';
import { realtimeDataTool } from './providers/realtime-data.js';
import { Type } from '@sinclair/typebox';

// Hermes Memory Manager - manages all memory types
class HermesMemoryManager {
  constructor(basePath) {
    this.basePath = basePath;
    this.semantic = new SemanticMemory(basePath);
    this.compressor = new ContextCompressor(basePath);
    this.multimodal = new MultiModalMemory(basePath);
  }

  getContext() {
    return this.compressor.getContextForPrompt();
  }
}

// Semantic Memory Tool
const SemanticMemoryParams = Type.Object({
  action: Type.String(),
  query: Type.Optional(Type.String()),
  key: Type.Optional(Type.String()),
  content: Type.Optional(Type.String()),
  metadata: Type.Optional(Type.Object({
    symbol: Type.Optional(Type.String()),
    type: Type.Optional(Type.String())
  })),
  limit: Type.Optional(Type.Number())
});

const semanticMemoryTool = {
  name: 'semantic_memory',
  description: `Semantic memory search and management.
    Uses embedding-based search to find related content even without exact keyword matches.
    Example: "上次讨论的那个止损方法" → finds stop-loss related content`,
  parameters: SemanticMemoryParams,

  async execute(_id, params) {
    const homeDir = process.env.HOME || '/Users/hnc';
    const basePath = `${homeDir}/.openclaw/hermes`;
    const memory = new SemanticMemory(basePath);

    const { action, query, key, content, metadata, limit } = params;

    switch (action) {
      case 'add':
        if (!key || !content) {
          return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'key and content required' }) }] };
        }
        await memory.addContent(key, content, metadata || {});
        return { content: [{ type: 'text', text: JSON.stringify({ success: true, action: 'add', key }) }] };

      case 'search':
        if (!query) {
          return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'query required' }) }] };
        }
        const results = await memory.search(query, limit || 5);
        return { content: [{ type: 'text', text: JSON.stringify({ success: true, results }) }] };

      case 'stats':
        const stats = memory.getStats();
        return { content: [{ type: 'text', text: JSON.stringify({ success: true, stats }) }] };

      case 'clear':
        memory.clear();
        return { content: [{ type: 'text', text: JSON.stringify({ success: true, action: 'clear' }) }] };

      default:
        return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: `Unknown action: ${action}` }) }] };
    }
  }
};

// Context Compression Tool
const ContextCompressionParams = Type.Object({
  action: Type.String(),
  content: Type.Optional(Type.String()),
  role: Type.Optional(Type.String()),
  decision: Type.Optional(Type.String()),
  rule: Type.Optional(Type.String()),
  preference: Type.Optional(Type.String()),
  threshold: Type.Optional(Type.Number())
});

const contextCompressionTool = {
  name: 'context_compression',
  description: `Manage conversation context and reduce token usage.
    Automatically compresses long conversations while preserving key decisions.
    Use before_long_analysis to optimize context.`,
  parameters: ContextCompressionParams,

  async execute(_id, params) {
    const homeDir = process.env.HOME || '/Users/hnc';
    const basePath = `${homeDir}/.openclaw/hermes`;
    const compressor = new ContextCompressor(basePath);

    const { action, content, role, decision, rule, preference, threshold } = params;

    switch (action) {
      case 'add':
        if (!content || !role) {
          return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'content and role required' }) }] };
        }
        compressor.addTurn(role, content);
        return { content: [{ type: 'text', text: JSON.stringify({ success: true, action: 'add' }) }] };

      case 'compress':
        const result = compressor.compress(threshold || 15000);
        return { content: [{ type: 'text', text: JSON.stringify({ success: true, ...result }) }] };

      case 'summary':
        const summary = compressor.getSummary();
        return { content: [{ type: 'text', text: JSON.stringify({ success: true, summary }) }] };

      case 'context':
        const context = compressor.getContextForPrompt();
        return { content: [{ type: 'text', text: JSON.stringify({ success: true, context }) }] };

      case 'add_decision':
        if (!decision) {
          return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'decision required' }) }] };
        }
        compressor.addDecision(decision);
        return { content: [{ type: 'text', text: JSON.stringify({ success: true, action: 'add_decision' }) }] };

      case 'add_rule':
        if (!rule) {
          return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'rule required' }) }] };
        }
        compressor.addRule(rule);
        return { content: [{ type: 'text', text: JSON.stringify({ success: true, action: 'add_rule' }) }] };

      case 'add_preference':
        if (!preference) {
          return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'preference required' }) }] };
        }
        compressor.addPreference(preference);
        return { content: [{ type: 'text', text: JSON.stringify({ success: true, action: 'add_preference' }) }] };

      case 'stats':
        const stats = compressor.getStats();
        return { content: [{ type: 'text', text: JSON.stringify({ success: true, stats }) }] };

      default:
        return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: `Unknown action: ${action}` }) }] };
    }
  }
};

// Planning Tool
const PlanningParams = Type.Object({
  action: Type.String(),
  goal: Type.Optional(Type.String()),
  plan_id: Type.Optional(Type.String()),
  step_id: Type.Optional(Type.String()),
  status: Type.Optional(Type.String()),
  note: Type.Optional(Type.String())
});

const planningTool = {
  name: 'planning',
  description: `Goal decomposition and task planning.
    Automatically decomposes complex goals into actionable steps.
    Tracks progress and adapts plans based on execution feedback.
    Example: "帮我建立一套黄金日内交易系统" → creates step-by-step plan`,
  parameters: PlanningParams,

  async execute(_id, params) {
    const homeDir = process.env.HOME || '/Users/hnc';
    const basePath = `${homeDir}/.openclaw/hermes`;
    const planner = new Planner(basePath);

    const { action, goal, plan_id, step_id, status, note } = params;

    switch (action) {
      case 'decompose':
        if (!goal) {
          return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'goal required' }) }] };
        }
        const plan = planner.decompose(goal, 'trading');
        const formattedPlan = planner.formatPlan(plan);
        return { content: [{ type: 'text', text: JSON.stringify({ success: true, plan, formattedPlan }) }] };

      case 'update_step':
        if (!plan_id || !step_id || !status) {
          return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'plan_id, step_id, and status required' }) }] };
        }
        const updatedPlan = planner.updateStep(plan_id, step_id, status, note);
        const formattedUpdatedPlan = planner.formatPlan(updatedPlan);
        return { content: [{ type: 'text', text: JSON.stringify({ success: true, plan: updatedPlan, formattedPlan: formattedUpdatedPlan }) }] };

      case 'get':
        if (!plan_id) {
          return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'plan_id required' }) }] };
        }
        const getPlan = planner.getPlan(plan_id);
        if (!getPlan) {
          return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'Plan not found' }) }] };
        }
        return { content: [{ type: 'text', text: JSON.stringify({ success: true, plan: getPlan, formattedPlan: planner.formatPlan(getPlan) }) }] };

      case 'list':
        const plans = planner.listPlans();
        return { content: [{ type: 'text', text: JSON.stringify({ success: true, plans }) }] };

      case 'delete':
        if (!plan_id) {
          return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'plan_id required' }) }] };
        }
        planner.deletePlan(plan_id);
        return { content: [{ type: 'text', text: JSON.stringify({ success: true, action: 'delete' }) }] };

      case 'stats':
        const stats = planner.getStats();
        return { content: [{ type: 'text', text: JSON.stringify({ success: true, stats }) }] };

      default:
        return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: `Unknown action: ${action}` }) }] };
    }
  }
};

// Multi-modal Memory Tool
const MultiModalParams = Type.Object({
  action: Type.String(),
  image_data: Type.Optional(Type.String()),
  image_id: Type.Optional(Type.String()),
  query: Type.Optional(Type.String()),
  metadata: Type.Optional(Type.Object({
    symbol: Type.Optional(Type.String()),
    type: Type.Optional(Type.String()),
    pattern: Type.Optional(Type.String()),
    description: Type.Optional(Type.String()),
    tags: Type.Optional(Type.Array(Type.String()))
  })),
  filters: Type.Optional(Type.Object({
    symbol: Type.Optional(Type.String()),
    type: Type.Optional(Type.String()),
    pattern: Type.Optional(Type.String())
  })),
  tag: Type.Optional(Type.String()),
  limit: Type.Optional(Type.Number())
});

const multiModalMemoryTool = {
  name: 'multimodal_memory',
  description: `Store and retrieve trading charts, screenshots, and K-line patterns.
    Uses semantic search to find similar charts.
    Example: "找一下上次类似的M头形态图"`,
  parameters: MultiModalParams,

  async execute(_id, params) {
    const homeDir = process.env.HOME || '/Users/hnc';
    const basePath = `${homeDir}/.openclaw/hermes`;
    const memory = new MultiModalMemory(basePath);

    const { action, image_data, image_id, query, metadata, filters, tag, limit } = params;

    switch (action) {
      case 'save':
        if (!image_data) {
          return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'image_data required' }) }] };
        }
        const saveResult = await memory.saveImage(image_data, metadata || {});
        return { content: [{ type: 'text', text: JSON.stringify({ success: true, ...saveResult }) }] };

      case 'find_similar':
        if (!query) {
          return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'query required' }) }] };
        }
        const similar = await memory.findSimilar(query, limit || 5);
        return { content: [{ type: 'text', text: JSON.stringify({ success: true, results: similar }) }] };

      case 'get':
        if (!image_id) {
          return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'image_id required' }) }] };
        }
        const image = memory.getImage(image_id);
        if (!image) {
          return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'Image not found' }) }] };
        }
        return { content: [{ type: 'text', text: JSON.stringify({ success: true, image }) }] };

      case 'list':
        const images = memory.listImages(filters || {});
        return { content: [{ type: 'text', text: JSON.stringify({ success: true, images }) }] };

      case 'delete':
        if (!image_id) {
          return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'image_id required' }) }] };
        }
        const deleteResult = memory.deleteImage(image_id);
        return { content: [{ type: 'text', text: JSON.stringify(deleteResult) }] };

      case 'add_tag':
        if (!image_id || !tag) {
          return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'image_id and tag required' }) }] };
        }
        const addTagResult = memory.addTag(image_id, tag);
        return { content: [{ type: 'text', text: JSON.stringify(addTagResult) }] };

      case 'stats':
        const stats = memory.getStats();
        return { content: [{ type: 'text', text: JSON.stringify({ success: true, stats }) }] };

      default:
        return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: `Unknown action: ${action}` }) }] };
    }
  }
};

// Plugin definition
const hermesCorePlugin = {
  id: 'hermes-core',
  name: 'Hermes Core Integration',
  description: 'Self-learning plugin with semantic memory, context compression, planning, and real-time data',

  register(api) {
    // Register ContextEngine
    api.registerContextEngine('hermes-engine', () => new HermesContextEngine());

    // Register Hooks
    api.registerHook('before_prompt_build', beforePromptHook, { name: 'hermes-before-prompt' });
    api.registerHook('after_tool_call', afterToolCallHook, { name: 'hermes-after-tool' });
    api.registerHook('agent_end', agentEndHook, { name: 'hermes-agent-end' });

    // Register Core Tools
    api.registerTool(sessionSearchTool);
    api.registerTool(memoryManageTool);
    api.registerTool(skillManageTool);

    // Register New Advanced Tools
    api.registerTool(semanticMemoryTool);
    api.registerTool(contextCompressionTool);
    api.registerTool(planningTool);
    api.registerTool(realtimeDataTool);
    api.registerTool(multiModalMemoryTool);
  }
};

export default hermesCorePlugin;

// Exports for external access
export { HermesContextEngine } from './context-engine/hermes-context-engine.js';
export { skillManageTool } from './tools/skill-manage.js';
export { TriggerDetector } from './learning/trigger-detector.js';
export { SemanticMemory } from './memory/semantic-memory.js';
export { ContextCompressor } from './memory/context-compressor.js';
export { Planner } from './learning/planner.js';
export { MultiModalMemory } from './memory/multimodal-memory.js';