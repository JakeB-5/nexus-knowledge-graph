// TemplateEngine: high-level API
import { Compiler } from './compiler.js';
import { parse } from './parser.js';
import { builtinFilters } from './filters.js';
import { builtinHelpers } from './helpers.js';
import type {
  TemplateContext,
  CompiledTemplate,
  FilterFn,
  HelperFn,
  TemplateNode,
  BlockNode,
} from './types.js';

export class TemplateError extends Error {
  constructor(message: string, public templateName?: string) {
    super(templateName ? `[${templateName}] ${message}` : message);
    this.name = 'TemplateError';
  }
}

export class TemplateEngine {
  private templates = new Map<string, string>();
  private partials = new Map<string, string>();
  private filters: Record<string, FilterFn> = { ...builtinFilters };
  private helpers: Record<string, HelperFn> = { ...builtinHelpers };
  private compiler: Compiler;
  private autoEscape: boolean;

  constructor(options: { autoEscape?: boolean } = {}) {
    this.autoEscape = options.autoEscape ?? true;
    this.compiler = new Compiler({
      filters: this.filters,
      autoEscape: this.autoEscape,
    });
  }

  // Register a named template from string
  registerTemplate(name: string, source: string): void {
    this.templates.set(name, source);
  }

  // Register a partial (reusable fragment)
  registerPartial(name: string, source: string): void {
    this.partials.set(name, source);
  }

  // Register a custom filter
  registerFilter(name: string, fn: FilterFn): void {
    this.filters[name] = fn;
  }

  // Register a custom helper
  registerHelper(name: string, fn: HelperFn): void {
    this.helpers[name] = fn;
  }

  // Render a named template
  render(name: string, context: TemplateContext = {}): string {
    const source = this.templates.get(name);
    if (!source) {
      throw new TemplateError(`Template not found: '${name}'`, name);
    }
    return this.renderString(source, context, name);
  }

  // Render a template string directly
  renderString(source: string, context: TemplateContext = {}, _name?: string): string {
    const ast = parse(source);

    // Check for template inheritance (extends)
    const extendsNode = ast.find((n) => n.type === 'extends');
    if (extendsNode && extendsNode.type === 'extends') {
      return this.renderWithInheritance(extendsNode.template, ast, context);
    }

    // Build context with include support
    const fullContext: TemplateContext = {
      ...context,
      __include__: (partialName: string) => {
        return this.renderInclude(partialName, context);
      },
    };

    return this.compiler.renderNodes(ast, fullContext);
  }

  // Compile a template for repeated use
  compile(source: string, name?: string): CompiledTemplate {
    return this.compiler.compile(source, name);
  }

  private renderInclude(name: string, context: TemplateContext): string {
    // Check partials first
    const partial = this.partials.get(name);
    if (partial) {
      return this.renderString(partial, context);
    }
    // Then named templates
    const tmpl = this.templates.get(name);
    if (tmpl) {
      return this.renderString(tmpl, context);
    }
    throw new TemplateError(`Include not found: '${name}'`);
  }

  private renderWithInheritance(
    parentName: string,
    childAst: TemplateNode[],
    context: TemplateContext
  ): string {
    const parentSource = this.templates.get(parentName) ?? this.partials.get(parentName);
    if (!parentSource) {
      throw new TemplateError(`Parent template not found: '${parentName}'`);
    }

    const parentAst = parse(parentSource);

    // Collect block overrides from child
    const childBlocks = new Map<string, BlockNode>();
    for (const node of childAst) {
      if (node.type === 'block') {
        childBlocks.set(node.name, node);
      }
    }

    // Render parent with child blocks substituted
    const fullContext: TemplateContext = {
      ...context,
      __blocks__: childBlocks,
      __include__: (name: string) => this.renderInclude(name, context),
    };

    return this.renderNodesWithBlocks(parentAst, fullContext, childBlocks);
  }

  private renderNodesWithBlocks(
    nodes: TemplateNode[],
    context: TemplateContext,
    childBlocks: Map<string, BlockNode>
  ): string {
    let out = '';
    for (const node of nodes) {
      if (node.type === 'block') {
        const override = childBlocks.get(node.name);
        if (override) {
          out += this.compiler.renderNodes(override.body, context);
        } else {
          out += this.compiler.renderNodes(node.body, context);
        }
      } else if (node.type === 'extends') {
        // ignore nested extends in parent
      } else {
        out += this.compiler.renderNodes([node], context);
      }
    }
    return out;
  }

  // Auto-escape a string value
  escapeHtml(str: string): string {
    return this.compiler.escapeHtml(str);
  }

  // Clear compiled template cache
  clearCache(): void {
    this.compiler.clearCache();
  }
}
