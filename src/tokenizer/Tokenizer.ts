import {
  Token,
  TokenType,
  SourcePosition,
  SourceRange,
  SQL_KEYWORDS,
  SQL_OPERATORS,
} from '@/types';

/**
 * SQL Tokenizer - converts SQL string into tokens
 */
export class Tokenizer {
  private input: string;
  private position: number;
  private line: number;
  private column: number;
  private tokens: Token[];

  constructor(input: string) {
    this.input = input;
    this.position = 0;
    this.line = 0;
    this.column = 0;
    this.tokens = [];
  }

  /**
   * Tokenize the input SQL string
   */
  tokenize(): Token[] {
    this.tokens = [];
    this.position = 0;
    this.line = 0;
    this.column = 0;

    while (this.position < this.input.length) {
      this.skipWhitespace();
      
      if (this.position >= this.input.length) break;

      const token = this.nextToken();
      if (token) {
        this.tokens.push(token);
      }
    }

    // Add EOF token
    this.tokens.push(this.createToken(TokenType.EOF, '', this.getPosition()));

    return this.tokens;
  }

  private nextToken(): Token | null {
    const char = this.currentChar();
    const start = this.getPosition();

    // Comments
    if (char === '-' && this.peek() === '-') {
      return this.readSingleLineComment(start);
    }
    if (char === '/' && this.peek() === '*') {
      return this.readMultiLineComment(start);
    }

    // String literals
    if (char === "'" || char === '"' || char === '`') {
      return this.readStringLiteral(char, start);
    }

    // Numbers
    if (this.isDigit(char)) {
      return this.readNumber(start);
    }

    // Identifiers and keywords
    if (this.isIdentifierStart(char)) {
      return this.readIdentifier(start);
    }

    // Operators
    if (this.isOperatorStart(char)) {
      return this.readOperator(start);
    }

    // Punctuation
    return this.readPunctuation(start);
  }

  private readIdentifier(start: SourcePosition): Token {
    let value = '';
    while (this.position < this.input.length && this.isIdentifierPart(this.currentChar())) {
      value += this.currentChar();
      this.advance();
    }

    const normalized = value.toUpperCase();
    const isKeyword = SQL_KEYWORDS.has(normalized);

    return this.createToken(
      isKeyword ? TokenType.KEYWORD : TokenType.IDENTIFIER,
      value,
      start,
      isKeyword ? normalized : undefined
    );
  }

  private readNumber(start: SourcePosition): Token {
    let value = '';
    let hasDecimal = false;

    while (this.position < this.input.length) {
      const char = this.currentChar();
      
      if (this.isDigit(char)) {
        value += char;
        this.advance();
      } else if (char === '.' && !hasDecimal) {
        hasDecimal = true;
        value += char;
        this.advance();
      } else if ((char === 'e' || char === 'E') && !value.endsWith('e') && !value.endsWith('E')) {
        value += char;
        this.advance();
        if (this.currentChar() === '+' || this.currentChar() === '-') {
          value += this.currentChar();
          this.advance();
        }
      } else {
        break;
      }
    }

    return this.createToken(TokenType.NUMBER_LITERAL, value, start);
  }

  private readStringLiteral(quote: string, start: SourcePosition): Token {
    let value = '';
    this.advance(); // Skip opening quote

    while (this.position < this.input.length) {
      const char = this.currentChar();

      if (char === quote) {
        this.advance(); // Skip closing quote
        break;
      }

      if (char === '\\' && this.position + 1 < this.input.length) {
        // Handle escape sequences
        this.advance();
        const escaped = this.currentChar();
        switch (escaped) {
          case 'n':
            value += '\n';
            break;
          case 't':
            value += '\t';
            break;
          case 'r':
            value += '\r';
            break;
          case '\\':
            value += '\\';
            break;
          case quote:
            value += quote;
            break;
          default:
            value += escaped;
        }
        this.advance();
      } else {
        value += char;
        this.advance();
      }
    }

    return this.createToken(TokenType.STRING_LITERAL, value, start);
  }

  private readOperator(start: SourcePosition): Token {
    let value = this.currentChar();
    this.advance();

    // Try to match two-character operators
    if (this.position < this.input.length) {
      const twoChar = value + this.currentChar();
      if (SQL_OPERATORS.has(twoChar)) {
        value = twoChar;
        this.advance();
      }
    }

    return this.createToken(TokenType.OPERATOR, value, start);
  }

  private readPunctuation(start: SourcePosition): Token {
    const char = this.currentChar();
    this.advance();

    let type: TokenType;
    switch (char) {
      case ',':
        type = TokenType.COMMA;
        break;
      case '.':
        type = TokenType.DOT;
        break;
      case ';':
        type = TokenType.SEMICOLON;
        break;
      case '(':
        type = TokenType.LPAREN;
        break;
      case ')':
        type = TokenType.RPAREN;
        break;
      case '[':
        type = TokenType.LBRACKET;
        break;
      case ']':
        type = TokenType.RBRACKET;
        break;
      default:
        type = TokenType.UNKNOWN;
    }

    return this.createToken(type, char, start);
  }

  private readSingleLineComment(start: SourcePosition): Token {
    let value = '';
    while (this.position < this.input.length && this.currentChar() !== '\n') {
      value += this.currentChar();
      this.advance();
    }
    return this.createToken(TokenType.COMMENT, value, start);
  }

  private readMultiLineComment(start: SourcePosition): Token {
    let value = '';
    this.advance(); // Skip /
    this.advance(); // Skip *

    while (this.position < this.input.length) {
      if (this.currentChar() === '*' && this.peek() === '/') {
        this.advance(); // Skip *
        this.advance(); // Skip /
        break;
      }
      value += this.currentChar();
      this.advance();
    }

    return this.createToken(TokenType.COMMENT, value, start);
  }

  private skipWhitespace(): void {
    while (this.position < this.input.length && this.isWhitespace(this.currentChar())) {
      this.advance();
    }
  }

  private isWhitespace(char: string): boolean {
    return char === ' ' || char === '\t' || char === '\n' || char === '\r';
  }

  private isDigit(char: string): boolean {
    return char >= '0' && char <= '9';
  }

  private isIdentifierStart(char: string): boolean {
    return (char >= 'a' && char <= 'z') || (char >= 'A' && char <= 'Z') || char === '_';
  }

  private isIdentifierPart(char: string): boolean {
    return this.isIdentifierStart(char) || this.isDigit(char);
  }

  private isOperatorStart(char: string): boolean {
    return '+-*/%=!<>|&'.includes(char);
  }

  private currentChar(): string {
    return this.input[this.position] || '';
  }

  private peek(offset: number = 1): string {
    return this.input[this.position + offset] || '';
  }

  private advance(): void {
    if (this.position < this.input.length) {
      if (this.input[this.position] === '\n') {
        this.line++;
        this.column = 0;
      } else {
        this.column++;
      }
      this.position++;
    }
  }

  private getPosition(): SourcePosition {
    return {
      line: this.line,
      column: this.column,
      offset: this.position,
    };
  }

  private createToken(
    type: TokenType,
    value: string,
    start: SourcePosition,
    normalized?: string
  ): Token {
    const end = this.getPosition();
    const range: SourceRange = { start, end };
    
    const token: Token = {
      type,
      value,
      range,
    };

    if (normalized) {
      token.normalized = normalized;
      if (type === TokenType.KEYWORD) {
        token.keyword = normalized;
      }
    }

    return token;
  }
}
