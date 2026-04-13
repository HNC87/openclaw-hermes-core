/**
 * Trading Factors Query Tool - Query learned trading profit factors
 *
 * Provides tools for:
 * - Querying session-based win rates and PnL
 * - Analyzing indicator patterns (EMA, RSI, MACD, ADX)
 * - Getting regime-based performance
 * - Retrieving current trading session factors
 */

import { Type } from '@sinclair/typebox';
import fs from 'fs';
import path from 'path';

const TradingFactorsParams = Type.Object({
  action: Type.String(),
  // Filter options
  session: Type.Optional(Type.String()),      // Filter by session (ASIA, LONDON_NY_OVERLAP, etc.)
  regime: Type.Optional(Type.String()),       // Filter by regime (TRENDING, BREAKOUT, etc.)
  side: Type.Optional(Type.String()),         // Filter by side (BUY, SELL)
  since_days: Type.Optional(Type.Number()),   // Filter by days (default: all)
  // Limit
  limit: Type.Optional(Type.Type.Number()),   // Limit number of trades returned
});

export const tradingFactorsQueryTool = {
  name: 'trading_factors_query',
  description: `Query learned trading profit factors from the LobsterQuant trading system.
    Use to retrieve:
    - Session-based win rates and PnL (ASIA, LONDON_NY_OVERLAP, NEW_YORK, etc.)
    - Indicator-based patterns (EMA, RSI, MACD, ADX at entry)
    - Regime-based performance
    - Recent trade history with full attribution

    Data sources:
    - Session factors: data/bridge/state/session_factors.json
    - Trade ledger: logs/trading_ledger.ndjson`,

  parameters: TradingFactorsParams,

  // LobsterQuant project path
  _getLobsterQuantPath() {
    // Check if we're in the LobsterQuant context
    const possiblePaths = [
      '/Users/hnc/LobsterQuant',
      path.join(process.env.HOME || '', 'LobsterQuant'),
    ];
    for (const p of possiblePaths) {
      if (fs.existsSync(p)) return p;
    }
    return null;
  },

  async execute(_id, params) {
    const lqPath = this._getLobsterQuantPath();
    if (!lqPath) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: false,
            error: 'LobsterQuant project not found'
          })
        }]
      };
    }

    const action = params.action;
    const sessionFactorsPath = path.join(lqPath, 'data/bridge/state/session_factors.json');
    const tradeLedgerPath = path.join(lqPath, 'logs/trading_ledger.ndjson');

    switch (action) {
      case 'session_factors': {
        // Return session-based win rates and PnL
        if (!fs.existsSync(sessionFactorsPath)) {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: 'Session factors file not found'
              })
            }]
          };
        }

        const factors = JSON.parse(fs.readFileSync(sessionFactorsPath, 'utf-8'));

        // Calculate summary
        const sessions = Object.keys(factors);
        const total_trades = sessions.reduce((sum, s) => sum + (factors[s].count || 0), 0);
        const total_pnl = sessions.reduce((sum, s) => sum + (factors[s].pnl || 0), 0);
        const weighted_winrate = sessions.reduce((sum, s) => {
          const f = factors[s];
          return sum + (f.win_rate || 0) * (f.count || 0);
        }, 0) / (total_trades || 1);

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              action: 'session_factors',
              summary: {
                total_trades,
                total_pnl: Math.round(total_pnl * 100) / 100,
                weighted_avg_winrate: Math.round(weighted_winrate * 10) / 10
              },
              sessions: factors
            })
          }]
        };
      }

      case 'query_trades': {
        // Query trades from ledger with filters
        if (!fs.existsSync(tradeLedgerPath)) {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: 'Trade ledger not found'
              })
            }]
          };
        }

        const lines = fs.readFileSync(tradeLedgerPath, 'utf-8').trim().split('\n');
        let trades = lines.map(line => {
          try {
            return JSON.parse(line);
          } catch {
            return null;
          }
        }).filter(Boolean);

        // Apply filters
        if (params.session) {
          trades = trades.filter(t => t.session === params.session);
        }
        if (params.regime) {
          trades = trades.filter(t => t.regime === params.regime);
        }
        if (params.side) {
          trades = trades.filter(t => t.side === params.side);
        }

        // Sort by ts descending and apply limit
        trades.sort((a, b) => (b.ts || '').localeCompare(a.ts || ''));
        const limit = params.limit || 20;
        trades = trades.slice(0, limit);

        // Calculate stats for filtered trades
        const stats = {
          total: trades.length,
          wins: trades.filter(t => t.pnl > 0).length,
          losses: trades.filter(t => t.pnl < 0).length,
          pnl: trades.reduce((sum, t) => sum + (t.pnl || 0), 0),
          avg_pnl: trades.length > 0 ? trades.reduce((sum, t) => sum + (t.pnl || 0), 0) / trades.length : 0
        };

        // Return sample of recent trades (without full indicators to save tokens)
        const sampleTrades = trades.slice(0, 5).map(t => ({
          ticket: t.ticket,
          side: t.side,
          entry: t.entry,
          exit: t.exit,
          pnl: t.pnl,
          session: t.session,
          regime: t.regime,
          win_rate: t.pnl > 0 ? 'WIN' : 'LOSS',
          ts: t.ts
        }));

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              action: 'query_trades',
              filters: {
                session: params.session || 'all',
                regime: params.regime || 'all',
                side: params.side || 'all',
                limit
              },
              stats,
              sample_trades: sampleTrades,
              total_matched: trades.length
            })
          }]
        };
      }

      case 'indicator_analysis': {
        // Analyze indicator patterns from trades
        if (!fs.existsSync(tradeLedgerPath)) {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: 'Trade ledger not found'
              })
            }]
          };
        }

        const lines = fs.readFileSync(tradeLedgerPath, 'utf-8').trim().split('\n');
        const trades = lines.map(line => {
          try {
            return JSON.parse(line);
          } catch {
            return null;
          }
        }).filter(Boolean);

        // Filter to trades with indicators
        const withIndicators = trades.filter(t => t.ema9 !== undefined || t.rsi14 !== undefined);

        if (withIndicators.length === 0) {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                success: true,
                action: 'indicator_analysis',
                message: 'No trades with indicator data yet',
                total_trades: trades.length
              })
            }]
          };
        }

        // Analyze RSI ranges
        const rsiBuckets = {
          'oversold (<30)': { wins: 0, losses: 0, pnl: 0 },
          'neutral (30-50)': { wins: 0, losses: 0, pnl: 0 },
          'bullish (50-70)': { wins: 0, losses: 0, pnl: 0 },
          'overbought (>70)': { wins: 0, losses: 0, pnl: 0 }
        };

        withIndicators.forEach(t => {
          const rsi = t.rsi14;
          if (rsi === undefined) return;
          let bucket;
          if (rsi < 30) bucket = 'oversold (<30)';
          else if (rsi < 50) bucket = 'neutral (30-50)';
          else if (rsi < 70) bucket = 'bullish (50-70)';
          else bucket = 'overbought (>70)';
          if (bucket) {
            rsiBuckets[bucket].pnl += (t.pnl || 0);
            if (t.pnl > 0) rsiBuckets[bucket].wins++;
            else if (t.pnl < 0) rsiBuckets[bucket].losses++;
          }
        });

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              action: 'indicator_analysis',
              trades_with_indicators: withIndicators.length,
              total_trades: trades.length,
              rsi_analysis: rsiBuckets
            })
          }]
        };
      }

      case 'summary': {
        // Get a comprehensive summary
        const summary = {
          success: true,
          action: 'summary',
          timestamp: new Date().toISOString()
        };

        // Load session factors
        if (fs.existsSync(sessionFactorsPath)) {
          const factors = JSON.parse(fs.readFileSync(sessionFactorsPath, 'utf-8'));
          summary.session_factors = factors;
        }

        // Load recent trades
        if (fs.existsSync(tradeLedgerPath)) {
          const lines = fs.readFileSync(tradeLedgerPath, 'utf-8').trim().split('\n');
          const trades = lines.map(line => {
            try {
              return JSON.parse(line);
            } catch {
              return null;
            }
          }).filter(Boolean);

          const total_pnl = trades.reduce((sum, t) => sum + (t.pnl || 0), 0);
          const wins = trades.filter(t => t.pnl > 0).length;
          const summary_stats = {
            total_trades: trades.length,
            wins,
            losses: trades.length - wins,
            winrate: trades.length > 0 ? Math.round(wins / trades.length * 1000) / 10 : 0,
            total_pnl: Math.round(total_pnl * 100) / 100
          };
          summary.trading_stats = summary_stats;
        }

        return {
          content: [{
            type: 'text',
            text: JSON.stringify(summary)
          }]
        };
      }

      default:
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: `Unknown action: ${action}`,
              valid_actions: ['session_factors', 'query_trades', 'indicator_analysis', 'summary']
            })
          }]
        };
    }
  }
};