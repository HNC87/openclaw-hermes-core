# LobsterQuant Trading System - 环境配置

## 项目路径
- 项目根目录: `~/LobsterQuant`
- 交易桥接目录: `~/LobsterQuant/bridge`
- 配置文件目录: `~/LobsterQuant/config`

## 交易数据路径

### 核心数据文件
| 文件名 | 路径 | 说明 |
|--------|------|------|
| trading_ledger.ndjson | `~/LobsterQuant/logs/trading_ledger.ndjson` | 成交记录（NDJSON格式） |
| signal_ledger.ndjson | `~/LobsterQuant/logs/signal_ledger.ndjson` | 信号记录 |
| risk_events.ndjson | `~/LobsterQuant/logs/risk_events.ndjson` | 风险事件记录 |
| position_snapshots/ | `~/LobsterQuant/logs/position_snapshots/` | 持仓快照目录 |

### 配置文件
| 文件名 | 路径 | 说明 |
|--------|------|------|
| strategy_rules_v3.json | `~/LobsterQuant/config/strategy_rules_v3.json` | 交易策略规则 |
| agent_state.db | `~/LobsterQuant/data/bridge/state/agent_state.db` | Agent状态数据库 |

### 日志文件
| 文件名 | 路径 | 说明 |
|--------|------|------|
| gold_trader.2026*.log | `~/LobsterQuant/logs/gold_trader.202604*.log` | 交易日志 |
| blackboard_tailer.log | `~/LobsterQuant/logs/blackboard_tailer.log` | 决策账本日志 |

## 策略规则摘要

### 止损三层次
- **L1 基础止损**: 1.5 × ATR14 或 8 pips（硬止损，不可修改）
- **L2 移动止损**: 浮盈 >= 1.5 × ATR14 后激活，锁定 >= 1.0 × ATR14
- **L3 时间止损**: 持仓超2小时未触发L2，强制复查自信度

### 亏损处理SOP
1. 24小时冷却期不复交易
2. 写交易日志（亏损点数/原因/自信度/市场环境）
3. 需 ≥ 2个策略同时发出同一方向信号才恢复
4. 连续亏损2次降低50%仓位，直到连续2次盈利
5. 黑天鹅事件跳过该交易日

### 禁止行为
- 亏损后立刻反手报复交易
- 手动修改已有SL
- 亏损加仓逆势死扛
- 凭直觉交易脱离策略

## 交易对
- 主要交易品种: XAUUSD (黄金美元)

## 最后更新时间
2026-04-12
