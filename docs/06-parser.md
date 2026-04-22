# 第6章：Parser 实现

> 📚 本章将详细讲解语法分析器 (Parser) 的完整实现，使用递归下降方法构建抽象语法树 (AST)。

## 6.1 Parser 的职责

Parser 负责将 Token 数组转换为抽象语法树 (AST)：

```
输入: [SELECT, *, FROM, users, WHERE, age, >, 18, EOF]

输出:
SelectStatement {
  selectClause: {
    columns: [AllColumnsReference]
  },
  fromClause: {
    tables: [{ tableName: 'users' }]
  },
  whereClause: {
    condition: BinaryExpression {
      left: ColumnReference { columnName: 'age' },
      operator: '>',
      right: Literal { value: 18 }
    }
  }
}
```

## 6.2 递归下降解析

### 什么是递归下降解析？

递归下降是一种**自顶向下**的解析方法：

1. 从最顶层的语法规则开始
2. 每个语法规则对应一个解析函数
3. 函数之间互相调用，形成递归

```
SELECT 语句的语法规则（简化版）：

SelectStatement
  → SELECT SelectClause FROM FromClause [WHERE WhereClause] [ORDER BY ...] ...

SelectClause
  → Column (',' Column)*
  | '*'

FromClause
  → TableRef [JoinClause]*

WhereClause
  → Expression
```

### 对应的解析函数

```typescript
class Parser {
  // 顶层规则
  parseSelect(): SelectStatement {
    // 调用子规则
    const selectClause = this.parseSelectClause();
    const fromClause = this.parseFromClause();
    const whereClause = this.parseWhereClause();
    // ...
  }

  parseSelectClause(): SelectClause { ... }
  parseFromClause(): FromClause { ... }
  parseWhereClause(): WhereClause { ... }
}
```

## 6.3 Parser 基础结构

```typescript
// src/parser/Parser.ts

import { Token, TokenType, SelectStatement, Statement } from '@/types';

export class Parser {
  private tokens: Token[];
  private position: number;

  constructor(tokens: Token[]) {
    // 过滤掉注释和空白
    this.tokens = tokens.filter(
      t => t.type !== TokenType.COMMENT && t.type !== TokenType.WHITESPACE
    );
    this.position = 0;
  }

  /**
   * 主解析方法
   */
  parse(): Statement | null {
    if (this.tokens.length === 0) return null;
    
    const firstToken = this.current();
    if (!firstToken || firstToken.type !== TokenType.KEYWORD) return null;

    // 根据第一个关键字决定语句类型
    switch (firstToken.keyword) {
      case 'SELECT':
        return this.parseSelect();
      case 'INSERT':
        return this.parseInsert();
      case 'UPDATE':
        return this.parseUpdate();
      case 'DELETE':
        return this.parseDelete();
      default:
        return null;
    }
  }
```

### 辅助方法

```typescript
  /**
   * 获取当前 Token
   */
  private current(): Token {
    return this.tokens[this.position] || this.tokens[this.tokens.length - 1];
  }

  /**
   * 获取上一个 Token
   */
  private previous(): Token {
    return this.tokens[Math.max(0, this.position - 1)];
  }

  /**
   * 查看下一个 Token
   */
  private peek(): Token | undefined {
    return this.tokens[this.position + 1];
  }

  /**
   * 消费当前 Token，前进到下一个
   */
  private consume(): void {
    if (this.position < this.tokens.length) {
      this.position++;
    }
  }

  /**
   * 检查是否到达末尾
   */
  private isEOF(): boolean {
    return this.position >= this.tokens.length || 
           this.current()?.type === TokenType.EOF;
  }

  /**
   * 检查当前 Token 是否是指定的关键字
   */
  private isKeyword(keyword: string): boolean {
    return this.current()?.keyword === keyword;
  }
```

## 6.4 解析 SELECT 语句

### 主方法

```typescript
  private parseSelect(): SelectStatement | null {
    const start = this.current().range.start;
    this.consume(); // 消费 SELECT

    // 检查 DISTINCT
    const distinct = this.isKeyword('DISTINCT');
    if (distinct) this.consume();

    // 解析 SELECT 子句（列列表）
    const selectClause = this.parseSelectClause(start);

    // 解析 FROM 子句
    let fromClause = undefined;
    if (this.isKeyword('FROM')) {
      fromClause = this.parseFromClause();
    }

    // 解析 WHERE 子句
    let whereClause = undefined;
    if (this.isKeyword('WHERE')) {
      whereClause = this.parseWhereClause();
    }

    // 解析 GROUP BY 子句
    let groupByClause = undefined;
    if (this.isKeyword('GROUP')) {
      groupByClause = this.parseGroupByClause();
    }

    // 解析 HAVING 子句
    let havingClause = undefined;
    if (this.isKeyword('HAVING')) {
      havingClause = this.parseHavingClause();
    }

    // 解析 ORDER BY 子句
    let orderByClause = undefined;
    if (this.isKeyword('ORDER')) {
      orderByClause = this.parseOrderByClause();
    }

    // 解析 LIMIT 子句
    let limitClause = undefined;
    if (this.isKeyword('LIMIT')) {
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
```

### 解析 SELECT 子句

```typescript
  private parseSelectClause(start: SourcePosition): SelectClause {
    const columns: any[] = [];

    // 循环读取列，直到遇到 FROM 或 EOF
    while (this.current() && !this.isKeyword('FROM') && !this.isEOF()) {
      
      // 处理 *
      if (this.current().value === '*') {
        columns.push({
          type: 'AllColumnsReference',
          range: this.current().range,
        });
        this.consume();
      }
      // 处理标识符（列名）
      else if (this.current().type === TokenType.IDENTIFIER) {
        const columnStart = this.current().range.start;
        let tableName = undefined;
        let columnName = this.current().value;
        this.consume();

        // 检查是否是 table.column 格式
        if (this.current()?.type === TokenType.DOT) {
          this.consume(); // 消费 .
          tableName = columnName;
          columnName = this.current()?.value || '';
          this.consume();
        }

        // 检查别名 (AS alias 或直接 alias)
        let alias = undefined;
        if (this.isKeyword('AS')) {
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
      }
      // 处理逗号
      else if (this.current().type === TokenType.COMMA) {
        this.consume();
      }
      // 其他情况（如函数调用）
      else {
        this.consume();
      }
    }

    return {
      type: 'SelectClause',
      columns,
      distinct: false,
      range: { start, end: this.previous().range.end },
    };
  }
```

### 解析 FROM 子句

```typescript
  private parseFromClause(): FromClause {
    const start = this.current().range.start;
    this.consume(); // 消费 FROM
    
    const tables: TableReference[] = [];
    const joins: JoinClause[] = [];
    
    // 解析表列表
    while (this.current() && !this.isClauseKeyword() && !this.isEOF()) {
      
      if (this.current().type === TokenType.IDENTIFIER) {
        const tableName = this.current().value;
        this.consume();
        
        // 解析表别名
        let alias = undefined;
        if (this.isKeyword('AS')) {
          this.consume();
          alias = this.current()?.value;
          this.consume();
        } else if (this.current()?.type === TokenType.IDENTIFIER && 
                   !this.isClauseKeyword() && !this.isJoinKeyword()) {
          alias = this.current().value;
          this.consume();
        }

        tables.push({
          type: 'TableReference',
          tableName,
          alias,
        });
      }

      // 检查是否有 JOIN
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
      type: 'FromClause',
      tables,
      joins: joins.length > 0 ? joins : undefined,
      range: { start, end: this.previous().range.end },
    };
  }
```

### 解析 JOIN 子句

```typescript
  private parseJoinClause(): JoinClause {
    const start = this.current().range.start;
    let joinType: 'INNER' | 'LEFT' | 'RIGHT' | 'CROSS' | 'FULL' = 'INNER';

    // 解析 JOIN 类型
    if (this.isKeyword('LEFT')) {
      joinType = 'LEFT';
      this.consume();
    } else if (this.isKeyword('RIGHT')) {
      joinType = 'RIGHT';
      this.consume();
    } else if (this.isKeyword('CROSS')) {
      joinType = 'CROSS';
      this.consume();
    } else if (this.isKeyword('INNER')) {
      joinType = 'INNER';
      this.consume();
    }

    // 消费 JOIN 关键字
    if (this.isKeyword('JOIN')) {
      this.consume();
    }

    // 解析表名
    const tableName = this.current()?.value;
    this.consume();

    // 解析别名
    let alias = undefined;
    if (this.isKeyword('AS')) {
      this.consume();
      alias = this.current()?.value;
      this.consume();
    } else if (this.current()?.type === TokenType.IDENTIFIER && 
               !this.isClauseKeyword()) {
      alias = this.current().value;
      this.consume();
    }

    const table = {
      type: 'TableReference',
      tableName,
      alias,
    };

    // 解析 ON 条件
    let condition = undefined;
    if (this.isKeyword('ON')) {
      this.consume();
      condition = { type: 'BinaryExpression' }; // 简化处理
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
```

### 解析其他子句

```typescript
  private parseWhereClause(): WhereClause {
    const start = this.current().range.start;
    this.consume(); // 消费 WHERE
    
    return {
      type: 'WhereClause',
      condition: { type: 'BinaryExpression' },
      range: { start, end: this.previous().range.end },
      incomplete: this.isEOF(),
    };
  }

  private parseGroupByClause(): GroupByClause {
    const start = this.current().range.start;
    this.consume(); // GROUP
    if (this.isKeyword('BY')) {
      this.consume();
    }

    const columns: ColumnReference[] = [];
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

  private parseOrderByClause(): OrderByClause {
    const start = this.current().range.start;
    this.consume(); // ORDER
    if (this.isKeyword('BY')) {
      this.consume();
    }

    const items: OrderByItem[] = [];
    while (this.current() && !this.isClauseKeyword() && !this.isEOF()) {
      if (this.current().type === TokenType.IDENTIFIER) {
        const column = {
          type: 'ColumnReference',
          columnName: this.current().value,
        };
        this.consume();

        // 检查排序方向
        let direction: 'ASC' | 'DESC' | undefined = undefined;
        if (this.isKeyword('ASC') || this.isKeyword('DESC')) {
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

  private parseLimitClause(): LimitClause {
    const start = this.current().range.start;
    this.consume(); // LIMIT

    let limit = 0;
    if (this.current()?.type === TokenType.NUMBER_LITERAL) {
      limit = parseInt(this.current().value);
      this.consume();
    }

    let offset = undefined;
    if (this.isKeyword('OFFSET')) {
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
```

### 辅助判断方法

```typescript
  /**
   * 检查是否是子句关键字
   */
  private isClauseKeyword(): boolean {
    const keyword = this.current()?.keyword;
    return ['WHERE', 'GROUP', 'HAVING', 'ORDER', 'LIMIT', 
            'UNION', 'EXCEPT', 'INTERSECT'].includes(keyword || '');
  }

  /**
   * 检查是否是 JOIN 关键字
   */
  private isJoinKeyword(): boolean {
    const keyword = this.current()?.keyword;
    return ['JOIN', 'INNER', 'LEFT', 'RIGHT', 'CROSS', 'FULL']
           .includes(keyword || '');
  }
```

## 6.5 处理残缺输入

自动补全场景的关键是处理残缺输入：

```typescript
  private parseSelect(): SelectStatement | null {
    // ... 解析逻辑 ...

    return {
      // ... 其他字段 ...
      
      // 标记语句是否完整
      incomplete: this.isEOF() && !this.current()?.value,
    };
  }
```

### 示例

```sql
-- 残缺输入 1: 等待输入表名
SELECT * FROM

-- 解析结果:
{
  type: 'SelectStatement',
  selectClause: { columns: [*] },
  fromClause: { tables: [], incomplete: true },
  incomplete: true
}

-- 残缺输入 2: 等待输入 WHERE 条件
SELECT * FROM users WHERE

-- 解析结果:
{
  type: 'SelectStatement',
  selectClause: { columns: [*] },
  fromClause: { tables: ['users'] },
  whereClause: { condition: null, incomplete: true },
  incomplete: true
}
```

## 6.6 位置查找

为自动补全提供根据光标位置查找 Token 的功能：

```typescript
  /**
   * 根据字符偏移量找到对应的 Token
   */
  findTokenAtPosition(offset: number): Token | null {
    for (const token of this.tokens) {
      if (offset >= token.range.start.offset && 
          offset <= token.range.end.offset) {
        return token;
      }
    }
    // 如果光标在最后，返回最后一个 Token
    return this.tokens[this.tokens.length - 1] || null;
  }
}
```

## 6.7 单元测试

```typescript
import { describe, it, expect } from 'vitest';
import { Parser } from '../parser';
import { Tokenizer } from '../tokenizer';

describe('Parser', () => {
  // 辅助函数：分词 + 解析
  const parse = (sql: string) => {
    const tokenizer = new Tokenizer(sql);
    const tokens = tokenizer.tokenize();
    const parser = new Parser(tokens);
    return parser.parse();
  };

  it('should parse simple SELECT', () => {
    const ast = parse('SELECT id FROM users');
    
    expect(ast).not.toBeNull();
    expect(ast?.type).toBe('SelectStatement');
    expect(ast?.selectClause).toBeDefined();
    expect(ast?.fromClause).toBeDefined();
  });

  it('should parse SELECT with WHERE', () => {
    const ast = parse('SELECT * FROM users WHERE age > 18');
    
    expect(ast?.whereClause).toBeDefined();
  });

  it('should parse SELECT with JOIN', () => {
    const ast = parse(
      'SELECT * FROM users u JOIN orders o ON u.id = o.user_id'
    );
    
    expect(ast?.fromClause?.joins).toBeDefined();
    expect(ast?.fromClause?.joins?.length).toBeGreaterThan(0);
  });

  it('should parse table aliases', () => {
    const ast = parse('SELECT u.id FROM users u');
    
    const tables = ast?.fromClause?.tables;
    expect(tables?.[0].alias).toBe('u');
  });

  it('should handle incomplete SELECT', () => {
    const ast = parse('SELECT * FROM');
    
    expect(ast).not.toBeNull();
    expect(ast?.incomplete).toBe(true);
  });
});
```

## 6.8 解析流程图

```
┌─────────────────────────────────────────────────────────────────┐
│                      Parser 解析流程                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  parse()                                                        │
│    │                                                            │
│    ├── 检查第一个 Token                                          │
│    │     ├── SELECT → parseSelect()                             │
│    │     ├── INSERT → parseInsert()                             │
│    │     └── ...                                                │
│    │                                                            │
│  parseSelect()                                                  │
│    │                                                            │
│    ├── 消费 SELECT                                              │
│    │                                                            │
│    ├── parseSelectClause()                                      │
│    │     └── 循环解析列，直到遇到 FROM                            │
│    │                                                            │
│    ├── 如果是 FROM → parseFromClause()                           │
│    │     ├── 解析表名和别名                                      │
│    │     └── 如果是 JOIN → parseJoinClause()                     │
│    │                                                            │
│    ├── 如果是 WHERE → parseWhereClause()                         │
│    │                                                            │
│    ├── 如果是 GROUP → parseGroupByClause()                       │
│    │                                                            │
│    ├── 如果是 ORDER → parseOrderByClause()                       │
│    │                                                            │
│    └── 如果是 LIMIT → parseLimitClause()                         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 6.9 本章小结

在本章中，我们学习了：

- ✅ 递归下降解析的原理
- ✅ Parser 的基础结构
- ✅ SELECT 语句各子句的解析
- ✅ JOIN 语句的解析
- ✅ 残缺输入的处理
- ✅ 位置查找功能

## 6.10 练习题

1. **实现练习**：完善表达式解析，支持 `a > b AND c < d`

2. **扩展练习**：添加对子查询的支持：
   ```sql
   SELECT * FROM (SELECT id FROM users) AS sub
   ```

3. **调试练习**：手动跟踪以下 SQL 的解析过程：
   ```sql
   SELECT u.name, o.total 
   FROM users u 
   LEFT JOIN orders o ON u.id = o.user_id 
   WHERE o.total > 100
   ```

## 6.11 下一章预告

在下一章 [第7章：上下文分析器](./07-context-analyzer.md) 中，我们将学习：

- 如何根据光标位置判断上下文
- 如何提取可用的表和列
- 上下文类型的分类

---

[← 上一章：Tokenizer 实现](./05-tokenizer.md) | [📖 返回目录](./README.md) | [下一章：上下文分析器 →](./07-context-analyzer.md)
