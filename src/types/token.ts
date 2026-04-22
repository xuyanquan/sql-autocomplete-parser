/**
 * SQL Token types
 */
export enum TokenType {
  // Keywords
  KEYWORD = 'KEYWORD',

  // Identifiers and literals
  IDENTIFIER = 'IDENTIFIER',
  STRING_LITERAL = 'STRING_LITERAL',
  NUMBER_LITERAL = 'NUMBER_LITERAL',

  // Operators
  OPERATOR = 'OPERATOR',
  COMPARISON = 'COMPARISON',
  LOGICAL = 'LOGICAL',

  // Punctuation
  COMMA = 'COMMA',
  DOT = 'DOT',
  SEMICOLON = 'SEMICOLON',
  LPAREN = 'LPAREN',
  RPAREN = 'RPAREN',
  LBRACKET = 'LBRACKET',
  RBRACKET = 'RBRACKET',

  // Comments
  COMMENT = 'COMMENT',

  // Whitespace
  WHITESPACE = 'WHITESPACE',

  // Special
  EOF = 'EOF',
  UNKNOWN = 'UNKNOWN',
}

/**
 * Source position in the input string
 */
export interface SourcePosition {
  /** 0-based line number */
  line: number;
  /** 0-based column number */
  column: number;
  /** 0-based offset from start */
  offset: number;
}

/**
 * Source range spanning start and end positions
 */
export interface SourceRange {
  start: SourcePosition;
  end: SourcePosition;
}

/**
 * SQL Token interface
 */
export interface Token {
  /** Token type */
  type: TokenType;
  /** Raw text value */
  value: string;
  /** Position range in source */
  range: SourceRange;
  /** Normalized value (e.g., uppercased keyword) */
  normalized?: string;
  /** For keywords, the specific keyword name */
  keyword?: string;
}

/**
 * Common SQL keywords
 */
export const SQL_KEYWORDS = new Set([
  // DML
  'SELECT',
  'FROM',
  'WHERE',
  'INSERT',
  'INTO',
  'VALUES',
  'UPDATE',
  'SET',
  'DELETE',
  // Clauses
  'JOIN',
  'INNER',
  'LEFT',
  'RIGHT',
  'OUTER',
  'CROSS',
  'ON',
  'USING',
  'GROUP',
  'BY',
  'HAVING',
  'ORDER',
  'ASC',
  'DESC',
  'LIMIT',
  'OFFSET',
  // Logical
  'AND',
  'OR',
  'NOT',
  'IN',
  'EXISTS',
  'BETWEEN',
  'LIKE',
  'IS',
  'NULL',
  // Aggregate
  'DISTINCT',
  'ALL',
  'AS',
  'CASE',
  'WHEN',
  'THEN',
  'ELSE',
  'END',
  // DDL
  'CREATE',
  'ALTER',
  'DROP',
  'TABLE',
  'INDEX',
  'VIEW',
  'DATABASE',
  'SCHEMA',
  // Types
  'INT',
  'INTEGER',
  'VARCHAR',
  'CHAR',
  'TEXT',
  'DECIMAL',
  'NUMERIC',
  'FLOAT',
  'DOUBLE',
  'DATE',
  'DATETIME',
  'TIMESTAMP',
  'BOOLEAN',
  'BOOL',
  // Constraints
  'PRIMARY',
  'KEY',
  'FOREIGN',
  'UNIQUE',
  'CHECK',
  'DEFAULT',
  'AUTO_INCREMENT',
  // Other
  'WITH',
  'UNION',
  'EXCEPT',
  'INTERSECT',
]);

/**
 * SQL operators
 */
export const SQL_OPERATORS = new Set([
  '+',
  '-',
  '*',
  '/',
  '%',
  '=',
  '!=',
  '<>',
  '<',
  '>',
  '<=',
  '>=',
  '||', // String concatenation
  '&&', // Logical AND (MySQL)
]);
