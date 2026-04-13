# Trading Memory Schema

> Hermes Core 交易专用记忆的标准化 schema。
> 所有交易类记忆必须遵循此格式。
> 机器可读格式: `trading-memory-log.ndjson`
> 人类可读格式: `MEMORY.md` 中的 `<!-- HERMES TRADING FACTS -->` 块

---

## Entry Schema

每条记忆条目格式（JSON）：

```json
{
  "id": "uuid-v4",
  "pattern": "LONDON_NY_OVERLAP + TRENDING + EMA_BULL",
  "category": "PROFITABLE | FAILURE | NEUTRAL | UNKNOWN",
  "tier": "OBSERVATION | CORRELATION | PATTERN | VALIDATED_STRATEGY",

  "context": {
    "session": ["LONDON_NY_OVERLAP"],
    "regime": ["TRENDING", "BREAKOUT"],
    "structure": ["EMA_BULL", "MACD_CROSS_UP"],
    "indicators": {
      "rsi_range": "30-70",
      "adx_min": 25,
      "ema排列": "多头排列"
    },
    "strategy": ["EMA_CROSS"],
    "interpreter": ["execution_advice"]
  },

  "outcome": {
    "win_rate": 0.842,
    "avg_pnl": 7.05,
    "sample_size": 19,
    "lookback_days": 14,
    "total_pnl": 134.02,
    "std_dev": 12.3,
    "max_drawdown": -18.5,
    "tp_hit_rate": 0.68,
    "sl_hit_rate": 0.32
  },

  "confidence": {
    "base": 0.70,
    "current": 0.65,
    "decay_rate_per_day": 0.005,
    "min_sample_for_decay": 10,
    "market_applicability": "SHORT_TERM | MEDIUM_TERM | LONG_TERM",
    "regime_sensitive": true,
    "volatility_sensitive": false
  },

  "metadata": {
    "created_at": "2026-04-13T14:00:00Z",
    "last_verified_at": "2026-04-13T14:00:00Z",
    "expires_at": "2026-05-13T14:00:00Z",
    "auto_decay_after_days": 30,
    "tags": ["session_edge", "high_confidence", "validated"],
    "source_file": "trading_ledger.ndjson",
    "source_trigger": "auto_analysis"
  },

  "access_level": "READ_ONLY | ADVISORY | EXECUTION",
  "last_used_at": null,
  "used_in": [],
  "notes": "LONDON_NY_OVERLAP 时段内 EMA 多头排列胜率最高"
}
```

---

## Tier 定义（决定衰减速度）

| Tier | 说明 | 触发条件 | 衰减率 |
|------|------|---------|--------|
| `OBSERVATION` | 初步观察（相关性未验证） | sample_size >= 3 | 1%/天 |
| `CORRELATION` | 相关性发现（需人工确认） | sample_size >= 10，胜率 != 50% | 0.5%/天 |
| `PATTERN` | 稳定规律（多周期验证） | sample_size >= 20，3+ 个不同日期 | 0.2%/天 |
| `VALIDATED_STRATEGY` | 已验证策略（超稀有） | sample_size >= 50，胜率稳定，正期望 | 0.05%/天 |

---

## Category 定义

| Category | 说明 |
|----------|------|
| `PROFITABLE` | 具备正期望，可用于建议 |
| `FAILURE` | 负期望或高亏损率，记录用于避坑 |
| `NEUTRAL` | 样本不足或无显著差异，仅供参考 |
| `UNKNOWN` | 初建，尚未有足够样本判断 |

---

## Access Level（执行权限）

| Level | 说明 | 允许操作 |
|-------|------|---------|
| `READ_ONLY` | 仅供 Hermes 读取做参考 | 参与 prompt 拼装，不生成建议 |
| `ADVISORY` | 生成建议但必须人工审批 | 写入 `proposals/` 目录 |
| `EXECUTION` | 可直接执行（当前系统禁止） | 仅治理审批后生效，**系统默认禁止** |

> ⚠️ **默认值**：`READ_ONLY`。除非经过人工明确授权，否则不得升级。

---

## Confidence 衰减规则

```
current_confidence = base × e^(-decay_rate_per_day × days_elapsed)

触发再验证（重新提升 confidence）条件：
  - 同一 pattern 新增 >= 5 笔交易
  - 新样本胜率与 base 偏差 < 10%
  - 在不同市场环境下被验证
```

---

## 存储文件

| 文件 | 用途 | 读写权限 |
|------|------|---------|
| `~/.openclaw/hermes/memories/trading-memory-log.ndjson` | 机器可读记忆日志 | Hermes 插件读写 |
| `~/.openclaw/hermes/memories/MEMORY.md` | 人类可读摘要 | Hermes 插件追加写 |
| `~/.openclaw/hermes/proposals/` | 待审批建议 | Hermes 写，人工读 |
| `~/.openclaw/hermes/memories/.bounds.json` | 权限边界定义 | 仅人工维护 |

---

## 变更记录

| 日期 | 变更 |
|------|------|
| 2026-04-13 | 初始 schema：含 context/outcome/confidence/tier/access_level |
