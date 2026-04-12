/**
 * Session Search Tool - FTS5-based Conversation History Search
 *
 * Provides the ability to search past conversations using full-text search,
 * supporting queries like:
 * - "What did we discuss about the authentication system?"
 * - "Show me the trading strategy from last week"
 */

import { SQLiteStore } from '../memory/sqlite-store.js';
import { Type } from '@sinclair/typebox';

const SessionSearchParams = Type.Object({
  query: Type.String(),
  session_id: Type.Optional(Type.String()),
  limit: Type.Optional(Type.Number())
});

export const sessionSearchTool = {
  name: 'session_search',
  description: `Search through conversation history using full-text search.
    Use this when user asks about something discussed in previous sessions.
    Returns relevant messages ranked by relevance.`,

  parameters: SessionSearchParams,

  async execute(_id, params) {
    const homeDir = process.env.HOME || '/Users/hnc';
    const dbPath = `${homeDir}/.openclaw/hermes/session.db`;

    const store = new SQLiteStore(dbPath);
    await store.initialize();

    try {
      const results = await store.searchRelevant(params.query, params.session_id, {
        limit: params.limit || 5
      });

      if (results.length === 0) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: 'No relevant conversations found',
              results: []
            })
          }]
        };
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            message: `Found ${results.length} relevant messages`,
            results: results.map(r => ({
              session_id: r.session_id,
              role: r.role,
              content: r.content,
              timestamp: r.timestamp,
              relevance: r.rank !== undefined ? Math.max(0, 1 - Math.abs(r.rank)) : 0.5
            }))
          })
        }]
      };
    } finally {
      store.close();
    }
  }
};