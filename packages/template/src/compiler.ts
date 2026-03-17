// Template compiler: AST → render function
import { parse } from './parser.js';
import type {
  TemplateNode,
  TemplateContext,
  CompiledTemplate,
  ExpressionNode,
  FilterCall,
  FilterFn,
} from './types.js';

export class CompileError extends Error {
  constructor(message: string, public line: number, public col: number) {
    super(`CompileError at ${line}:${col}: ${message}`);
    this.name = 'CompileError';
  }
}

type LoopContext = {
  index: number;
  index0: number;
  first: boolean;
  last: boolean;
  length: number;
};

export type CompilerOptions = {
  filters?: Record<string, FilterFn>;
  autoEscape?: boolean;
};

export class Compiler {
  private cache = new Map<string, CompiledTemplate>();
  private filters: Record<string, FilterFn>;
  private autoEscape: boolean;

  constructor(options: CompilerOptions = {}) {
    this.filters = options.filters ?? {};
    this.autoEscape = options.autoEscape ?? true;
  }

  compile(source: string, cacheKey?: string): CompiledTemplate {
    if (cacheKey && this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    // Validate source at compile time
    const ast = parse(source);
    this.validateAst(ast);

    const render = (context: TemplateContext): string => {
      return this.renderNodes(ast, context);
    };

    const compiled: CompiledTemplate = { render, ast, source };
    if (cacheKey) {
      this.cache.set(cacheKey, compiled);
    }
    return compiled;
  }

  clearCache(): void {
    this.cache.clear();
  }

  private validateAst(nodes: TemplateNode[]): void {
    for (const node of nodes) {
      this.validateNode(node);
    }
  }

  private validateNode(node: TemplateNode): void {
    switch (node.type) {
      case 'if':
        this.validateAst(node.consequent);
        for (const elseif of node.elseifs) {
          this.validateAst(elseif.body);
        }
        if (node.alternate) this.validateAst(node.alternate);
        break;
      case 'for':
        this.validateAst(node.body);
        if (node.elseBody) this.validateAst(node.elseBody);
        break;
      case 'block':
        this.validateAst(node.body);
        break;
      case 'macro':
        this.validateAst(node.body);
        break;
    }
  }

  renderNodes(nodes: TemplateNode[], context: TemplateContext): string {
    let out = '';
    for (const node of nodes) {
      out += this.renderNode(node, context);
    }
    return out;
  }

  private renderNode(node: TemplateNode, context: TemplateContext): string {
    switch (node.type) {
      case 'text':
        return node.value;

      case 'variable': {
        let value = this.resolveExpression(node.expression, context);
        value = this.applyFilters(value, node.filters, context);
        const str = this.stringify(value);
        return this.autoEscape ? this.escapeHtml(str) : str;
      }

      case 'if':
        return this.renderIf(node, context);

      case 'for':
        return this.renderFor(node, context);

      case 'block':
        // In compilation context, just render block body
        // Template inheritance handled by engine
        return this.renderNodes(node.body, context);

      case 'extends':
        // Template inheritance handled by engine
        return '';

      case 'include':
        // Includes handled by engine via context
        {
          const includeRender = context['__include__'] as ((name: string) => string) | undefined;
          if (includeRender) {
            return includeRender(node.template);
          }
          return '';
        }

      case 'set': {
        const setValue = this.resolveExpression(node.value, context);
        context[node.variable] = setValue;
        return '';
      }

      case 'macro':
        // Register macro in context
        context[`__macro_${node.macro ?? node.name}__`] = node;
        return '';

      case 'call': {
        const macroNode = context[`__macro_${node.macro}__`] as import('./types.js').MacroNode | undefined;
        if (!macroNode) return '';
        const macroContext: TemplateContext = { ...context };
        for (let i = 0; i < macroNode.params.length; i++) {
          const param = macroNode.params[i];
          const arg = node.args[i];
          if (param && arg) {
            macroContext[param] = this.resolveExpression(arg, context);
          }
        }
        return this.renderNodes(macroNode.body, macroContext);
      }

      case 'raw':
        return node.content;

      default:
        return '';
    }
  }

  private renderIf(node: import('./types.js').IfNode, context: TemplateContext): string {
    if (this.isTruthy(this.resolveExpression(node.condition, context))) {
      return this.renderNodes(node.consequent, context);
    }

    for (const elseif of node.elseifs) {
      if (this.isTruthy(this.resolveExpression(elseif.condition, context))) {
        return this.renderNodes(elseif.body, context);
      }
    }

    if (node.alternate) {
      return this.renderNodes(node.alternate, context);
    }

    return '';
  }

  private renderFor(node: import('./types.js').ForNode, context: TemplateContext): string {
    const iterable = this.resolveExpression(node.iterable, context);
    const items = this.toArray(iterable);

    if (items.length === 0) {
      if (node.elseBody) {
        return this.renderNodes(node.elseBody, context);
      }
      return '';
    }

    let out = '';
    for (let i = 0; i < items.length; i++) {
      const loopCtx: LoopContext = {
        index: i + 1,
        index0: i,
        first: i === 0,
        last: i === items.length - 1,
        length: items.length,
      };
      const itemContext: TemplateContext = {
        ...context,
        [node.variable]: items[i],
        loop: loopCtx,
      };
      out += this.renderNodes(node.body, itemContext);
    }
    return out;
  }

  resolveExpression(expr: ExpressionNode, context: TemplateContext): unknown {
    switch (expr.type) {
      case 'literal':
        return expr.value;

      case 'identifier':
        return context[expr.name];

      case 'member': {
        const obj = this.resolveExpression(expr.object, context);
        if (obj === null || obj === undefined) return undefined;
        return (obj as Record<string, unknown>)[expr.property];
      }
    }
  }

  applyFilters(value: unknown, filters: FilterCall[], _context: TemplateContext): unknown {
    let result = value;
    for (const filter of filters) {
      const fn = this.filters[filter.name];
      if (!fn) {
        throw new Error(`Unknown filter: '${filter.name}'`);
      }
      const args = filter.args.map((a) => a.value);
      result = fn(result, ...args);
    }
    return result;
  }

  private stringify(value: unknown): string {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (Array.isArray(value)) return value.join(', ');
    return String(value);
  }

  private isTruthy(value: unknown): boolean {
    if (value === null || value === undefined) return false;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    if (typeof value === 'string') return value.length > 0;
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === 'object') return Object.keys(value as object).length > 0;
    return Boolean(value);
  }

  private toArray(value: unknown): unknown[] {
    if (Array.isArray(value)) return value;
    if (value === null || value === undefined) return [];
    if (typeof value === 'object') return Object.values(value as object);
    return [value];
  }

  escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;');
  }
}
