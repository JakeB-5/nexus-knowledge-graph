// Template engine type definitions

export type TemplateContext = Record<string, unknown>;

export type HelperFn = (
  context: TemplateContext,
  args: unknown[],
  body?: () => string,
  elseBody?: () => string
) => string;

export type FilterFn = (value: unknown, ...args: unknown[]) => unknown;

// AST Node types
export type TextNode = {
  type: 'text';
  value: string;
  line: number;
  col: number;
};

export type VariableNode = {
  type: 'variable';
  expression: ExpressionNode;
  filters: FilterCall[];
  line: number;
  col: number;
};

export type FilterCall = {
  name: string;
  args: LiteralNode[];
};

export type IfNode = {
  type: 'if';
  condition: ExpressionNode;
  consequent: TemplateNode[];
  elseifs: Array<{ condition: ExpressionNode; body: TemplateNode[] }>;
  alternate: TemplateNode[] | null;
  line: number;
  col: number;
};

export type ForNode = {
  type: 'for';
  variable: string;
  iterable: ExpressionNode;
  body: TemplateNode[];
  elseBody: TemplateNode[] | null;
  line: number;
  col: number;
};

export type BlockNode = {
  type: 'block';
  name: string;
  body: TemplateNode[];
  line: number;
  col: number;
};

export type ExtendsNode = {
  type: 'extends';
  template: string;
  line: number;
  col: number;
};

export type IncludeNode = {
  type: 'include';
  template: string;
  line: number;
  col: number;
};

export type SetNode = {
  type: 'set';
  variable: string;
  value: ExpressionNode;
  line: number;
  col: number;
};

export type MacroNode = {
  type: 'macro';
  name: string;
  params: string[];
  body: TemplateNode[];
  line: number;
  col: number;
};

export type CallNode = {
  type: 'call';
  macro: string;
  args: ExpressionNode[];
  line: number;
  col: number;
};

export type RawNode = {
  type: 'raw';
  content: string;
  line: number;
  col: number;
};

export type TemplateNode =
  | TextNode
  | VariableNode
  | IfNode
  | ForNode
  | BlockNode
  | ExtendsNode
  | IncludeNode
  | SetNode
  | MacroNode
  | CallNode
  | RawNode;

// Expression nodes
export type MemberExprNode = {
  type: 'member';
  object: ExpressionNode;
  property: string;
};

export type IdentifierNode = {
  type: 'identifier';
  name: string;
};

export type LiteralNode = {
  type: 'literal';
  value: string | number | boolean | null;
};

export type ExpressionNode = IdentifierNode | MemberExprNode | LiteralNode;

// Compiled template
export type CompiledTemplate = {
  render: (context: TemplateContext) => string;
  ast: TemplateNode[];
  source: string;
};

// Token types (used by lexer)
export type TokenType =
  | 'text'
  | 'open_var'
  | 'close_var'
  | 'open_block'
  | 'close_block'
  | 'open_comment'
  | 'close_comment'
  | 'identifier'
  | 'string'
  | 'number'
  | 'boolean'
  | 'null'
  | 'pipe'
  | 'dot'
  | 'comma'
  | 'colon'
  | 'lparen'
  | 'rparen'
  | 'operator'
  | 'eof';

export type Token = {
  type: TokenType;
  value: string;
  line: number;
  col: number;
};
