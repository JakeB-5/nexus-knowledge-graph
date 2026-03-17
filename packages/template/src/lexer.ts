// Template lexer/tokenizer
import type { Token, TokenType } from './types.js';

export class LexerError extends Error {
  constructor(
    message: string,
    public line: number,
    public col: number
  ) {
    super(`LexerError at ${line}:${col}: ${message}`);
    this.name = 'LexerError';
  }
}

type LexerMode = 'text' | 'variable' | 'block' | 'comment';

export class Lexer {
  private pos = 0;
  private line = 1;
  private col = 1;
  private tokens: Token[] = [];
  private mode: LexerMode = 'text';

  constructor(private source: string) {}

  tokenize(): Token[] {
    while (this.pos < this.source.length) {
      if (this.mode === 'text') {
        this.readText();
      } else if (this.mode === 'variable') {
        this.readVariable();
      } else if (this.mode === 'block') {
        this.readBlock();
      } else if (this.mode === 'comment') {
        this.readComment();
      }
    }
    this.tokens.push({ type: 'eof', value: '', line: this.line, col: this.col });
    return this.tokens;
  }

  private peek(offset = 0): string {
    return this.source[this.pos + offset] ?? '';
  }

  private advance(): string {
    const ch = this.source[this.pos] ?? '';
    this.pos++;
    if (ch === '\n') {
      this.line++;
      this.col = 1;
    } else {
      this.col++;
    }
    return ch;
  }

  private match(str: string): boolean {
    if (this.source.startsWith(str, this.pos)) {
      for (let i = 0; i < str.length; i++) {
        this.advance();
      }
      return true;
    }
    return false;
  }

  private readText(): void {
    const startLine = this.line;
    const startCol = this.col;
    let text = '';

    while (this.pos < this.source.length) {
      // Check for escape sequence
      if (this.peek() === '\\' && (this.peek(1) === '{' || this.peek(1) === '%' || this.peek(1) === '#')) {
        this.advance(); // consume backslash
        text += this.advance(); // consume escaped char
        continue;
      }

      // Check for {{ variable open
      if (this.peek() === '{' && this.peek(1) === '{' && this.peek(2) !== '{') {
        if (text) {
          this.tokens.push({ type: 'text', value: text, line: startLine, col: startCol });
        }
        this.advance(); this.advance(); // consume {{
        this.tokens.push({ type: 'open_var', value: '{{', line: this.line, col: this.col - 2 });
        this.mode = 'variable';
        return;
      }

      // Check for {# comment open
      if (this.peek() === '{' && this.peek(1) === '#') {
        if (text) {
          this.tokens.push({ type: 'text', value: text, line: startLine, col: startCol });
        }
        this.advance(); this.advance(); // consume {#
        this.tokens.push({ type: 'open_comment', value: '{#', line: this.line, col: this.col - 2 });
        this.mode = 'comment';
        return;
      }

      // Check for {% block open
      if (this.peek() === '{' && this.peek(1) === '%') {
        if (text) {
          this.tokens.push({ type: 'text', value: text, line: startLine, col: startCol });
        }
        this.advance(); this.advance(); // consume {%
        this.tokens.push({ type: 'open_block', value: '{%', line: this.line, col: this.col - 2 });
        this.mode = 'block';
        return;
      }

      text += this.advance();
    }

    if (text) {
      this.tokens.push({ type: 'text', value: text, line: startLine, col: startCol });
    }
  }

  private skipWhitespace(): void {
    while (this.pos < this.source.length && /\s/.test(this.peek())) {
      this.advance();
    }
  }

  private readIdentifier(): string {
    let id = '';
    while (this.pos < this.source.length && /[a-zA-Z0-9_]/.test(this.peek())) {
      id += this.advance();
    }
    return id;
  }

  private readString(quote: string): string {
    let str = '';
    while (this.pos < this.source.length) {
      const ch = this.peek();
      if (ch === '\\') {
        this.advance();
        const escaped = this.advance();
        switch (escaped) {
          case 'n': str += '\n'; break;
          case 't': str += '\t'; break;
          case 'r': str += '\r'; break;
          case '\\': str += '\\'; break;
          default: str += escaped;
        }
      } else if (ch === quote) {
        this.advance();
        break;
      } else {
        str += this.advance();
      }
    }
    return str;
  }

  private readNumber(): string {
    let num = '';
    if (this.peek() === '-') num += this.advance();
    while (this.pos < this.source.length && /[0-9.]/.test(this.peek())) {
      num += this.advance();
    }
    return num;
  }

  private readVariable(): void {
    this.skipWhitespace();

    if (this.source.startsWith('}}', this.pos)) {
      this.advance(); this.advance();
      this.tokens.push({ type: 'close_var', value: '}}', line: this.line, col: this.col - 2 });
      this.mode = 'text';
      return;
    }

    this.readExpressionToken();
  }

  private readBlock(): void {
    this.skipWhitespace();

    if (this.source.startsWith('%}', this.pos)) {
      this.advance(); this.advance();
      this.tokens.push({ type: 'close_block', value: '%}', line: this.line, col: this.col - 2 });
      this.mode = 'text';
      return;
    }

    this.readExpressionToken();
  }

  private readExpressionToken(): void {
    const line = this.line;
    const col = this.col;
    const ch = this.peek();

    if (ch === '|') {
      this.advance();
      this.tokens.push({ type: 'pipe', value: '|', line, col });
    } else if (ch === '.') {
      this.advance();
      this.tokens.push({ type: 'dot', value: '.', line, col });
    } else if (ch === ',') {
      this.advance();
      this.tokens.push({ type: 'comma', value: ',', line, col });
    } else if (ch === ':') {
      this.advance();
      this.tokens.push({ type: 'colon', value: ':', line, col });
    } else if (ch === '(') {
      this.advance();
      this.tokens.push({ type: 'lparen', value: '(', line, col });
    } else if (ch === ')') {
      this.advance();
      this.tokens.push({ type: 'rparen', value: ')', line, col });
    } else if (ch === '"' || ch === "'") {
      this.advance();
      const str = this.readString(ch);
      this.tokens.push({ type: 'string', value: str, line, col });
    } else if (ch === '-' && /[0-9]/.test(this.peek(1))) {
      const num = this.readNumber();
      this.tokens.push({ type: 'number', value: num, line, col });
    } else if (/[0-9]/.test(ch)) {
      const num = this.readNumber();
      this.tokens.push({ type: 'number', value: num, line, col });
    } else if (/[a-zA-Z_]/.test(ch)) {
      const id = this.readIdentifier();
      let type: TokenType = 'identifier';
      if (id === 'true' || id === 'false') {
        type = 'boolean';
      } else if (id === 'null' || id === 'none' || id === 'None') {
        type = 'null';
      } else if (['==', '!=', '>', '<', '>=', '<=', 'and', 'or', 'not', 'in', 'is'].includes(id)) {
        type = 'operator';
      }
      this.tokens.push({ type, value: id, line, col });
    } else if (['=', '!', '>', '<'].includes(ch)) {
      let op = this.advance();
      if (this.peek() === '=') op += this.advance();
      this.tokens.push({ type: 'operator', value: op, line, col });
    } else {
      throw new LexerError(`Unexpected character: ${ch}`, line, col);
    }
  }

  private readComment(): void {
    while (this.pos < this.source.length) {
      if (this.peek() === '#' && this.peek(1) === '}') {
        this.advance(); this.advance();
        this.tokens.push({ type: 'close_comment', value: '#}', line: this.line, col: this.col - 2 });
        this.mode = 'text';
        return;
      }
      this.advance();
    }
    throw new LexerError('Unclosed comment', this.line, this.col);
  }
}

// Token stream with peek/next/expect
export class TokenStream {
  private pos = 0;

  constructor(private tokens: Token[]) {}

  peek(offset = 0): Token {
    const tok = this.tokens[this.pos + offset];
    if (!tok) {
      return { type: 'eof', value: '', line: 0, col: 0 };
    }
    return tok;
  }

  next(): Token {
    const tok = this.tokens[this.pos];
    if (!tok) {
      return { type: 'eof', value: '', line: 0, col: 0 };
    }
    this.pos++;
    return tok;
  }

  expect(type: TokenType, value?: string): Token {
    const tok = this.next();
    if (tok.type !== type) {
      throw new Error(`Expected token type '${type}' but got '${tok.type}' ('${tok.value}') at ${tok.line}:${tok.col}`);
    }
    if (value !== undefined && tok.value !== value) {
      throw new Error(`Expected token value '${value}' but got '${tok.value}' at ${tok.line}:${tok.col}`);
    }
    return tok;
  }

  expectIdentifier(name?: string): Token {
    return this.expect('identifier', name);
  }

  skipWhitespace(): void {
    // Whitespace is already handled by the lexer, no-op here
  }

  isEof(): boolean {
    return this.peek().type === 'eof';
  }

  get currentLine(): number {
    return this.peek().line;
  }

  get currentCol(): number {
    return this.peek().col;
  }
}

export function tokenize(source: string): Token[] {
  return new Lexer(source).tokenize();
}
