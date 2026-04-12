/**
 * Context Compressor -解决 Token 限制问题
 *
 * Automatically compresses long conversations to preserve key information
 * while reducing token usage.
 *
 * Features:
 * - Preserve critical decisions
 * - Extract patterns and rules
 * - Archive full history
 * - Maintain context summary
 */

import * as fs from 'fs';
import * as path from 'path';

export class ContextCompressor {
  constructor(basePath) {
    this.basePath = basePath;
    this.compressedPath = path.join(basePath, 'compressed');
    this.summaryPath = path.join(basePath, 'context-summary.json');
    this.conversationHistory = [];
    this.summary = {
      keyDecisions: [],
      patterns: [],
      rules: [],
      preferences: [],
      lastUpdated: null
    };
    this._load();
  }

  _load() {
    try {
      fs.mkdirSync(this.compressedPath, { recursive: true });
      if (fs.existsSync(this.summaryPath)) {
        this.summary = JSON.parse(fs.readFileSync(this.summaryPath, 'utf-8'));
      }
    } catch (e) {
      console.error('[ContextCompressor] Failed to load:', e.message);
    }
  }

  _save() {
    try {
      this.summary.lastUpdated = new Date().toISOString();
      fs.writeFileSync(this.summaryPath, JSON.stringify(this.summary, null, 2));
    } catch (e) {
      console.error('[ContextCompressor] Failed to save:', e.message);
    }
  }

  /**
   * Add a conversation turn
   */
  addTurn(role, content, metadata = {}) {
    this.conversationHistory.push({
      role,
      content,
      metadata,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Extract key decision from content
   */
  _extractDecision(content) {
    const decisionPatterns = [
      /(?:决定|确定|采用|使用|选择)(.+?)(?:作为|的|为)(.+?)(?:策略|方案|方法|规则)/i,
      /(?:止损|止盈|仓位|风险).*?(\d+%)/,
      /(?:买入|卖出|做多|做空)(.+?)(?:时机|条件|策略)/i
    ];

    for (const pattern of decisionPatterns) {
      const match = content.match(pattern);
      if (match) {
        return match[0];
      }
    }
    return null;
  }

  /**
   * Extract trading rule from content
   */
  _extractRule(content) {
    const rulePatterns = [
      /(?:规则|原则|要求)(.+?)(?:必须|应该|可以|不能)/g,
      /(?:每次|单笔|总仓).*?(?:不超|不超过|控制在).*?(\d+%)/,
      /(?:亏损?|盈利).*?(?:不超过|不少于|达到).*?(\d+%)/
    ];

    for (const pattern of rulePatterns) {
      const match = content.match(pattern);
      if (match) {
        return match[0];
      }
    }
    return null;
  }

  /**
   * Extract preference from content
   */
  _extractPreference(content) {
    const prefPatterns = [
      /(?:偏好|喜欢|倾向|愿意)(.+?)(?:的|用|做)/,
      /(?:保守|激进|稳健|谨慎)/,
      /(?:主要|通常|一般).*?(?:交易|操作|投资)/
    ];

    for (const pattern of prefPatterns) {
      const match = content.match(pattern);
      if (match) {
        return match[0];
      }
    }
    return null;
  }

  /**
   * Compress conversation and update summary
   */
  compress(threshold = 15000) {
    if (this.conversationHistory.length === 0) {
      return { compressed: true, tokensSaved: 0 };
    }

    let totalTokens = this.conversationHistory.reduce(
      (sum, turn) => sum + Math.ceil(turn.content.length / 4), 0
    );

    if (totalTokens < threshold) {
      return { compressed: false, reason: 'below_threshold', tokens: totalTokens };
    }

    // Extract key information from conversation
    const newDecisions = [];
    const newRules = [];
    const newPreferences = [];

    for (const turn of this.conversationHistory) {
      if (turn.role === 'user') {
        const decision = this._extractDecision(turn.content);
        if (decision && !this.summary.keyDecisions.includes(decision)) {
          newDecisions.push(decision);
        }

        const rule = this._extractRule(turn.content);
        if (rule && !this.summary.rules.includes(rule)) {
          newRules.push(rule);
        }

        const pref = this._extractPreference(turn.content);
        if (pref && !this.summary.preferences.includes(pref)) {
          newPreferences.push(pref);
        }
      }
    }

    // Archive current conversation
    const archiveFile = path.join(
      this.compressedPath,
      `archive-${Date.now()}.json`
    );
    fs.writeFileSync(archiveFile, JSON.stringify({
      turns: this.conversationHistory,
      extractedAt: new Date().toISOString()
    }, null, 2));

    // Update summary
    this.summary.keyDecisions = [...this.summary.keyDecisions, ...newDecisions].slice(-50);
    this.summary.rules = [...this.summary.rules, ...newRules].slice(-50);
    this.summary.preferences = [...this.summary.preferences, ...newPreferences].slice(-50);
    this._save();

    // Clear history
    const tokensSaved = totalTokens;
    this.conversationHistory = [];

    return {
      compressed: true,
      tokensSaved,
      newExtractions: {
        decisions: newDecisions.length,
        rules: newRules.length,
        preferences: newPreferences.length
      }
    };
  }

  /**
   * Get current summary
   */
  getSummary() {
    return { ...this.summary };
  }

  /**
   * Get context for prompt injection
   */
  getContextForPrompt() {
    let context = '';

    if (this.summary.keyDecisions.length > 0) {
      context += '【关键决策】\n';
      this.summary.keyDecisions.slice(-10).forEach(d => {
        context += `- ${d}\n`;
      });
    }

    if (this.summary.rules.length > 0) {
      context += '\n【交易规则】\n';
      this.summary.rules.slice(-10).forEach(r => {
        context += `- ${r}\n`;
      });
    }

    if (this.summary.preferences.length > 0) {
      context += '\n【用户偏好】\n';
      this.summary.preferences.slice(-10).forEach(p => {
        context += `- ${p}\n`;
      });
    }

    return context;
  }

  /**
   * Manual add to summary
   */
  addDecision(decision) {
    if (!this.summary.keyDecisions.includes(decision)) {
      this.summary.keyDecisions.push(decision);
      this._save();
    }
  }

  addRule(rule) {
    if (!this.summary.rules.includes(rule)) {
      this.summary.rules.push(rule);
      this._save();
    }
  }

  addPreference(preference) {
    if (!this.summary.preferences.includes(preference)) {
      this.summary.preferences.push(preference);
      this._save();
    }
  }

  /**
   * Get compression stats
   */
  getStats() {
    return {
      historyLength: this.conversationHistory.length,
      totalDecisions: this.summary.keyDecisions.length,
      totalRules: this.summary.rules.length,
      totalPreferences: this.summary.preferences.length,
      archiveCount: fs.readdirSync(this.compressedPath).length,
      lastUpdated: this.summary.lastUpdated
    };
  }
}

export default ContextCompressor;