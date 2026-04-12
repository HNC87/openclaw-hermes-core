/**
 * HermesContextEngine - OpenClaw ContextEngine Implementation
 *
 * Implements the four-layer memory architecture:
 * 1. Prompt Memory - Injected via before_prompt_build hook
 * 2. Session Archive - SQLite FTS5 for full-text search
 * 3. Skills - Native OpenClaw skills directory
 * 4. External Provider - Auxiliary model routing
 */

import { SQLiteStore } from '../memory/sqlite-store.js';
import { FileStore } from '../memory/file-store.js';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Extract text content from an AgentMessage
 */
function getMessageContent(msg) {
  if (!msg) return '';
  if (typeof msg.content === 'string') {
    return msg.content;
  }
  if (Array.isArray(msg.content)) {
    return msg.content.map(c => typeof c === 'string' ? c : (c.text || '')).join('');
  }
  return '';
}

/**
 * Extract tool calls from an AgentMessage
 */
function getMessageToolCalls(msg) {
  if (!msg) return undefined;
  if ('tool_calls' in msg && msg.tool_calls) {
    return JSON.stringify(msg.tool_calls);
  }
  return undefined;
}

export class HermesContextEngine {
  constructor(config = {}) {
    this.info = {
      id: 'hermes-core',
      name: 'Hermes Context Engine',
      version: '1.0.0',
      ownsCompaction: false
    };

    this.config = config;
    this.sqliteStore = null;
    this.fileStore = null;
    this.initialized = false;
  }

  async ensureInitialized() {
    if (this.initialized) return;

    const homeDir = process.env.HOME || '/Users/hnc';
    const basePath = this.config.memory?.memory_path?.replace('~', homeDir)
      || path.join(homeDir, '.openclaw', 'hermes');

    // Ensure directories exist
    const memoriesDir = path.join(basePath, 'memories');
    const dbPath = this.config.session_archive?.db_path?.replace('~', homeDir)
      || path.join(basePath, 'session.db');

    await fs.promises.mkdir(memoriesDir, { recursive: true });

    this.fileStore = new FileStore(memoriesDir, {
      maxMemorySize: this.config.memory?.max_memory_size || 2200,
      maxUserSize: this.config.memory?.max_user_size || 1375
    });

    if (this.config.session_archive?.fts5_enabled !== false) {
      this.sqliteStore = new SQLiteStore(dbPath);
      await this.sqliteStore.initialize();
    }

    this.initialized = true;
  }

  async bootstrap(params) {
    await this.ensureInitialized();
    return {
      bootstrapped: true
    };
  }

  async maintain(params) {
    await this.ensureInitialized();
    return { maintained: true };
  }

  async ingest(params) {
    await this.ensureInitialized();

    if (params.isHeartbeat || !this.sqliteStore) {
      return { ingested: false };
    }

    try {
      const content = getMessageContent(params.message);
      const toolCalls = getMessageToolCalls(params.message);

      await this.sqliteStore.insertMessage({
        session_id: params.sessionId,
        message_id: crypto.randomUUID(),
        role: params.message.role,
        content: content,
        timestamp: new Date().toISOString(),
        tool_calls: toolCalls
      });

      return { ingested: true };
    } catch (error) {
      console.error('[HermesContextEngine] ingest error:', error);
      return { ingested: false };
    }
  }

  async assemble(params) {
    await this.ensureInitialized();

    const additions = [];

    // 1. Load USER.md and inject user profile
    if (this.fileStore) {
      const userContent = await this.fileStore.loadUser();
      if (userContent) {
        additions.push(`## User Profile\n${userContent}`);
      }

      // 2. Load MEMORY.md and inject persistent memory
      const memoryContent = await this.fileStore.loadMemory();
      if (memoryContent) {
        additions.push(`## Persistent Memory\n${memoryContent}`);
      }
    }

    // 3. Search relevant history from FTS5
    if (this.sqliteStore && params.messages && params.messages.length > 0) {
      const lastMessage = params.messages[params.messages.length - 1];
      const content = getMessageContent(lastMessage);
      if (content) {
        const relevantHistory = await this.sqliteStore.searchRelevant(
          content,
          params.sessionId,
          { limit: 5 }
        );

        if (relevantHistory.length > 0) {
          const historyText = relevantHistory.map(m =>
            `[${new Date(m.timestamp).toLocaleString()}] ${m.role}: ${m.content.substring(0, 300)}`
          ).join('\n');
          additions.push(`## Relevant History\n${historyText}`);
        }
      }
    }

    const systemPromptAddition = additions.join('\n\n');

    return {
      messages: params.messages,
      systemPromptAddition: systemPromptAddition || undefined,
      estimatedTokens: systemPromptAddition ? Math.ceil(systemPromptAddition.length / 4) : 0
    };
  }

  async compact(params) {
    // Compaction is handled by OpenClaw's core; we just acknowledge
    return { ok: true, compacted: true };
  }

  async afterTurn(params) {
    // This is called after each turn; learning trigger is handled by separate hooks
    await this.ensureInitialized();

    if (params.runtimeContext) {
      // Pass session info to runtime context for learning hooks
      params.runtimeContext.hermesSessionId = params.sessionId;
    }
  }

  dispose() {
    if (this.sqliteStore) {
      this.sqliteStore.close();
    }
    this.initialized = false;
  }
}
