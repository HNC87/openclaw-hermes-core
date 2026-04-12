/**
 * Planner - Goal Decomposition and Task Planning
 *
 * Automatically decomposes complex goals into actionable steps.
 * Tracks progress and adapts plans based on execution feedback.
 *
 * Example:
 *   Goal: "帮我建立一套黄金日内交易系统"
 *   Output:
 *     1. 设计止损策略 (pending)
 *     2. 确定入场信号 (pending)
 *     3. 仓位管理规则 (pending)
 *     4. 退出时机 (pending)
 *     5. 风险管理 (pending)
 */

import * as fs from 'fs';
import * as path from 'path';

export class Planner {
  constructor(basePath) {
    this.basePath = basePath;
    this.plansPath = path.join(basePath, 'plans');
    this.activePlans = new Map();
    this._init();
  }

  _init() {
    try {
      fs.mkdirSync(this.plansPath, { recursive: true });
    } catch (e) {
      console.error('[Planner] Failed to init:', e.message);
    }
  }

  /**
   * Common trading goal decompositions
   */
  static TRADING_DECOMPOSITIONS = {
    '建立交易系统': [
      '设计止损策略',
      '确定入场信号',
      '制定仓位管理规则',
      '明确退出时机',
      '建立风险管理机制',
      '回测验证策略',
      '实盘模拟测试'
    ],
    '分析黄金走势': [
      '获取历史价格数据',
      '识别支撑阻力位',
      '分析技术指标',
      '判断趋势方向',
      '给出交易建议'
    ],
    '设计止损策略': [
      '确定风险承受能力',
      '选择止损方法（固定/ATR/百分比）',
      '计算止损点数',
      '设置预警线',
      '制定触发后操作'
    ],
    '风险管理': [
      '评估账户风险敞口',
      '确定单笔交易风险',
      '计算仓位大小',
      '设置总仓上限',
      '建立亏损处理流程'
    ]
  };

  /**
   * Decompose a goal into steps
   */
  decompose(goal, domain = 'general') {
    // Check for predefined decomposition
    const normalizedGoal = this._normalizeGoal(goal);
    for (const [key, steps] of Object.entries(Planner.TRADING_DECOMPOSITIONS)) {
      if (normalizedGoal.includes(key)) {
        return this._createPlan(goal, steps, domain);
      }
    }

    // Generic decomposition for unknown goals
    const steps = this._genericDecompose(goal);
    return this._createPlan(goal, steps, domain);
  }

  /**
   * Normalize goal text
   */
  _normalizeGoal(goal) {
    return goal.toLowerCase()
      .replace(/[^\u4e00-\u9fa5a-z0-9]/g, '')
      .trim();
  }

  /**
   * Generic decomposition for unknown goals
   */
  _genericDecompose(goal) {
    // Simple keyword-based decomposition
    const goalLower = goal.toLowerCase();

    if (goalLower.includes('交易') || goalLower.includes('策略')) {
      return [
        '收集相关信息',
        '分析现有条件',
        '制定初步方案',
        '评估风险因素',
        '优化完善方案',
        '确定执行步骤'
      ];
    }

    if (goalLower.includes('分析')) {
      return [
        '获取相关数据',
        '整理信息材料',
        '进行深度分析',
        '得出分析结论',
        '提出建议方案'
      ];
    }

    return [
      '理解目标需求',
      '收集相关信息',
      '制定执行计划',
      '逐步推进实施',
      '检查完成情况'
    ];
  }

  /**
   * Create a plan object
   */
  _createPlan(goal, steps, domain) {
    const planId = `plan-${Date.now()}`;
    const plan = {
      id: planId,
      goal,
      domain,
      steps: steps.map((step, index) => ({
        id: `${planId}-step-${index + 1}`,
        title: step,
        status: 'pending',
        createdAt: new Date().toISOString(),
        completedAt: null,
        notes: []
      })),
      status: 'active',
      progress: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    this.activePlans.set(planId, plan);
    this._savePlan(plan);

    return plan;
  }

  /**
   * Update step status
   */
  updateStep(planId, stepId, status, note = '') {
    const plan = this.activePlans.get(planId) || this._loadPlan(planId);
    if (!plan) return null;

    const step = plan.steps.find(s => s.id === stepId);
    if (!step) return null;

    step.status = status;
    if (status === 'completed') {
      step.completedAt = new Date().toISOString();
    }
    if (note) {
      step.notes.push({ text: note, timestamp: new Date().toISOString() });
    }

    // Update progress
    const completedSteps = plan.steps.filter(s => s.status === 'completed').length;
    plan.progress = Math.round((completedSteps / plan.steps.length) * 100);
    plan.updatedAt = new Date().toISOString();

    // Check if plan is complete
    if (plan.progress === 100) {
      plan.status = 'completed';
      plan.completedAt = new Date().toISOString();
    }

    this._savePlan(plan);
    return plan;
  }

  /**
   * Get plan by ID
   */
  getPlan(planId) {
    return this.activePlans.get(planId) || this._loadPlan(planId);
  }

  /**
   * List all plans
   */
  listPlans(status = null) {
    const plans = [];
    const files = fs.readdirSync(this.plansPath).filter(f => f.endsWith('.json'));

    for (const file of files) {
      const plan = JSON.parse(
        fs.readFileSync(path.join(this.plansPath, file), 'utf-8')
      );
      if (!status || plan.status === status) {
        plans.push(plan);
      }
    }

    return plans.sort((a, b) =>
      new Date(b.updatedAt) - new Date(a.updatedAt)
    );
  }

  /**
   * Format plan as readable text
   */
  formatPlan(plan) {
    let text = `📋 计划: ${plan.goal}\n`;
    text += `📊 进度: ${plan.progress}% (${plan.steps.filter(s => s.status === 'completed').length}/${plan.steps.length})\n\n`;

    plan.steps.forEach((step, index) => {
      const statusIcon = step.status === 'completed' ? '✅' :
                         step.status === 'in_progress' ? '🔄' : '⬜';
      text += `${statusIcon} ${index + 1}. ${step.title}`;
      if (step.notes.length > 0) {
        text += ` (${step.notes.length} 条备注)`;
      }
      text += '\n';
    });

    return text;
  }

  /**
   * Save plan to disk
   */
  _savePlan(plan) {
    const filePath = path.join(this.plansPath, `${plan.id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(plan, null, 2));
  }

  /**
   * Load plan from disk
   */
  _loadPlan(planId) {
    try {
      const filePath = path.join(this.plansPath, `${planId}.json`);
      if (fs.existsSync(filePath)) {
        const plan = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        this.activePlans.set(planId, plan);
        return plan;
      }
    } catch (e) {
      console.error('[Planner] Failed to load plan:', e.message);
    }
    return null;
  }

  /**
   * Delete a plan
   */
  deletePlan(planId) {
    const filePath = path.join(this.plansPath, `${planId}.json`);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    this.activePlans.delete(planId);
  }

  /**
   * Get planner stats
   */
  getStats() {
    const plans = this.listPlans();
    const active = plans.filter(p => p.status === 'active');
    const completed = plans.filter(p => p.status === 'completed');

    return {
      totalPlans: plans.length,
      activePlans: active.length,
      completedPlans: completed.length,
      avgProgress: active.length > 0
        ? Math.round(active.reduce((sum, p) => sum + p.progress, 0) / active.length)
        : 0
    };
  }
}

export default Planner;