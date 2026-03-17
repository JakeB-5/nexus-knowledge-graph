// ConditionStep executor - evaluates conditional expressions and routes execution

import {
  ConditionExpression,
  ConditionStepConfig,
  ExecutionContext,
  StepResult,
  SimpleCondition,
  LogicalCondition,
  WorkflowError,
  WorkflowErrorCode,
} from '../types.js';
import { ExpressionEvaluator } from '../expression.js';

export interface ConditionResult {
  branch: 'then' | 'else';
  value: boolean;
  nextStepIds: string[];
}

export class ConditionStepExecutor {
  private evaluator: ExpressionEvaluator;

  constructor(evaluator: ExpressionEvaluator) {
    this.evaluator = evaluator;
  }

  async execute(
    stepId: string,
    config: ConditionStepConfig,
    ctx: ExecutionContext,
    attempt: number
  ): Promise<StepResult & { conditionResult: ConditionResult }> {
    const startedAt = new Date();

    try {
      const value = this.evaluateCondition(config.condition, ctx);
      const branch = value ? 'then' : 'else';
      const nextStepIds = value
        ? (config.thenSteps ?? [])
        : (config.elseSteps ?? []);

      const conditionResult: ConditionResult = { branch, value, nextStepIds };

      const result = {
        stepId,
        status: 'success' as const,
        output: conditionResult,
        startedAt,
        completedAt: new Date(),
        attempt,
        conditionResult,
      };

      ctx.stepResults.set(stepId, result);
      return result;
    } catch (err) {
      const result = {
        stepId,
        status: 'failure' as const,
        error: err instanceof Error ? err.message : String(err),
        startedAt,
        completedAt: new Date(),
        attempt,
        conditionResult: { branch: 'else' as const, value: false, nextStepIds: config.elseSteps ?? [] },
      };
      ctx.stepResults.set(stepId, result);
      throw err;
    }
  }

  /**
   * Evaluate a ConditionExpression recursively.
   */
  evaluateCondition(condition: ConditionExpression, ctx: ExecutionContext): boolean {
    if (condition.type === 'simple') {
      return this.evaluateSimple(condition, ctx);
    }
    if (condition.type === 'logical') {
      return this.evaluateLogical(condition, ctx);
    }
    throw new WorkflowError(
      WorkflowErrorCode.ConditionError,
      `Unknown condition type: ${(condition as { type: string }).type}`
    );
  }

  private evaluateSimple(condition: SimpleCondition, ctx: ExecutionContext): boolean {
    const evalCtx = {
      variables: ctx.variables,
      stepResults: ctx.stepResults as Map<string, unknown>,
    };

    const left = this.resolveOperand(condition.left, evalCtx);
    const right = condition.right;

    return this.applyOperator(condition.operator, left, right);
  }

  private resolveOperand(
    operand: string,
    ctx: { variables: Record<string, unknown>; stepResults: Map<string, unknown> }
  ): unknown {
    const trimmed = operand.trim();
    // If it's a plain string literal (not an expression), return as-is
    if (!trimmed.startsWith('$') && !/^\w+\(/.test(trimmed) && !trimmed.includes('{{')) {
      // Try to parse as number/boolean/null
      if (trimmed === 'true') return true;
      if (trimmed === 'false') return false;
      if (trimmed === 'null') return null;
      const num = Number(trimmed);
      if (!isNaN(num) && trimmed !== '') return num;
      // Plain string
      return trimmed;
    }
    return this.evaluator.evaluate(trimmed, ctx);
  }

  private applyOperator(
    operator: SimpleCondition['operator'],
    left: unknown,
    right: unknown
  ): boolean {
    switch (operator) {
      case 'eq': {
        if (left === right) return true;
        // Loose comparison for numbers vs strings
        return String(left) === String(right);
      }
      case 'ne': {
        if (left === right) return false;
        return String(left) !== String(right);
      }
      case 'gt': return Number(left) > Number(right);
      case 'lt': return Number(left) < Number(right);
      case 'gte': return Number(left) >= Number(right);
      case 'lte': return Number(left) <= Number(right);
      case 'contains': {
        if (typeof left === 'string') {
          return left.includes(String(right));
        }
        if (Array.isArray(left)) {
          return left.some(item =>
            item === right || String(item) === String(right)
          );
        }
        return false;
      }
      case 'matches': {
        try {
          const pattern = new RegExp(String(right));
          return pattern.test(String(left));
        } catch {
          return false;
        }
      }
      default:
        throw new WorkflowError(
          WorkflowErrorCode.ConditionError,
          `Unknown comparison operator: ${operator as string}`
        );
    }
  }

  private evaluateLogical(condition: LogicalCondition, ctx: ExecutionContext): boolean {
    switch (condition.operator) {
      case 'and': {
        if (condition.conditions.length === 0) return true;
        return condition.conditions.every(c => this.evaluateCondition(c, ctx));
      }
      case 'or': {
        if (condition.conditions.length === 0) return false;
        return condition.conditions.some(c => this.evaluateCondition(c, ctx));
      }
      case 'not': {
        if (condition.conditions.length === 0) return true;
        // 'not' applies to the first condition only
        const first = condition.conditions[0];
        if (!first) return true;
        return !this.evaluateCondition(first, ctx);
      }
      default:
        throw new WorkflowError(
          WorkflowErrorCode.ConditionError,
          `Unknown logical operator: ${condition.operator as string}`
        );
    }
  }

  /**
   * Evaluate a plain boolean expression string.
   * Delegates to ExpressionEvaluator for complex expressions.
   */
  evaluateExpression(expression: string, ctx: ExecutionContext): boolean {
    const evalCtx = {
      variables: ctx.variables,
      stepResults: ctx.stepResults as Map<string, unknown>,
    };
    return this.evaluator.evaluateBool(expression, evalCtx);
  }

  /**
   * Build a ConditionExpression from a shorthand string expression.
   * Useful for programmatic construction.
   */
  static fromExpression(expression: string): ConditionExpression {
    // Parse "left operator right" patterns
    const patterns: Array<{ op: SimpleCondition['operator']; regex: RegExp }> = [
      { op: 'gte', regex: /^(.+?)\s*>=\s*(.+)$/ },
      { op: 'lte', regex: /^(.+?)\s*<=\s*(.+)$/ },
      { op: 'ne', regex: /^(.+?)\s*!=\s*(.+)$/ },
      { op: 'eq', regex: /^(.+?)\s*==\s*(.+)$/ },
      { op: 'gt', regex: /^(.+?)\s*>\s*(.+)$/ },
      { op: 'lt', regex: /^(.+?)\s*<\s*(.+)$/ },
      { op: 'contains', regex: /^(.+?)\s+contains\s+(.+)$/i },
      { op: 'matches', regex: /^(.+?)\s+matches\s+(.+)$/i },
    ];

    for (const { op, regex } of patterns) {
      const match = expression.match(regex);
      if (match) {
        const left = match[1]!.trim();
        const rightStr = match[2]!.trim();

        let right: string | number | boolean | null = rightStr;
        if (rightStr === 'null') right = null;
        else if (rightStr === 'true') right = true;
        else if (rightStr === 'false') right = false;
        else {
          const num = Number(rightStr);
          if (!isNaN(num) && rightStr !== '') right = num;
        }

        return { type: 'simple', left, operator: op, right };
      }
    }

    // Fallback: treat as boolean expression
    return { type: 'simple', left: expression, operator: 'eq', right: true };
  }
}
