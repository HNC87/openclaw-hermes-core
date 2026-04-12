/**
 * Auxiliary Router Provider - Model Routing for Cost Optimization
 *
 * Routes simple/cheap tasks to a cheap model and complex tasks to a
 * premium model based on:
 * - Task complexity (tool call count)
 * - Token budget
 * - Explicit routing hints
 *
 * This is a Phase 3 feature for cost optimization.
 */

export const auxiliaryRouterProvider = {
  id: 'hermes-auxiliary',
  name: 'Hermes Auxiliary Router',
  description: 'Routes tasks to appropriate models based on complexity',

  /**
   * Determine which model to use for a given task
   */
  async resolveModel(params) {
    const { cheap_model, expensive_model } = {
      cheap_model: 'minimax/MiniMax-M2.7',
      expensive_model: 'deepseek/deepseek-reasoner'
    };

    // Check for explicit routing hints
    if (params.explicitHint === 'cheap' || params.explicitHint === 'simple') {
      return {
        model: cheap_model,
        reasoning: 'Explicit hint requested cheap model'
      };
    }

    if (params.explicitHint === 'expensive' || params.explicitHint === 'complex') {
      return {
        model: expensive_model,
        reasoning: 'Explicit hint requested complex model'
      };
    }

    // Route based on task complexity
    switch (params.taskComplexity) {
      case 'low':
        return {
          model: cheap_model,
          reasoning: 'Low complexity task routed to cheap model'
        };

      case 'high':
        return {
          model: expensive_model,
          reasoning: 'High complexity task routed to premium model'
        };

      case 'medium':
      default:
        // For medium complexity, use token budget as tiebreaker
        if (params.tokenBudget && params.tokenBudget > 4000) {
          return {
            model: expensive_model,
            reasoning: 'Medium complexity with high token budget'
          };
        }
        return {
          model: cheap_model,
          reasoning: 'Medium complexity with low token budget'
        };
    }
  }
};
