/**
 * Memory Manage Tool - Manage USER.md and MEMORY.md files
 *
 * Provides tools for:
 * - Reading current memory content
 * - Updating user profile (USER.md)
 * - Updating persistent memory (MEMORY.md)
 * - Appending new information
 */

import { FileStore } from '../memory/file-store.js';
import { Type } from '@sinclair/typebox';

const MemoryManageParams = Type.Object({
  action: Type.String(),
  memory_type: Type.Optional(Type.String()),
  content: Type.Optional(Type.String())
});

export const memoryManageTool = {
  name: 'memory_manage',
  description: `Manage Hermes memory files (USER.md and MEMORY.md).
    Use to read or update the user's profile and the agent's persistent memory.
    USER.md contains user preferences and profile info.
    MEMORY.md contains environment facts, project conventions, and learned information.`,

  parameters: MemoryManageParams,

  async execute(_id, params) {
    const homeDir = process.env.HOME || '/Users/hnc';
    const basePath = `${homeDir}/.openclaw/hermes/memories`;

    const store = new FileStore(basePath, {
      maxMemorySize: 2200,
      maxUserSize: 1375
    });

    const action = params.action;
    const memoryType = params.memory_type || 'memory';

    switch (action) {
      case 'read': {
        const content = memoryType === 'user'
          ? await store.loadUser()
          : await store.loadMemory();

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              memory_type: memoryType,
              content: content || '(empty)',
              size: content?.length || 0
            })
          }]
        };
      }

      case 'write': {
        if (!params.content) {
          return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'content is required for write action' }) }] };
        }

        const result = memoryType === 'user'
          ? await store.saveUser(params.content)
          : await store.saveMemory(params.content);

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              memory_type: memoryType,
              ...result
            })
          }]
        };
      }

      case 'append': {
        if (!params.content) {
          return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'content is required for append action' }) }] };
        }

        await store.appendMemory(params.content);
        const newContent = await store.loadMemory();

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              memory_type: 'memory',
              message: 'Content appended to MEMORY.md',
              newSize: newContent?.length || 0
            })
          }]
        };
      }

      case 'clear': {
        if (memoryType === 'user') {
          await store.clearUser();
        } else {
          await store.clearMemory();
        }

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              memory_type: memoryType,
              message: `${memoryType === 'user' ? 'USER' : 'MEMORY'}.md cleared`
            })
          }]
        };
      }

      case 'stats': {
        const stats = await store.getStats();

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              stats: {
                memory: {
                  exists: stats.memoryExists,
                  size: stats.memorySize,
                  maxSize: 2200,
                  usagePercent: Math.round((stats.memorySize / 2200) * 100)
                },
                user: {
                  exists: stats.userExists,
                  size: stats.userSize,
                  maxSize: 1375,
                  usagePercent: Math.round((stats.userSize / 1375) * 100)
                }
              }
            })
          }]
        };
      }

      default:
        return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: `Unknown action: ${action}` }) }] };
    }
  }
};