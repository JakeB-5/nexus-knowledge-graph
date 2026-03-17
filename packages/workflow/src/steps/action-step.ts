// ActionStep executor - runs built-in and custom actions

import {
  ActionStepConfig,
  ExecutionContext,
  StepResult,
  WorkflowError,
  WorkflowErrorCode,
} from '../types.js';
import { ExpressionEvaluator } from '../expression.js';

export interface ActionInput {
  [key: string]: unknown;
}

export interface ActionOutput {
  [key: string]: unknown;
}

export type ActionHandler = (inputs: ActionInput, ctx: ExecutionContext) => Promise<ActionOutput>;

// Built-in action implementations (stubs that can be overridden)
const builtinActions: Record<string, ActionHandler> = {
  create_node: async (inputs) => {
    const node = {
      id: `node_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      type: inputs['type'] as string ?? 'generic',
      properties: (inputs['properties'] as Record<string, unknown>) ?? {},
      createdAt: new Date().toISOString(),
    };
    return { node, nodeId: node.id };
  },

  update_node: async (inputs) => {
    const nodeId = inputs['nodeId'] as string;
    if (!nodeId) throw new WorkflowError(WorkflowErrorCode.InvalidStepConfig, 'update_node requires nodeId');
    return {
      nodeId,
      updated: true,
      properties: (inputs['properties'] as Record<string, unknown>) ?? {},
    };
  },

  delete_node: async (inputs) => {
    const nodeId = inputs['nodeId'] as string;
    if (!nodeId) throw new WorkflowError(WorkflowErrorCode.InvalidStepConfig, 'delete_node requires nodeId');
    return { nodeId, deleted: true };
  },

  create_edge: async (inputs) => {
    const fromId = inputs['fromId'] as string;
    const toId = inputs['toId'] as string;
    const edgeType = inputs['edgeType'] as string ?? 'related';
    if (!fromId || !toId) {
      throw new WorkflowError(WorkflowErrorCode.InvalidStepConfig, 'create_edge requires fromId and toId');
    }
    const edge = {
      id: `edge_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      fromId,
      toId,
      type: edgeType,
      properties: (inputs['properties'] as Record<string, unknown>) ?? {},
      createdAt: new Date().toISOString(),
    };
    return { edge, edgeId: edge.id };
  },

  delete_edge: async (inputs) => {
    const edgeId = inputs['edgeId'] as string;
    if (!edgeId) throw new WorkflowError(WorkflowErrorCode.InvalidStepConfig, 'delete_edge requires edgeId');
    return { edgeId, deleted: true };
  },

  send_notification: async (inputs) => {
    const recipient = inputs['recipient'] as string ?? 'system';
    const message = inputs['message'] as string ?? '';
    const channel = inputs['channel'] as string ?? 'default';
    // In production this would send via the notifications package
    return {
      sent: true,
      recipient,
      message,
      channel,
      sentAt: new Date().toISOString(),
    };
  },

  run_search: async (inputs) => {
    const query = inputs['query'] as string ?? '';
    const limit = (inputs['limit'] as number) ?? 10;
    // In production this would call the search package
    return {
      query,
      results: [] as unknown[],
      total: 0,
      limit,
    };
  },

  extract_keywords: async (inputs) => {
    const text = inputs['text'] as string ?? '';
    // Simple keyword extraction: split on whitespace, filter stop words, deduplicate
    const stopWords = new Set(['the', 'a', 'an', 'is', 'in', 'on', 'at', 'to', 'for', 'of', 'and', 'or', 'but', 'with', 'by']);
    const words = text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 2 && !stopWords.has(w));
    const keywords = [...new Set(words)].slice(0, inputs['maxKeywords'] as number ?? 20);
    return { keywords, text };
  },

  http_request: async (inputs) => {
    const url = inputs['url'] as string;
    if (!url) throw new WorkflowError(WorkflowErrorCode.InvalidStepConfig, 'http_request requires url');
    const method = (inputs['method'] as string ?? 'GET').toUpperCase();
    const headers = (inputs['headers'] as Record<string, string>) ?? {};
    const body = inputs['body'];

    const fetchOptions: RequestInit = {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
    };
    if (body !== undefined && method !== 'GET') {
      fetchOptions.body = typeof body === 'string' ? body : JSON.stringify(body);
    }

    const response = await fetch(url, fetchOptions);
    const responseText = await response.text();
    let responseBody: unknown = responseText;
    try {
      responseBody = JSON.parse(responseText);
    } catch { /* not JSON */ }

    return {
      status: response.status,
      ok: response.ok,
      headers: Object.fromEntries(response.headers.entries()),
      body: responseBody,
    };
  },

  log: async (inputs) => {
    const level = inputs['level'] as string ?? 'info';
    const message = inputs['message'] as string ?? '';
    const data = inputs['data'];
    // In production this would call the logger package
    console.log(`[workflow:${level}] ${message}`, data ?? '');
    return { logged: true, level, message };
  },

  set_variable: async (inputs, ctx) => {
    const name = inputs['name'] as string;
    const value = inputs['value'];
    if (!name) throw new WorkflowError(WorkflowErrorCode.InvalidStepConfig, 'set_variable requires name');
    ctx.variables[name] = value;
    return { name, value };
  },

  merge_objects: async (inputs) => {
    const objects = inputs['objects'] as unknown[];
    if (!Array.isArray(objects)) {
      return { result: {} };
    }
    const result = Object.assign({}, ...objects.filter(o => o && typeof o === 'object'));
    return { result };
  },

  transform: async (inputs) => {
    const data = inputs['data'];
    const mapping = inputs['mapping'] as Record<string, string>;
    if (!mapping || typeof data !== 'object' || data === null) {
      return { result: data };
    }
    const source = data as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const [targetKey, sourceKey] of Object.entries(mapping)) {
      result[targetKey] = source[sourceKey];
    }
    return { result };
  },
};

export class ActionStepExecutor {
  private customActions: Map<string, ActionHandler> = new Map();
  private evaluator: ExpressionEvaluator;

  constructor(evaluator: ExpressionEvaluator) {
    this.evaluator = evaluator;
  }

  /** Register a custom action handler */
  registerAction(name: string, handler: ActionHandler): void {
    this.customActions.set(name, handler);
  }

  /** Check if an action is registered */
  hasAction(name: string): boolean {
    return this.customActions.has(name) || name in builtinActions;
  }

  async execute(
    stepId: string,
    config: ActionStepConfig,
    ctx: ExecutionContext,
    attempt: number
  ): Promise<StepResult> {
    const startedAt = new Date();

    try {
      const handler = this.customActions.get(config.action) ?? builtinActions[config.action];
      if (!handler) {
        throw new WorkflowError(
          WorkflowErrorCode.ActionNotFound,
          `Action '${config.action}' is not registered`,
          stepId
        );
      }

      // Resolve inputs: interpolate expressions in config values
      const evalCtx = {
        variables: ctx.variables,
        stepResults: ctx.stepResults as Map<string, unknown>,
      };
      const resolvedInputs: ActionInput = {};
      if (config.inputs) {
        for (const [key, val] of Object.entries(config.inputs)) {
          resolvedInputs[key] = this.evaluator.resolveValue(val, evalCtx);
        }
      }

      const output = await handler(resolvedInputs, ctx);

      // Apply output mapping to context variables
      if (config.outputMapping) {
        for (const [outputKey, contextPath] of Object.entries(config.outputMapping)) {
          const value = (output as Record<string, unknown>)[outputKey];
          this.setNestedVariable(ctx.variables, contextPath, value);
        }
      }

      const result: StepResult = {
        stepId,
        status: 'success',
        output,
        startedAt,
        completedAt: new Date(),
        attempt,
      };

      ctx.stepResults.set(stepId, result);
      return result;
    } catch (err) {
      const result: StepResult = {
        stepId,
        status: 'failure',
        error: err instanceof Error ? err.message : String(err),
        startedAt,
        completedAt: new Date(),
        attempt,
      };
      ctx.stepResults.set(stepId, result);
      throw err;
    }
  }

  private setNestedVariable(
    variables: Record<string, unknown>,
    path: string,
    value: unknown
  ): void {
    const parts = path.split('.');
    let current = variables;
    for (let i = 0; i < parts.length - 1; i++) {
      const key = parts[i]!;
      if (typeof current[key] !== 'object' || current[key] === null) {
        current[key] = {};
      }
      current = current[key] as Record<string, unknown>;
    }
    const lastKey = parts[parts.length - 1];
    if (lastKey) {
      current[lastKey] = value;
    }
  }
}
