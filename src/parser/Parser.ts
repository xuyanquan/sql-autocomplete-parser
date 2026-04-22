import { Token, TokenType, SelectStatement, Statement, SourcePosition } from '@/types';

/**
 * Simple SQL Parser (MVP version - SELECT statements only)
 */
export class Parser {
  private tokens: Token[];
  private position: number;

  constructor(tokens: Token[]) {
    this.tokens = tokens.filter(t => t.type !== TokenType.COMMENT && t.type !== TokenType.WHITESPACE);
    this.position = 0;
  }

  parse(): Statement | null {
    if (this.tokens.length === 0) return null;
    
    const firstToken = this.current();
    if (!firstToken || firstToken.type !== TokenType.KEYWORD) return null;

    switch (firstToken.keyword) {
      case 'SELECT':
        return this.parseSelect();
      default:
        return null;
    }
  }

  private parseSelect(): SelectStatement | null {
    const start = this.current().range.start;
    this.consume(); // SELECT

    // Check for DISTINCT
    const distinct = this.current()?.keyword === 'DISTINCT';
    if (distinct) this.consume();

    // Parse columns
    const columns: any[] = [];
    while (this.current() && this.current().keyword !== 'FROM' && !this.isEOF()) {
      if (this.current().value === '*') {
        columns.push({
          type: 'AllColumnsReference',
          range: this.current().range,
        });
        this.consume();
      } else if (this.current().type === TokenType.IDENTIFIER) {
        const columnStart = this.current().range.start;
        let tableName = undefined;
        let columnName = this.current().value;
        this.consume();

        // Check for table.column reference
        if (this.current()?.type === TokenType.DOT) {
          this.consume(); // .
          tableName = columnName;
          columnName = this.current()?.value || '';
          this.consume();
        }

        // Check for alias
        let alias = undefined;
        if (this.current()?.keyword === 'AS') {
          this.consume();
          alias = this.current()?.value;
          this.consume();
        }

        columns.push({
          type: 'ColumnReference',
          columnName,
          tableName,
          alias,
          range: { start: columnStart, end: this.previous().range.end },
        });
      } else if (this.current().type === TokenType.COMMA) {
        this.consume();
      } else if (this.current().type === TokenType.LPAREN) {
        // Function call (simplified)
        this.consume(); // skip for now
      } else {
        this.consume();
      }
    }

    const selectClause = {
      type: 'SelectClause' as const,
      columns,
      distinct,
      range: { start, end: this.previous().range.end },
    };

    // Parse FROM clause
    let fromClause = undefined;
    if (this.current()?.keyword === 'FROM') {
      fromClause = this.parseFromClause();
    }

    // Parse WHERE clause
    let whereClause = undefined;
    if (this.current()?.keyword === 'WHERE') {
      whereClause = this.parseWhereClause();
    }

    // Parse GROUP BY clause
    let groupByClause = undefined;
    if (this.current()?.keyword === 'GROUP') {
      groupByClause = this.parseGroupByClause();
    }

    // Parse HAVING clause
    let havingClause = undefined;
    if (this.current()?.keyword === 'HAVING') {
      havingClause = this.parseHavingClause();
    }

    // Parse ORDER BY clause
    let orderByClause = undefined;
    if (this.current()?.keyword === 'ORDER') {
      orderByClause = this.parseOrderByClause();
    }

    // Parse LIMIT clause
    let limitClause = undefined;
    if (this.current()?.keyword === 'LIMIT') {
      limitClause = this.parseLimitClause();
    }

    return {
      type: 'SelectStatement',
      selectClause,
      fromClause,
      whereClause,
      groupByClause,
      havingClause,
      orderByClause,
      limitClause,
      range: { start, end: this.previous().range.end },
      incomplete: this.isEOF() && !this.current()?.value,
    };
  }

  private parseFromClause(): any {
    const start = this.current().range.start;
    this.consume(); // FROM
    const tables: any[] = [];
    const joins: any[] = [];
    
    // Parse first table
    while (this.current() && !this.isClauseKeyword() && !this.isEOF()) {
      if (this.current().type === TokenType.IDENTIFIER) {
        const tableName = this.current().value;
        this.consume();
        
        let alias = undefined;
        if (this.current()?.keyword === 'AS') {
          this.consume();
          alias = this.current()?.value;
          this.consume();
        } else if (this.current()?.type === TokenType.IDENTIFIER && !this.isClauseKeyword() && !this.isJoinKeyword()) {
          alias = this.current().value;
          this.consume();
        }

        tables.push({
          type: 'TableReference',
          tableName,
          alias,
        });
      }

      // Check for JOIN
      if (this.isJoinKeyword()) {
        const join = this.parseJoinClause();
        if (join) joins.push(join);
      } else if (this.current()?.type === TokenType.COMMA) {
        this.consume();
      } else {
        break;
      }
    }

    return {
      type: 'FromClause' as const,
      tables,
      joins: joins.length > 0 ? joins : undefined,
      range: { start, end: this.previous().range.end },
    };
  }

  private parseJoinClause(): any {
    const start = this.current().range.start;
    let joinType: 'INNER' | 'LEFT' | 'RIGHT' | 'CROSS' | 'FULL' = 'INNER';

    // Parse join type
    if (this.current()?.keyword === 'LEFT') {
      joinType = 'LEFT';
      this.consume();
    } else if (this.current()?.keyword === 'RIGHT') {
      joinType = 'RIGHT';
      this.consume();
    } else if (this.current()?.keyword === 'CROSS') {
      joinType = 'CROSS';
      this.consume();
    } else if (this.current()?.keyword === 'INNER') {
      joinType = 'INNER';
      this.consume();
    }

    // Consume JOIN keyword
    if (this.current()?.keyword === 'JOIN') {
      this.consume();
    }

    // Parse table
    const tableName = this.current()?.value;
    this.consume();

    let alias = undefined;
    if (this.current()?.keyword === 'AS') {
      this.consume();
      alias = this.current()?.value;
      this.consume();
    } else if (this.current()?.type === TokenType.IDENTIFIER && !this.isClauseKeyword()) {
      alias = this.current().value;
      this.consume();
    }

    const table = {
      type: 'TableReference',
      tableName,
      alias,
    };

    // Parse ON condition
    let condition = undefined;
    if (this.current()?.keyword === 'ON') {
      this.consume();
      condition = { type: 'BinaryExpression' as const }; // Simplified
    }

    return {
      type: 'JoinClause',
      joinType,
      table,
      condition,
      range: { start, end: this.previous().range.end },
      incomplete: !condition,
    };
  }

  private parseWhereClause(): any {
    const start = this.current().range.start;
    this.consume(); // WHERE
    
    return {
      type: 'WhereClause' as const,
      condition: { type: 'BinaryExpression' as const },
      range: { start, end: this.previous().range.end },
      incomplete: this.isEOF() || this.peek()?.type === TokenType.EOF,
    };
  }

  private parseGroupByClause(): any {
    const start = this.current().range.start;
    this.consume(); // GROUP
    if (this.current()?.keyword === 'BY') {
      this.consume();
    }

    const columns: any[] = [];
    while (this.current() && !this.isClauseKeyword() && !this.isEOF()) {
      if (this.current().type === TokenType.IDENTIFIER) {
        columns.push({
          type: 'ColumnReference',
          columnName: this.current().value,
        });
        this.consume();
      } else if (this.current().type === TokenType.COMMA) {
        this.consume();
      } else {
        break;
      }
    }

    return {
      type: 'GroupByClause',
      columns,
      range: { start, end: this.previous().range.end },
    };
  }

  private parseHavingClause(): any {
    const start = this.current().range.start;
    this.consume(); // HAVING

    return {
      type: 'HavingClause',
      condition: { type: 'BinaryExpression' as const },
      range: { start, end: this.previous().range.end },
    };
  }

  private parseOrderByClause(): any {
    const start = this.current().range.start;
    this.consume(); // ORDER
    if (this.current()?.keyword === 'BY') {
      this.consume();
    }

    const items: any[] = [];
    while (this.current() && !this.isClauseKeyword() && !this.isEOF()) {
      if (this.current().type === TokenType.IDENTIFIER) {
        const column = {
          type: 'ColumnReference',
          columnName: this.current().value,
        };
        this.consume();

        let direction: 'ASC' | 'DESC' | undefined = undefined;
        if (this.current()?.keyword === 'ASC' || this.current()?.keyword === 'DESC') {
          direction = this.current().keyword as 'ASC' | 'DESC';
          this.consume();
        }

        items.push({
          type: 'OrderByItem',
          column,
          direction,
        });
      } else if (this.current().type === TokenType.COMMA) {
        this.consume();
      } else {
        break;
      }
    }

    return {
      type: 'OrderByClause',
      items,
      range: { start, end: this.previous().range.end },
    };
  }

  private parseLimitClause(): any {
    const start = this.current().range.start;
    this.consume(); // LIMIT

    let limit = 0;
    if (this.current()?.type === TokenType.NUMBER_LITERAL) {
      limit = parseInt(this.current().value);
      this.consume();
    }

    let offset = undefined;
    if (this.current()?.keyword === 'OFFSET') {
      this.consume();
      if (this.current()?.type === TokenType.NUMBER_LITERAL) {
        offset = parseInt(this.current().value);
        this.consume();
      }
    }

    return {
      type: 'LimitClause',
      limit,
      offset,
      range: { start, end: this.previous().range.end },
    };
  }

  private isClauseKeyword(): boolean {
    const keyword = this.current()?.keyword;
    return ['WHERE', 'GROUP', 'HAVING', 'ORDER', 'LIMIT', 'UNION', 'EXCEPT', 'INTERSECT'].includes(keyword || '');
  }

  private isJoinKeyword(): boolean {
    const keyword = this.current()?.keyword;
    return ['JOIN', 'INNER', 'LEFT', 'RIGHT', 'CROSS', 'FULL'].includes(keyword || '');
  }

  private current(): Token {
    return this.tokens[this.position] || this.tokens[this.tokens.length - 1];
  }

  private previous(): Token {
    return this.tokens[Math.max(0, this.position - 1)];
  }

  private peek(): Token | undefined {
    return this.tokens[this.position + 1];
  }

  private consume(): void {
    if (this.position < this.tokens.length) {
      this.position++;
    }
  }

  private isEOF(): boolean {
    return this.position >= this.tokens.length || this.current()?.type === TokenType.EOF;
  }

  /**
   * Find the token at a specific cursor position
   */
  findTokenAtPosition(offset: number): Token | null {
    for (const token of this.tokens) {
      if (offset >= token.range.start.offset && offset <= token.range.end.offset) {
        return token;
      }
    }
    // Return last token if cursor is at the end
    return this.tokens[this.tokens.length - 1] || null;
  }
}
