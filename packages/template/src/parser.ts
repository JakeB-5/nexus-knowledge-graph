// Template parser: tokens → AST
import { TokenStream, tokenize } from './lexer.js';
import type {
  TemplateNode,
  ExpressionNode,
  FilterCall,
  LiteralNode,
  TextNode,
  VariableNode,
  IfNode,
  ForNode,
  BlockNode,
  ExtendsNode,
  IncludeNode,
  SetNode,
  MacroNode,
  CallNode,
  RawNode,
  Token,
} from './types.js';

export class ParseError extends Error {
  constructor(
    message: string,
    public line: number,
    public col: number
  ) {
    super(`ParseError at ${line}:${col}: ${message}`);
    this.name = 'ParseError';
  }
}

export class Parser {
  private stream: TokenStream;

  constructor(source: string) {
    const tokens = tokenize(source);
    this.stream = new TokenStream(tokens);
  }

  parse(): TemplateNode[] {
    const nodes: TemplateNode[] = [];
    while (!this.stream.isEof()) {
      const node = this.parseNode();
      if (node) nodes.push(node);
    }
    return nodes;
  }

  private parseNode(): TemplateNode | null {
    const tok = this.stream.peek();

    if (tok.type === 'text') {
      this.stream.next();
      return { type: 'text', value: tok.value, line: tok.line, col: tok.col } as TextNode;
    }

    if (tok.type === 'open_var') {
      return this.parseVariable();
    }

    if (tok.type === 'open_block') {
      return this.parseBlock();
    }

    if (tok.type === 'open_comment') {
      this.skipComment();
      return null;
    }

    if (tok.type === 'eof') {
      return null;
    }

    throw new ParseError(`Unexpected token: ${tok.type} ('${tok.value}')`, tok.line, tok.col);
  }

  private parseVariable(): VariableNode {
    const open = this.stream.expect('open_var');
    const expr = this.parseExpression();
    const filters = this.parseFilters();
    this.stream.expect('close_var');
    return {
      type: 'variable',
      expression: expr,
      filters,
      line: open.line,
      col: open.col,
    };
  }

  private parseExpression(): ExpressionNode {
    const tok = this.stream.peek();

    if (tok.type === 'string') {
      this.stream.next();
      return { type: 'literal', value: tok.value };
    }

    if (tok.type === 'number') {
      this.stream.next();
      return { type: 'literal', value: parseFloat(tok.value) };
    }

    if (tok.type === 'boolean') {
      this.stream.next();
      return { type: 'literal', value: tok.value === 'true' };
    }

    if (tok.type === 'null') {
      this.stream.next();
      return { type: 'literal', value: null };
    }

    if (tok.type === 'identifier') {
      this.stream.next();
      let expr: ExpressionNode = { type: 'identifier', name: tok.value };

      // Handle dot notation: user.name.first
      while (this.stream.peek().type === 'dot') {
        this.stream.next(); // consume dot
        const prop = this.stream.expect('identifier');
        expr = { type: 'member', object: expr, property: prop.value };
      }

      return expr;
    }

    throw new ParseError(`Expected expression, got ${tok.type} ('${tok.value}')`, tok.line, tok.col);
  }

  private parseFilters(): FilterCall[] {
    const filters: FilterCall[] = [];
    while (this.stream.peek().type === 'pipe') {
      this.stream.next(); // consume |
      const nameTok = this.stream.expect('identifier');
      const args: LiteralNode[] = [];

      // Filter args: {{ value | truncate(10) }}
      if (this.stream.peek().type === 'lparen') {
        this.stream.next(); // consume (
        while (this.stream.peek().type !== 'rparen' && !this.stream.isEof()) {
          const argTok = this.stream.next();
          if (argTok.type === 'string') {
            args.push({ type: 'literal', value: argTok.value });
          } else if (argTok.type === 'number') {
            args.push({ type: 'literal', value: parseFloat(argTok.value) });
          } else if (argTok.type === 'boolean') {
            args.push({ type: 'literal', value: argTok.value === 'true' });
          } else if (argTok.type === 'null') {
            args.push({ type: 'literal', value: null });
          }
          if (this.stream.peek().type === 'comma') {
            this.stream.next();
          }
        }
        this.stream.expect('rparen');
      }

      filters.push({ name: nameTok.value, args });
    }
    return filters;
  }

  private parseBlock(): TemplateNode | null {
    const open = this.stream.expect('open_block');
    const keyword = this.stream.peek();

    if (keyword.type !== 'identifier') {
      throw new ParseError(`Expected block keyword, got '${keyword.value}'`, keyword.line, keyword.col);
    }

    this.stream.next(); // consume keyword

    switch (keyword.value) {
      case 'if': return this.parseIf(open);
      case 'for': return this.parseFor(open);
      case 'block': return this.parseBlockTag(open);
      case 'extends': return this.parseExtends(open);
      case 'include': return this.parseInclude(open);
      case 'set': return this.parseSet(open);
      case 'macro': return this.parseMacro(open);
      case 'call': return this.parseCall(open);
      case 'raw': return this.parseRaw(open);
      case 'endif':
      case 'endfor':
      case 'endblock':
      case 'endmacro':
      case 'else':
      case 'elif':
        // These are end/continuation markers — put the keyword back conceptually
        // by consuming close_block and returning null signal
        // We handle this by throwing a special sentinel
        this.stream.expect('close_block');
        throw new BlockEndSentinel(keyword.value, keyword.line, keyword.col);
      default:
        throw new ParseError(`Unknown block tag: '${keyword.value}'`, keyword.line, keyword.col);
    }
  }

  private parseIf(open: Token): IfNode {
    const condition = this.parseExpression();
    this.stream.expect('close_block');

    const consequent = this.parseUntil(['endif', 'else', 'elif']);
    const elseifs: Array<{ condition: ExpressionNode; body: TemplateNode[] }> = [];
    let alternate: TemplateNode[] | null = null;

    // After parseUntil, a BlockEndSentinel was caught — we need to check what stopped us
    // We use a loop to handle elif chains
    // Re-read the block tag that stopped parseUntil
    let continuationKeyword = this.lastSentinelKeyword;

    while (continuationKeyword === 'elif') {
      const elifCondition = this.parseExpression();
      this.stream.expect('close_block');
      const elifBody = this.parseUntil(['endif', 'else', 'elif']);
      elseifs.push({ condition: elifCondition, body: elifBody });
      continuationKeyword = this.lastSentinelKeyword;
    }

    if (continuationKeyword === 'else') {
      this.stream.expect('close_block');
      alternate = this.parseUntil(['endif']);
    }

    return {
      type: 'if',
      condition,
      consequent,
      elseifs,
      alternate,
      line: open.line,
      col: open.col,
    };
  }

  private parseFor(open: Token): ForNode {
    const varTok = this.stream.expect('identifier');
    this.stream.expectIdentifier('in');
    const iterable = this.parseExpression();
    this.stream.expect('close_block');

    const body = this.parseUntil(['endfor', 'else']);
    let elseBody: TemplateNode[] | null = null;

    if (this.lastSentinelKeyword === 'else') {
      this.stream.expect('close_block');
      elseBody = this.parseUntil(['endfor']);
    }

    return {
      type: 'for',
      variable: varTok.value,
      iterable,
      body,
      elseBody,
      line: open.line,
      col: open.col,
    };
  }

  private parseBlockTag(open: Token): BlockNode {
    const nameTok = this.stream.expect('identifier');
    this.stream.expect('close_block');
    const body = this.parseUntil(['endblock']);
    return {
      type: 'block',
      name: nameTok.value,
      body,
      line: open.line,
      col: open.col,
    };
  }

  private parseExtends(open: Token): ExtendsNode {
    const tmplTok = this.stream.next();
    const templateName = tmplTok.type === 'string' ? tmplTok.value : tmplTok.value;
    this.stream.expect('close_block');
    return {
      type: 'extends',
      template: templateName,
      line: open.line,
      col: open.col,
    };
  }

  private parseInclude(open: Token): IncludeNode {
    const tmplTok = this.stream.next();
    const templateName = tmplTok.type === 'string' ? tmplTok.value : tmplTok.value;
    this.stream.expect('close_block');
    return {
      type: 'include',
      template: templateName,
      line: open.line,
      col: open.col,
    };
  }

  private parseSet(open: Token): SetNode {
    const varTok = this.stream.expect('identifier');
    this.stream.expect('operator', '=');
    const value = this.parseExpression();
    this.stream.expect('close_block');
    return {
      type: 'set',
      variable: varTok.value,
      value,
      line: open.line,
      col: open.col,
    };
  }

  private parseMacro(open: Token): MacroNode {
    const nameTok = this.stream.expect('identifier');
    const params: string[] = [];

    if (this.stream.peek().type === 'lparen') {
      this.stream.next(); // consume (
      while (this.stream.peek().type !== 'rparen' && !this.stream.isEof()) {
        const paramTok = this.stream.expect('identifier');
        params.push(paramTok.value);
        if (this.stream.peek().type === 'comma') {
          this.stream.next();
        }
      }
      this.stream.expect('rparen');
    }

    this.stream.expect('close_block');
    const body = this.parseUntil(['endmacro']);
    return {
      type: 'macro',
      name: nameTok.value,
      params,
      body,
      line: open.line,
      col: open.col,
    };
  }

  private parseCall(open: Token): CallNode {
    const macroTok = this.stream.expect('identifier');
    const args: ExpressionNode[] = [];

    if (this.stream.peek().type === 'lparen') {
      this.stream.next(); // consume (
      while (this.stream.peek().type !== 'rparen' && !this.stream.isEof()) {
        args.push(this.parseExpression());
        if (this.stream.peek().type === 'comma') {
          this.stream.next();
        }
      }
      this.stream.expect('rparen');
    }

    this.stream.expect('close_block');
    return {
      type: 'call',
      macro: macroTok.value,
      args,
      line: open.line,
      col: open.col,
    };
  }

  private parseRaw(open: Token): RawNode {
    this.stream.expect('close_block');
    // Consume everything until {% endraw %}
    let content = '';
    const source = (this.stream as unknown as { tokens: Token[] }).tokens;
    // Fallback: read text tokens until we find endraw
    let tok = this.stream.peek();
    while (!this.stream.isEof()) {
      if (tok.type === 'open_block') {
        // peek at next to see if it's endraw
        const next = this.stream.peek(1);
        if (next.type === 'identifier' && next.value === 'endraw') {
          this.stream.next(); // open_block
          this.stream.next(); // endraw
          this.stream.expect('close_block');
          break;
        }
      }
      content += tok.value;
      this.stream.next();
      tok = this.stream.peek();
    }
    void source;
    return {
      type: 'raw',
      content,
      line: open.line,
      col: open.col,
    };
  }

  private skipComment(): void {
    this.stream.expect('open_comment');
    while (!this.stream.isEof()) {
      const tok = this.stream.next();
      if (tok.type === 'close_comment') break;
    }
  }

  private lastSentinelKeyword = '';

  private parseUntil(endKeywords: string[]): TemplateNode[] {
    const nodes: TemplateNode[] = [];
    while (!this.stream.isEof()) {
      try {
        const node = this.parseNode();
        if (node) nodes.push(node);
      } catch (e) {
        if (e instanceof BlockEndSentinel) {
          if (endKeywords.includes(e.keyword)) {
            this.lastSentinelKeyword = e.keyword;
            return nodes;
          }
          throw e;
        }
        throw e;
      }
    }
    throw new ParseError(`Expected one of: ${endKeywords.join(', ')}`, this.stream.currentLine, this.stream.currentCol);
  }
}

class BlockEndSentinel extends Error {
  constructor(
    public keyword: string,
    public line: number,
    public col: number
  ) {
    super(`BlockEnd: ${keyword}`);
    this.name = 'BlockEndSentinel';
  }
}

export function parse(source: string): TemplateNode[] {
  return new Parser(source).parse();
}
