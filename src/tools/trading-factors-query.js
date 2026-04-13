/**
 * Trading Factors Query Tool v2 - 交易认知引擎核心工具
 *
 * 支持：
 * - 交易专用 schema（带样本数/置信度/衰减）
 * - 预置检索模板（5种固定查询场景）
 * - 只读/建议/执行三层权限
 * - 原生 trading data ingestion
 */

import { Type } from '@sinclair/typebox';
import fs from 'fs';
import path from 'path';

const HOME = process.env.HOME || '/Users/hnc';
const MEMORIES_DIR = `${HOME}/.openclaw/hermes/memories`;
const TRADING_LOG = `${MEMORIES_DIR}/trading-memory-log.ndjson`;
const LOBSTERQUANT_ROOT = `${HOME}/LobsterQuant`;

const TradingFactorsParams = Type.Object({
  action: Type.String(),
  // 过滤器
  session: Type.Optional(Type.String()),
  regime: Type.Optional(Type.String()),
  side: Type.Optional(Type.String()),
  tier: Type.Optional(Type.String()),
  category: Type.Optional(Type.String()),
  since_days: Type.Optional(Type.Number()),
  // 检索
  template: Type.Optional(Type.String()),
  pattern: Type.Optional(Type.String()),
  limit: Type.Optional(Type.Number()),
});

export const tradingFactorsQueryTool = {
  name: 'trading_factors_query',
  description: `Query learned trading profit factors from the LobsterQuant trading system.
    Supports trading-specific memory schema with sample size, confidence decay, and tiering.
    Use template='...' for pre-built trading retrieval scenarios.

    Available retrieval templates:
    - best_session_regime: 当前 session 下最有效的组合（用于开仓参考）
    - failure_patterns: 当前环境下的亏损模式（用于避坑）
    - regime_direction: 当前 regime 下的 LONG/SHORT/NEUTRAL 置信度
    - what_to_avoid: 当前 session+regime 下应回避的组合
    - memory_explainability: 某条建议基于哪些记忆得出
    - expiring_soon: 即将过期需要重新验证的记忆

    Access levels: READ_ONLY (default) / ADVISORY / EXECUTION`,

  parameters: TradingFactorsParams,

  // ─────────────────────────────────────────
  // helpers
  // ─────────────────────────────────────────

  _getLobsterQuantPath() {
    return fs.existsSync(LOBSTERQUANT_ROOT) ? LOBSTERQUANT_ROOT : null;
  },

  _readAllMemories() {
    try {
      if (!fs.existsSync(TRADING_LOG)) return [];
      const lines = fs.readFileSync(TRADING_LOG, 'utf-8').trim().split('\n');
      return lines.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    } catch (_) { return []; }
  },

  _computeCurrentConfidence(entry) {
    if (!entry.confidence) return entry.confidence?.base || 0.5;
    const { base, decay_rate_per_day = 0.005, min_sample_for_decay = 10 } = entry.confidence;
    const sample_size = entry.outcome?.sample_size || 0;
    if (sample_size < min_sample_for_decay) return base;
    const created = new Date(entry.metadata?.created_at || Date.now());
    const daysElapsed = (Date.now() - created) / 86400000;
    return Math.max(base * Math.exp(-decay_rate_per_day * daysElapsed), 0.05);
  },

  _shouldExpire(entry) {
    if (!entry.metadata?.expires_at) return false;
    return new Date(entry.metadata.expires_at) < new Date();
  },

  _getTierDecayRate(tier) {
    return { OBSERVATION: 0.010, CORRELATION: 0.005, PATTERN: 0.002, VALIDATED_STRATEGY: 0.0005 }[tier] || 0.005;
  },

  _getAutoExpireDays(tier) {
    return { OBSERVATION: 14, CORRELATION: 30, PATTERN: 90, VALIDATED_STRATEGY: 365 }[tier] || 30;
  },

  _loadTradeLedger(limit = 300) {
    const ledgerPath = path.join(LOBSTERQUANT_ROOT, 'logs/trading_ledger.ndjson');
    if (!fs.existsSync(ledgerPath)) return [];
    try {
      const lines = fs.readFileSync(ledgerPath, 'utf-8').trim().split('\n').slice(-limit);
      return lines.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    } catch (_) { return []; }
  },

  _loadSessionFactors() {
    const sfPath = path.join(LOBSTERQUANT_ROOT, 'data/bridge/state/session_factors.json');
    if (!fs.existsSync(sfPath)) return {};
    try { return JSON.parse(fs.readFileSync(sfPath, 'utf-8')); } catch (_) { return {}; }
  },

  _ensureDir(p) {
    if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
  },

  // ─────────────────────────────────────────
  // ingestion: 从 ledger 生成结构化记忆
  // ─────────────────────────────────────────

  _createMemoryFromTrades(trades) {
    const groups = {};
    for (const t of trades) {
      const key = `${t.session || '?'}__${t.regime || '?'}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(t);
    }

    const memories = [];
    for (const [key, group] of Object.entries(groups)) {
      if (group.length < 3) continue;
      const [session, regime] = key.split('__');
      const pnls = group.map(t => t.pnl || 0);
      const wins = pnls.filter(p => p > 0).length;
      const winRate = wins / group.length;
      const avgPnl = pnls.reduce((a, b) => a + b, 0) / group.length;
      const totalPnl = pnls.reduce((a, b) => a + b, 0);

      const tier = group.length >= 50 ? 'VALIDATED_STRATEGY'
        : group.length >= 20 ? 'PATTERN'
        : group.length >= 10 ? 'CORRELATION'
        : 'OBSERVATION';
      const category = winRate > 0.55 ? 'PROFITABLE' : winRate < 0.45 ? 'FAILURE' : 'NEUTRAL';
      const baseConf = winRate > 0.65 ? 0.75 : winRate > 0.55 ? 0.65 : winRate < 0.40 ? 0.70 : 0.50;
      const now = new Date().toISOString();
      const expireDays = this._getAutoExpireDays(tier);

      const memory = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        pattern: `${session} + ${regime}`,
        category,
        tier,
        context: {
          session: [session],
          regime: [regime],
          structure: [],
          indicators: {},
          strategy: [...new Set(group.map(t => t.strategy || 'UNKNOWN'))],
          interpreter: []
        },
        outcome: {
          win_rate: Math.round(winRate * 1000) / 1000,
          avg_pnl: Math.round(avgPnl * 100) / 100,
          sample_size: group.length,
          lookback_days: 14,
          total_pnl: Math.round(totalPnl * 100) / 100,
          tp_hit_rate: Math.round((group.filter(t => t.tp_hit).length / group.length) * 1000) / 1000,
          sl_hit_rate: Math.round((group.filter(t => t.sl_hit).length / group.length) * 1000) / 1000
        },
        confidence: {
          base: baseConf,
          current: baseConf,
          decay_rate_per_day: this._getTierDecayRate(tier),
          min_sample_for_decay: 10,
          market_applicability: 'MEDIUM_TERM',
          regime_sensitive: true,
          volatility_sensitive: false
        },
        metadata: {
          created_at: now,
          last_verified_at: now,
          expires_at: new Date(Date.now() + expireDays * 86400000).toISOString(),
          auto_decay_after_days: expireDays,
          tags: [],
          source_file: 'trading_ledger.ndjson',
          source_trigger: 'auto_analysis'
        },
        access_level: 'READ_ONLY',
        last_used_at: null,
        used_in: []
      };
      memories.push(memory);
    }
    return memories;
  },

  // ─────────────────────────────────────────
  // 预置检索模板
  // ─────────────────────────────────────────

  _retrieveByTemplate(template, params = {}) {
    const memories = this._readAllMemories()
      .map(m => ({ ...m, _conf: this._computeCurrentConfidence(m) }))
      .filter(m => !this._shouldExpire(m));

    const limit = params.limit || 5;

    switch (template) {
      case 'best_session_regime': {
        const sess = params.session || '';
        return memories
          .filter(m => m.context.session.includes(sess) && m.category === 'PROFITABLE')
          .sort((a, b) => b._conf - a._conf)
          .slice(0, limit)
          .map(m => ({
            pattern: m.pattern, win_rate: m.outcome.win_rate,
            avg_pnl: m.outcome.avg_pnl, sample_size: m.outcome.sample_size,
            confidence: Math.round(m._conf * 100) / 100, tier: m.tier,
            expires_at: m.metadata.expires_at
          }));
      }

      case 'failure_patterns': {
        return memories
          .filter(m => m.category === 'FAILURE')
          .sort((a, b) => a.outcome.win_rate - b.outcome.win_rate)
          .slice(0, limit)
          .map(m => ({
            pattern: m.pattern, win_rate: m.outcome.win_rate,
            avg_pnl: m.outcome.avg_pnl, sample_size: m.outcome.sample_size,
            total_pnl: m.outcome.total_pnl,
            confidence: Math.round(m._conf * 100) / 100, tier: m.tier,
            why_fails: `胜率${(m.outcome.win_rate*100).toFixed(1)}%，均笔${m.outcome.avg_pnl.toFixed(1)}点`
          }));
      }

      case 'regime_direction': {
        const reg = params.regime || '';
        const longs = memories.filter(m => m.context.regime.includes(reg) && m.outcome.win_rate > 0.5);
        const shorts = memories.filter(m => m.context.regime.includes(reg) && m.outcome.win_rate < 0.5);
        const avgLongConf = longs.length ? longs.reduce((s, m) => s + m._conf, 0) / longs.length : 0;
        const avgShortConf = shorts.length ? shorts.reduce((s, m) => s + m._conf, 0) / shorts.length : 0;
        return {
          regime: reg,
          long_confidence: Math.round(avgLongConf * 100) / 100,
          short_confidence: Math.round(avgShortConf * 100) / 100,
          evidence_count: { long: longs.length, short: shorts.length },
          recommendation: avgLongConf > avgShortConf + 0.1 ? 'LONG_BIAS'
            : avgShortConf > avgLongConf + 0.1 ? 'SHORT_BIAS' : 'NEUTRAL',
          memories_used: longs.length + shorts.length
        };
      }

      case 'what_to_avoid': {
        const sess = params.session || '';
        const reg = params.regime || '';
        return memories
          .filter(m => {
            const sMatch = !sess || m.context.session.includes(sess);
            const rMatch = !reg || m.context.regime.includes(reg);
            return sMatch && rMatch && (m.category === 'FAILURE' || m.outcome.win_rate < 0.45);
          })
          .sort((a, b) => a.outcome.win_rate - b.outcome.win_rate)
          .slice(0, limit)
          .map(m => ({
            pattern: m.pattern, win_rate: m.outcome.win_rate,
            avg_pnl: m.outcome.avg_pnl, sample_size: m.outcome.sample_size,
            confidence: Math.round(m._conf * 100) / 100,
            recommendation: 'AVOID'
          }));
      }

      case 'memory_explainability': {
        const pat = params.pattern || '';
        const relevant = memories
          .filter(m => m.pattern.toLowerCase().includes(pat.toLowerCase()))
          .sort((a, b) => b._conf - a._conf)
          .slice(0, 3);
        return {
          query: pat,
          memories_used: relevant.length,
          evidence: relevant.map(m => ({
            pattern: m.pattern,
            win_rate: m.outcome.win_rate,
            sample_size: m.outcome.sample_size,
            confidence: Math.round(m._conf * 100) / 100,
            tier: m.tier,
            expires_at: m.metadata.expires_at,
            reasoning: `${m.pattern}样本量${m.outcome.sample_size}笔，胜率${(m.outcome.win_rate*100).toFixed(1)}%，${m.tier}级别`
          }))
        };
      }

      case 'expiring_soon': {
        const soon = new Date(Date.now() + 7 * 86400000);
        return memories
          .filter(m => m.metadata.expires_at && new Date(m.metadata.expires_at) < soon)
          .sort((a, b) => new Date(a.metadata.expires_at) - new Date(b.metadata.expires_at))
          .slice(0, limit)
          .map(m => ({
            pattern: m.pattern, tier: m.tier,
            expires_at: m.metadata.expires_at,
            current_confidence: Math.round(m._conf * 100) / 100,
            sample_size: m.outcome.sample_size, needs_review: true
          }));
      }

      default:
        return { error: `Unknown template: ${template}` };
    }
  },

  // ─────────────────────────────────────────
  // main execute
  // ─────────────────────────────────────────

  async execute(_id, params) {
    const lqPath = this._getLobsterQuantPath();
    const action = params.action;

    try {
      switch (action) {
        // ── 模板检索 ──────────────────────
        case 'retrieve': {
          if (!params.template) {
            return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'template is required' }) }] };
          }
          const result = this._retrieveByTemplate(params.template, {
            session: params.session,
            regime: params.regime,
            pattern: params.pattern,
            limit: params.limit || 5
          });
          return { content: [{ type: 'text', text: JSON.stringify({ success: true, action, ...result }) }] };
        }

        // ── 全量 ingestion ──────────────
        case 'ingest': {
          if (!lqPath) return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'LobsterQuant not found' }) }] };
          const trades = this._loadTradeLedger();
          if (trades.length < 5) return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: "Only " + trades.length + " trades, need >= 5" }) }] };
          const memories = this._createMemoryFromTrades(trades);
          if (!fs.existsSync(TRADING_LOG)) {
            this._ensureDir(MEMORIES_DIR);
            fs.writeFileSync(TRADING_LOG, '', 'utf-8');
          }
          // 只追加新的（去重）
          const existing = new Set(this._readAllMemories().map(m => m.pattern));
          const newOnes = memories.filter(m => !existing.has(m.pattern));
          for (const m of newOnes) fs.appendFileSync(TRADING_LOG, JSON.stringify(m) + '\n', 'utf-8');
          return { content: [{ type: 'text', text: JSON.stringify({ success: true, action, ingested: newOnes.length, total_memories: newOnes.length + existing.size, new_patterns: newOnes.map(m => m.pattern) }) }] };
        }

        // ── 记忆统计 ────────────────────
        case 'stats': {
          const memories = this._readAllMemories();
          const valid = memories.filter(m => !this._shouldExpire(m));
          const withConf = valid.map(m => ({ ...m, _conf: this._computeCurrentConfidence(m) }));
          const byTier = { OBSERVATION: 0, CORRELATION: 0, PATTERN: 0, VALIDATED_STRATEGY: 0 };
          const byCategory = { PROFITABLE: 0, FAILURE: 0, NEUTRAL: 0, UNKNOWN: 0 };
          for (const m of withConf) { byTier[m.tier] = (byTier[m.tier] || 0) + 1; byCategory[m.category] = (byCategory[m.category] || 0) + 1; }
          const avgConf = withConf.length ? withConf.reduce((s, m) => s + m._conf, 0) / withConf.length : 0;
          return { content: [{ type: 'text', text: JSON.stringify({ success: true, action, total_entries: memories.length, active_entries: valid.length, avg_confidence: Math.round(avgConf * 100) / 100, by_tier: byTier, by_category: byCategory }) }] };
        }

        // ── 时段因子（原始数据）─────────
        case 'session_factors': {
          if (!lqPath) return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'LobsterQuant not found' }) }] };
          const sf = this._loadSessionFactors();
          if (!sf || !Object.keys(sf).length) return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'No session factors found' }) }] };
          const sessions = Object.entries(sf).map(([name, d]) => ({ name, ...d }));
          const total_trades = sessions.reduce((s, x) => s + (x.count || 0), 0);
          const total_pnl = sessions.reduce((s, x) => s + (x.pnl || 0), 0);
          return { content: [{ type: 'text', text: JSON.stringify({ success: true, action, total_trades, total_pnl: Math.round(total_pnl * 100) / 100, sessions }) }] };
        }

        // ── 查询原始交易 ─────────────────
        case 'query_trades': {
          if (!lqPath) return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'LobsterQuant not found' }) }] };
          let trades = this._loadTradeLedger(200);
          if (params.session) trades = trades.filter(t => t.session === params.session);
          if (params.regime) trades = trades.filter(t => t.regime === params.regime);
          if (params.side) trades = trades.filter(t => t.side === params.side);
          trades.sort((a, b) => (b.ts || '').localeCompare(a.ts || ''));
          const limit = params.limit || 20;
          const slice = trades.slice(0, limit);
          const wins = slice.filter(t => t.pnl > 0).length;
          const pnl = slice.reduce((s, t) => s + (t.pnl || 0), 0);
          return { content: [{ type: 'text', text: JSON.stringify({ success: true, action, filters: { session: params.session || 'all', regime: params.regime || 'all', limit }, matched: trades.length, stats: { total: slice.length, wins, losses: slice.length - wins, pnl: Math.round(pnl * 100) / 100 }, sample: slice.map(t => ({ ticket: t.ticket, side: t.side, pnl: t.pnl, session: t.session, regime: t.regime, ts: t.ts })) }) }] };
        }

        // ── 指标分析 ─────────────────────
        case 'indicator_analysis': {
          if (!lqPath) return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'LobsterQuant not found' }) }] };
          const trades = this._loadTradeLedger(200).filter(t => t.rsi14 !== undefined);
          if (trades.length === 0) return { content: [{ type: 'text', text: JSON.stringify({ success: true, action, message: 'No trades with indicators yet', total: this._loadTradeLedger().length }) }] };
          const buckets = { 'RSI<30': { wins: 0, losses: 0, pnl: 0 }, 'RSI30-50': { wins: 0, losses: 0, pnl: 0 }, 'RSI50-70': { wins: 0, losses: 0, pnl: 0 }, 'RSI>70': { wins: 0, losses: 0, pnl: 0 } };
          for (const t of trades) {
            const rsi = t.rsi14;
            const b = rsi < 30 ? 'RSI<30' : rsi < 50 ? 'RSI30-50' : rsi < 70 ? 'RSI50-70' : 'RSI>70';
            buckets[b].pnl += t.pnl || 0;
            if (t.pnl > 0) buckets[b].wins++; else buckets[b].losses++;
          }
          return { content: [{ type: 'text', text: JSON.stringify({ success: true, action, trades_with_indicators: trades.length, total_trades: this._loadTradeLedger().length, rsi_buckets: buckets }) }] };
        }

        // ── 综合摘要 ─────────────────────
        case 'summary': {
          const memories = this._readAllMemories().filter(m => !this._shouldExpire(m));
          const lq = this._getLobsterQuantPath();
          let ledgerTrades = [];
          if (lq) ledgerTrades = this._loadTradeLedger(100);
          const wins = ledgerTrades.filter(t => t.pnl > 0).length;
          const total_pnl = ledgerTrades.reduce((s, t) => s + (t.pnl || 0), 0);
          const sf = lq ? this._loadSessionFactors() : {};
          return { content: [{ type: 'text', text: JSON.stringify({ success: true, action, timestamp: new Date().toISOString(), trading_memories: memories.length, session_factors: sf, recent_trades: { total: ledgerTrades.length, wins, winrate: ledgerTrades.length ? Math.round(wins / ledgerTrades.length * 1000) / 10 : 0, total_pnl: Math.round(total_pnl * 100) / 100 }, schema_version: '1.0.0' }) }] };
        }

        default:
          return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: "Unknown action: " + action, valid_actions: ["retrieve", "ingest", "stats", "session_factors", "query_trades", "indicator_analysis", "summary"] }) }] };
      }
    } catch (err) {
      return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: err.message }) }] };
    }
  }
};