# 第5章：Tokenizer 实现

> 📚 本章将详细讲解词法分析器 (Tokenizer) 的完整实现，这是解析器的第一个核心组件。

## 5.1 Tokenizer 的职责

Tokenizer（也称 Lexer）负责将 SQL 文本字符串转换为 Token 数组：

```
输入: "SELECT * FROM users WHERE age > 18"

输出: [
  { type: KEYWORD,        value: 'SELECT' },
  { type: OPERATOR,       value: '*' },
  { type: KEYWORD,        value: 'FROM' },
  { type: IDENTIFIER,     value: 'users' },
  { type: KEYWORD,        value: 'WHERE' },
  { type: IDENTIFIER,     value: 'age' },
  { type: OPERATOR,       value: '>' },
  { type: NUMBER_LITERAL, value: '18' },
  { type: EOF,            value: '' }
]
```

## 5.2 Token 类型定义

首先，我们需要定义 Token 的类型：

```typescript
// src/types/token.ts

/**
 * Token 类型枚举
 */
export enum TokenType {
  // 关键字
  KEYWORD = 'KEYWORD',

  // 标识符和字面量
  IDENTIFIER = 'IDENTIFIER',
  STRING_LITERAL = 'STRING_LITERAL',
  NUMBER_LITERAL = 'NUMBER_LITERAL',

  // 运算符
  OPERATOR = 'OPERATOR',
  COMPARISON = 'COMPARISON',
  LOGICAL = 'LOGICAL',

  // 标点符号
  COMMA = 'COMMA',           // ,
  DOT = 'DOT',               // .
  SEMICOLON = 'SEMICOLON',   // ;
  LPAREN = 'LPAREN',         // (
  RPAREN = 'RPAREN',         // )
  LBRACKET = 'LBRACKET',     // [
  RBRACKET = 'RBRACKET',     // ]

  // 注释
  COMMENT = 'COMMENT',

  // 特殊
  WHITESPACE = 'WHITESPACE',
  EOF = 'EOF',
  UNKNOWN = 'UNKNOWN',
}
```

### 位置信息

每个 Token 都需要记录其在源代码中的位置：

```typescript
/**
 * 源代码位置
 */
export interface SourcePosition {
  line: number;    // 行号 (从 0 开始)
  column: number;  // 列号 (从 0 开始)
  offset: number;  // 字符偏移量
}

/**
 * 源代码范围
 */
export interface SourceRange {
  start: SourcePosition;
  end: SourcePosition;
}

/**
 * Token 接口
 */
export interface Token {
  type: TokenType;
  value: string;
  range: SourceRange;
  normalized?: string;  // 规范化值 (如大写的关键字)
  keyword?: string;     // 如果是关键字，存储关键字名称
}
```

## 5.3 SQL 关键字列表

定义 SQL 支持的关键字：

```typescript
/**
 * SQL 关键字集合
 */
export const SQL_KEYWORDS = new Set([
  // DML
  'SELECT', 'FROM', 'WHERE', 'INSERT', 'INTO', 'VALUES',
  'UPDATE', 'SET', 'DELETE',
  
  // 子句
  'JOIN', 'INNER', 'LEFT', 'RIGHT', 'OUTER', 'CROSS',
  'ON', 'USING', 'GROUP', 'BY', 'HAVING', 'ORDER',
  'ASC', 'DESC', 'LIMIT', 'OFFSET',
  
  // 逻辑
  'AND', 'OR', 'NOT', 'IN', 'EXISTS', 'BETWEEN',
  'LIKE', 'IS', 'NULL',
  
  // 聚合
  'DISTINCT', 'ALL', 'AS', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END',
  
  // DDL
  'CREATE', 'ALTER', 'DROP', 'TABLE', 'INDEX', 'VIEW',
  'DATABASE', 'SCHEMA',
  
  // 其他
  'WITH', 'UNION', 'EXCEPT', 'INTERSECT',
]);
```

## 5.4 Tokenizer 实现

现在让我们实现完整的 Tokenizer 类：

```typescript
// src/tokenizer/Tokenizer.ts

import {
  Token,
  TokenType,
  SourcePosition,
  SourceRange,
  SQL_KEYWORDS,
} from '@/types';

/**
 * SQL Tokenizer - 将 SQL 字符串转换为 Token 数组
 */
export class Tokenizer {
  private input: string;      // 输入字符串
  private position: number;   // 当前位置
  private line: number;       // 当前行号
  private column: number;     // 当前列号
  private tokens: Token[];    // 生成的 Token 数组

  constructor(input: string) {
    this.input = input;
    this.position = 0;
    this.line = 0;
    this.column = 0;
    this.tokens = [];
  }

  /**
   * 主方法：执行分词
   */
  tokenize(): Token[] {
    this.tokens = [];
    this.position = 0;
    this.line = 0;
    this.column = 0;

    while (this.position < this.input.length) {
      // 跳过空白字符
      this.skipWhitespace();
      
      if (this.position >= this.input.length) break;

      // 读取下一个 Token
      const token = this.nextToken();
      if (token) {
        this.tokens.push(token);
      }
    }

    // 添加 EOF Token
    this.tokens.push(this.createToken(TokenType.EOF, '', this.getPosition()));

    return this.tokens;
  }
```

### 核心：nextToken 方法

这是 Tokenizer 的核心方法，根据当前字符决定要读取什么类型的 Token：

```typescript
  /**
   * 读取下一个 Token
   */
  private nextToken(): Token | null {
    const char = this.currentChar();
    const start = this.getPosition();

    // 1. 注释
    if (char === '-' && this.peek() === '-') {
      return this.readSingleLineComment(start);
    }
    if (char === '/' && this.peek() === '*') {
      return this.readMultiLineComment(start);
    }

    // 2. 字符串字面量
    if (char === "'" || char === '"' || char === '`') {
      return this.readStringLiteral(char, start);
    }

    // 3. 数字字面量
    if (this.isDigit(char)) {
      return this.readNumber(start);
    }

    // 4. 标识符或关键字
    if (this.isIdentifierStart(char)) {
      return this.readIdentifier(start);
    }

    // 5. 运算符
    if (this.isOperatorStart(char)) {
      return this.readOperator(start);
    }

    // 6. 标点符号
    return this.readPunctuation(start);
  }
```

### 读取标识符/关键字

```typescript
  /**
   * 读取标识符或关键字
   */
  private readIdentifier(start: SourcePosition): Token {
    let value = '';
    
    // 持续读取直到遇到非标识符字符
    while (this.position < this.input.length && 
           this.isIdentifierPart(this.currentChar())) {
      value += this.currentChar();
      this.advance();
    }

    // 检查是否是关键字（大小写不敏感）
    const normalized = value.toUpperCase();
    const isKeyword = SQL_KEYWORDS.has(normalized);

    return this.createToken(
      isKeyword ? TokenType.KEYWORD : TokenType.IDENTIFIER,
      value,
      start,
      isKeyword ? normalized : undefined
    );
  }

  /**
   * 判断是否是标识符开始字符
   */
  private isIdentifierStart(char: string): boolean {
    return (char >= 'a' && char <= 'z') || 
           (char >= 'A' && char <= 'Z') || 
           char === '_';
  }

  /**
   * 判断是否是标识符组成字符
   */
  private isIdentifierPart(char: string): boolean {
    return this.isIdentifierStart(char) || this.isDigit(char);
  }
```

### 读取数字

```typescript
  /**
   * 读取数字字面量
   * 支持: 整数、小数、科学计数法
   */
  private readNumber(start: SourcePosition): Token {
    let value = '';
    let hasDecimal = false;

    while (this.position < this.input.length) {
      const char = this.currentChar();
      
      // 数字
      if (this.isDigit(char)) {
        value += char;
        this.advance();
      }
      // 小数点
      else if (char === '.' && !hasDecimal) {
        hasDecimal = true;
        value += char;
        this.advance();
      }
      // 科学计数法 (e 或 E)
      else if ((char === 'e' || char === 'E') && 
               !value.endsWith('e') && !value.endsWith('E')) {
        value += char;
        this.advance();
        // 可能有 + 或 - 符号
        if (this.currentChar() === '+' || this.currentChar() === '-') {
          value += this.currentChar();
          this.advance();
        }
      }
      else {
        break;
      }
    }

    return this.createToken(TokenType.NUMBER_LITERAL, value, start);
  }

  private isDigit(char: string): boolean {
    return char >= '0' && char <= '9';
  }
```

### 读取字符串

```typescript
  /**
   * 读取字符串字面量
   * 支持: 单引号、双引号、反引号
   * 支持: 转义字符
   */
  private readStringLiteral(quote: string, start: SourcePosition): Token {
    let value = '';
    this.advance(); // 跳过开始引号

    while (this.position < this.input.length) {
      const char = this.currentChar();

      // 结束引号
      if (char === quote) {
        this.advance();
        break;
      }

      // 转义字符
      if (char === '\\' && this.position + 1 < this.input.length) {
        this.advance();
        const escaped = this.currentChar();
        switch (escaped) {
          case 'n':  value += '\n'; break;
          case 't':  value += '\t'; break;
          case 'r':  value += '\r'; break;
          case '\\': value += '\\'; break;
          case quote: value += quote; break;
          default:   value += escaped;
        }
        this.advance();
      } else {
        value += char;
        this.advance();
      }
    }

    return this.createToken(TokenType.STRING_LITERAL, value, start);
  }
```

### 读取运算符

```typescript
  /**
   * 读取运算符
   */
  private readOperator(start: SourcePosition): Token {
    let value = this.currentChar();
    this.advance();

    // 尝试匹配双字符运算符
    if (this.position < this.input.length) {
      const twoChar = value + this.currentChar();
      const twoCharOperators = new Set([
        '!=', '<>', '<=', '>=', '||', '&&'
      ]);
      
      if (twoCharOperators.has(twoChar)) {
        value = twoChar;
        this.advance();
      }
    }

    return this.createToken(TokenType.OPERATOR, value, start);
  }

  private isOperatorStart(char: string): boolean {
    return '+-*/%=!<>|&'.includes(char);
  }
```

### 读取标点符号

```typescript
  /**
   * 读取标点符号
   */
  private readPunctuation(start: SourcePosition): Token {
    const char = this.currentChar();
    this.advance();

    let type: TokenType;
    switch (char) {
      case ',': type = TokenType.COMMA; break;
      case '.': type = TokenType.DOT; break;
      case ';': type = TokenType.SEMICOLON; break;
      case '(': type = TokenType.LPAREN; break;
      case ')': type = TokenType.RPAREN; break;
      case '[': type = TokenType.LBRACKET; break;
      case ']': type = TokenType.RBRACKET; break;
      default:  type = TokenType.UNKNOWN;
    }

    return this.createToken(type, char, start);
  }
```

### 读取注释

```typescript
  /**
   * 读取单行注释 (-- ...)
   */
  private readSingleLineComment(start: SourcePosition): Token {
    let value = '';
    while (this.position < this.input.length && 
           this.currentChar() !== '\n') {
      value += this.currentChar();
      this.advance();
    }
    return this.createToken(TokenType.COMMENT, value, start);
  }

  /**
   * 读取多行注释 (/* ... */)
   */
  private readMultiLineComment(start: SourcePosition): Token {
    let value = '';
    this.advance(); // 跳过 /
    this.advance(); // 跳过 *

    while (this.position < this.input.length) {
      if (this.currentChar() === '*' && this.peek() === '/') {
        this.advance(); // 跳过 *
        this.advance(); // 跳过 /
        break;
      }
      value += this.currentChar();
      this.advance();
    }

    return this.createToken(TokenType.COMMENT, value, start);
  }
```

### 辅助方法

```typescript
  /**
   * 跳过空白字符
   */
  private skipWhitespace(): void {
    while (this.position < this.input.length && 
           this.isWhitespace(this.currentChar())) {
      this.advance();
    }
  }

  private isWhitespace(char: string): boolean {
    return char === ' ' || char === '\t' || 
           char === '\n' || char === '\r';
  }

  /**
   * 获取当前字符
   */
  private currentChar(): string {
    return this.input[this.position] || '';
  }

  /**
   * 查看下一个字符（不移动位置）
   */
  private peek(offset: number = 1): string {
    return this.input[this.position + offset] || '';
  }

  /**
   * 前进一个字符
   */
  private advance(): void {
    if (this.position < this.input.length) {
      // 处理换行
      if (this.input[this.position] === '\n') {
        this.line++;
        this.column = 0;
      } else {
        this.column++;
      }
      this.position++;
    }
  }

  /**
   * 获取当前位置
   */
  private getPosition(): SourcePosition {
    return {
      line: this.line,
      column: this.column,
      offset: this.position,
    };
  }

  /**
   * 创建 Token
   */
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
```

## 5.5 使用示例

```typescript
import { Tokenizer } from './tokenizer';

// 创建 Tokenizer
const tokenizer = new Tokenizer("SELECT id, name FROM users WHERE age > 18");

// 执行分词
const tokens = tokenizer.tokenize();

// 输出结果
tokens.forEach((token, index) => {
  console.log(`${index}: ${token.type} = "${token.value}"`);
});

// 输出:
// 0: KEYWORD = "SELECT"
// 1: IDENTIFIER = "id"
// 2: COMMA = ","
// 3: IDENTIFIER = "name"
// 4: KEYWORD = "FROM"
// 5: IDENTIFIER = "users"
// 6: KEYWORD = "WHERE"
// 7: IDENTIFIER = "age"
// 8: OPERATOR = ">"
// 9: NUMBER_LITERAL = "18"
// 10: EOF = ""
```

## 5.6 处理边界情况

### 残缺输入

Tokenizer 需要能够处理残缺的输入：

```typescript
// 残缺的字符串
const tokenizer1 = new Tokenizer("SELECT * FROM 'unclosed");
// → 仍能生成 Token，字符串值为 "unclosed"

// 残缺的注释
const tokenizer2 = new Tokenizer("SELECT /* unclosed comment");
// → 注释 Token 包含到末尾的所有内容
```

### 特殊字符

```typescript
// 处理反引号（MySQL 标识符）
const tokenizer = new Tokenizer("SELECT `user-name` FROM `my-table`");
// → 反引号内的内容作为字符串处理
```

## 5.7 单元测试

```typescript
import { describe, it, expect } from 'vitest';
import { Tokenizer } from '../tokenizer';
import { TokenType } from '../types';

describe('Tokenizer', () => {
  it('should tokenize simple SELECT', () => {
    const tokenizer = new Tokenizer('SELECT * FROM users');
    const tokens = tokenizer.tokenize();

    expect(tokens).toHaveLength(5); // SELECT, *, FROM, users, EOF
    expect(tokens[0].type).toBe(TokenType.KEYWORD);
    expect(tokens[0].keyword).toBe('SELECT');
  });

  it('should recognize keywords case-insensitively', () => {
    const tokenizer = new Tokenizer('select FROM where');
    const tokens = tokenizer.tokenize();

    expect(tokens[0].keyword).toBe('SELECT');
    expect(tokens[1].keyword).toBe('FROM');
    expect(tokens[2].keyword).toBe('WHERE');
  });

  it('should tokenize string literals', () => {
    const tokenizer = new Tokenizer("WHERE name = 'John'");
    const tokens = tokenizer.tokenize();

    const stringToken = tokens.find(t => t.type === TokenType.STRING_LITERAL);
    expect(stringToken?.value).toBe('John');
  });

  it('should track positions', () => {
    const tokenizer = new Tokenizer('SELECT *');
    const tokens = tokenizer.tokenize();

    expect(tokens[0].range.start.offset).toBe(0);
    expect(tokens[1].range.start.offset).toBe(7);
  });
});
```

## 5.8 性能考虑

1. **单次遍历** - 只遍历输入一次，O(n) 复杂度
2. **避免正则** - 使用简单的字符比较，性能更好
3. **预分配** - 可以预估 Token 数组大小

## 5.9 本章小结

在本章中，我们学习了：

- ✅ Tokenizer 的职责和设计
- ✅ Token 类型的定义
- ✅ 各种 Token 的读取方法
- ✅ 位置追踪
- ✅ 边界情况处理
- ✅ 单元测试

## 5.10 练习题

1. **实现练习**：添加对 SQL 注释 `#` 的支持（MySQL 语法）

2. **扩展练习**：支持十六进制数字字面量（如 `0x1F`）

3. **调试练习**：使用 Tokenizer 分析以下 SQL，手动验证结果：
   ```sql
   SELECT u.name, COUNT(*) FROM users u WHERE u.age >= 18
   ```

## 5.11 下一章预告

在下一章 [第6章：Parser 实现](./06-parser.md) 中，我们将学习：

- 如何将 Token 数组转换为 AST
- 递归下降解析的实现
- SELECT 语句的完整解析

---

[← 上一章：类型系统设计](./04-type-system.md) | [📖 返回目录](./README.md) | [下一章：Parser 实现 →](./06-parser.md)
