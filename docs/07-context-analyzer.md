# 第7章：上下文分析器

> 🎯 **学习目标**：理解如何分析光标位置，确定当前的语法上下文，为智能补全奠定基础

---

## 7.1 什么是上下文分析

上下文分析是自动补全系统的核心环节，它回答一个关键问题：

> **用户现在在输入什么？**

```
┌─────────────────────────────────────────────────────────────┐
│                     上下文分析的目标                         │
├─────────────────────────────────────────────────────────────┤
│  输入: SQL 字符串 + 光标位置                                 │
│  输出: 用户当前正在输入的是什么（表名？列名？关键字？）        │
│                                                             │
│  SELECT * FROM users WHERE |                                │
│                            ↑                                │
│                     光标在这里                               │
│                            │                                │
│                            ▼                                │
│  分析结果: 用户正在输入 WHERE 条件                           │
│           → 应该提示: 列名、函数、子查询                     │
└─────────────────────────────────────────────────────────────┘
```

## 7.2 上下文类型定义

### 7.2.1 所有可能的上下文位置

```typescript
// src/context/types.ts

/**
 * SQL 上下文位置枚举
 */
export enum ContextLocation {
  // 语句开始
  STATEMENT_START = 'statement_start',    // 还没输入任何内容
  
  // SELECT 相关
  SELECT_CLAUSE = 'select_clause',        // SELECT 后面
  SELECT_COLUMN = 'select_column',        // 正在输入列名
  SELECT_ALIAS = 'select_alias',          // AS 后面
  
  // FROM 相关  
  FROM_CLAUSE = 'from_clause',            // FROM 后面
  TABLE_NAME = 'table_name',              // 正在输入表名
  TABLE_ALIAS = 'table_alias',            // 表别名位置
  
  // JOIN 相关
  JOIN_TYPE = 'join_type',                // 输入 JOIN 类型
  JOIN_TABLE = 'join_table',              // JOIN 后的表名
  JOIN_CONDITION = 'join_condition',      // ON 后面
  
  // WHERE 相关
  WHERE_CLAUSE = 'where_clause',          // WHERE 后面
  WHERE_COLUMN = 'where_column',          // WHERE 中的列
  WHERE_OPERATOR = 'where_operator',      // 等待运算符
  WHERE_VALUE = 'where_value',            // 等待值
  
  // 其他子句
  GROUP_BY = 'group_by',                  // GROUP BY 后面
  HAVING_CLAUSE = 'having_clause',        // HAVING 后面
  ORDER_BY = 'order_by',                  // ORDER BY 后面
  ORDER_DIRECTION = 'order_direction',    // ASC/DESC 位置
  LIMIT_VALUE = 'limit_value',            // LIMIT 后面
  
  // 表达式内部
  FUNCTION_NAME = 'function_name',        // 函数名位置
  FUNCTION_ARGS = 'function_args',        // 函数参数内
  SUBQUERY = 'subquery',                  // 子查询内部
  
  // 特殊
  DOT_ACCESS = 'dot_access',              // table. 后面
  UNKNOWN = 'unknown',                    // 无法确定
}
```

### 7.2.2 完整的上下文信息

```typescript
/**
 * 解析上下文 - 包含分析结果
 */
export interface ParseContext {
  /** 当前位置类型 */
  location: ContextLocation;
  
  /** 语句类型 */
  statementType: 'select' | 'insert' | 'update' | 'delete' | 'unknown';
  
  /** 当前输入前缀（用于过滤补全项） */
  prefix: string;
  
  /** 当前 Token */
  currentToken: Token | null;
  
  /** 前一个 Token */
  previousToken: Token | null;
  
  /** AST（可能不完整） */
  ast: SelectStatement | null;
  
  /** 可用的表（名称 -> 定义） */
  availableTables: Map<string, TableInfo>;
  
  /** 当前作用域的列 */
  availableColumns: ColumnInfo[];
  
  /** 已定义的别名 */
  aliases: Map<string, string>;
  
  /** 光标位置 */
  cursorPosition: number;
  
  /** 嵌套深度（子查询） */
  nestingLevel: number;
}

interface TableInfo {
  name: string;
  alias?: string;
  columns: ColumnInfo[];
}

interface ColumnInfo {
  name: string;
  table: string;
  dataType: string;
}
```

## 7.3 上下文分析器实现

### 7.3.1 核心分析器类

```typescript
// src/context/ContextAnalyzer.ts

import { Token, TokenType } from '../types/token';
import { SelectStatement } from '../types/ast';
import { ParseContext, ContextLocation } from './types';
import { Tokenizer } from '../tokenizer/Tokenizer';
import { Parser } from '../parser/Parser';
import { SchemaManager } from '../schema/SchemaManager';

export class ContextAnalyzer {
  private tokenizer: Tokenizer;
  private parser: Parser;
  private schemaManager: SchemaManager;
  
  constructor(schemaManager: SchemaManager) {
    this.tokenizer = new Tokenizer();
    this.parser = new Parser();
    this.schemaManager = schemaManager;
  }
  
  /**
   * 分析 SQL 字符串在指定光标位置的上下文
   */
  analyze(sql: string, cursorPosition: number): ParseContext {
    // 1. 分词
    const tokens = this.tokenizer.tokenize(sql);
    
    // 2. 找到光标所在的 Token
    const { currentToken, previousToken, prefix } = 
      this.findCursorToken(tokens, cursorPosition);
    
    // 3. 解析 AST（容错模式）
    const ast = this.parser.parse(sql);
    
    // 4. 确定上下文位置
    const location = this.determineLocation(
      tokens, 
      currentToken, 
      previousToken, 
      cursorPosition
    );
    
    // 5. 收集可用的表和列
    const { availableTables, availableColumns, aliases } = 
      this.collectAvailableSymbols(ast);
    
    // 6. 构建上下文
    return {
      location,
      statementType: this.detectStatementType(tokens),
      prefix,
      currentToken,
      previousToken,
      ast,
      availableTables,
      availableColumns,
      aliases,
      cursorPosition,
      nestingLevel: this.calculateNestingLevel(tokens, cursorPosition),
    };
  }
  
  /**
   * 找到光标所在的 Token
   */
  private findCursorToken(
    tokens: Token[], 
    cursorPosition: number
  ): { 
    currentToken: Token | null; 
    previousToken: Token | null; 
    prefix: string;
  } {
    let currentToken: Token | null = null;
    let previousToken: Token | null = null;
    let prefix = '';
    
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      
      // 光标在 Token 内部
      if (cursorPosition >= token.start && cursorPosition <= token.end) {
        currentToken = token;
        previousToken = i > 0 ? tokens[i - 1] : null;
        // 计算已输入的部分作为前缀
        prefix = token.value.substring(0, cursorPosition - token.start);
        break;
      }
      
      // 光标在 Token 之后（但在下一个 Token 之前）
      if (cursorPosition > token.end) {
        previousToken = token;
        
        // 检查下一个 Token
        if (i + 1 < tokens.length && cursorPosition < tokens[i + 1].start) {
          // 光标在两个 Token 之间的空白处
          currentToken = null;
          prefix = '';
          break;
        }
      }
    }
    
    return { currentToken, previousToken, prefix };
  }
  
  /**
   * 确定上下文位置类型
   */
  private determineLocation(
    tokens: Token[],
    currentToken: Token | null,
    previousToken: Token | null,
    cursorPosition: number
  ): ContextLocation {
    // 空输入
    if (tokens.length === 0 || 
        (tokens.length === 1 && tokens[0].type === TokenType.EOF)) {
      return ContextLocation.STATEMENT_START;
    }
    
    // 如果前一个是 DOT，说明在进行属性访问
    if (previousToken?.type === TokenType.DOT) {
      return ContextLocation.DOT_ACCESS;
    }
    
    // 根据前一个 Token 确定位置
    if (previousToken) {
      return this.locationFromPreviousToken(previousToken, tokens);
    }
    
    // 根据当前 Token 确定位置
    if (currentToken) {
      return this.locationFromCurrentToken(currentToken, tokens);
    }
    
    return ContextLocation.UNKNOWN;
  }
  
  /**
   * 根据前一个 Token 推断位置
   */
  private locationFromPreviousToken(
    prevToken: Token, 
    tokens: Token[]
  ): ContextLocation {
    switch (prevToken.type) {
      case TokenType.SELECT:
      case TokenType.DISTINCT:
        return ContextLocation.SELECT_CLAUSE;
        
      case TokenType.FROM:
        return ContextLocation.FROM_CLAUSE;
        
      case TokenType.JOIN:
      case TokenType.INNER:
      case TokenType.LEFT:
      case TokenType.RIGHT:
        return ContextLocation.JOIN_TABLE;
        
      case TokenType.ON:
        return ContextLocation.JOIN_CONDITION;
        
      case TokenType.WHERE:
      case TokenType.AND:
      case TokenType.OR:
        return ContextLocation.WHERE_CLAUSE;
        
      case TokenType.GROUP:
        // GROUP 后应该是 BY
        return ContextLocation.UNKNOWN;
        
      case TokenType.BY:
        // 需要判断是 GROUP BY 还是 ORDER BY
        return this.determineByContext(tokens, prevToken);
        
      case TokenType.ORDER:
        return ContextLocation.UNKNOWN; // 等待 BY
        
      case TokenType.HAVING:
        return ContextLocation.HAVING_CLAUSE;
        
      case TokenType.LIMIT:
        return ContextLocation.LIMIT_VALUE;
        
      case TokenType.AS:
        return this.determineAliasContext(tokens, prevToken);
        
      case TokenType.COMMA:
        return this.determineCommaContext(tokens, prevToken);
        
      case TokenType.LPAREN:
        return this.determineParenContext(tokens, prevToken);
        
      case TokenType.EQUALS:
      case TokenType.NOT_EQUALS:
      case TokenType.LESS_THAN:
      case TokenType.GREATER_THAN:
      case TokenType.LESS_EQUAL:
      case TokenType.GREATER_EQUAL:
      case TokenType.LIKE:
      case TokenType.IN:
        return ContextLocation.WHERE_VALUE;
        
      case TokenType.IDENTIFIER:
        return this.determineAfterIdentifier(tokens, prevToken);
        
      default:
        return ContextLocation.UNKNOWN;
    }
  }
  
  /**
   * 确定 BY 是 GROUP BY 还是 ORDER BY
   */
  private determineByContext(tokens: Token[], byToken: Token): ContextLocation {
    // 向前查找，看是 GROUP 还是 ORDER
    const byIndex = tokens.indexOf(byToken);
    if (byIndex > 0) {
      const beforeBy = tokens[byIndex - 1];
      if (beforeBy.type === TokenType.GROUP) {
        return ContextLocation.GROUP_BY;
      }
      if (beforeBy.type === TokenType.ORDER) {
        return ContextLocation.ORDER_BY;
      }
    }
    return ContextLocation.UNKNOWN;
  }
  
  /**
   * 确定 AS 后的上下文
   */
  private determineAliasContext(tokens: Token[], asToken: Token): ContextLocation {
    // AS 之前如果是列表达式 → SELECT 列别名
    // AS 之前如果是表名 → 表别名
    const asIndex = tokens.indexOf(asToken);
    
    // 向前查找最近的关键字
    for (let i = asIndex - 1; i >= 0; i--) {
      const t = tokens[i];
      if (t.type === TokenType.FROM || t.type === TokenType.JOIN) {
        return ContextLocation.TABLE_ALIAS;
      }
      if (t.type === TokenType.SELECT) {
        return ContextLocation.SELECT_ALIAS;
      }
    }
    
    return ContextLocation.SELECT_ALIAS;
  }
  
  /**
   * 确定逗号后的上下文
   */
  private determineCommaContext(tokens: Token[], commaToken: Token): ContextLocation {
    const commaIndex = tokens.indexOf(commaToken);
    
    // 向前查找最近的关键子句
    for (let i = commaIndex - 1; i >= 0; i--) {
      const t = tokens[i];
      
      // 跳过 FROM/JOIN 之后的内容
      if (t.type === TokenType.FROM) {
        return ContextLocation.TABLE_NAME;
      }
      if (t.type === TokenType.SELECT) {
        return ContextLocation.SELECT_CLAUSE;
      }
      if (t.type === TokenType.BY) {
        // GROUP BY 或 ORDER BY 的下一项
        if (i > 0 && tokens[i-1].type === TokenType.GROUP) {
          return ContextLocation.GROUP_BY;
        }
        if (i > 0 && tokens[i-1].type === TokenType.ORDER) {
          return ContextLocation.ORDER_BY;
        }
      }
    }
    
    return ContextLocation.UNKNOWN;
  }
  
  /**
   * 确定左括号后的上下文
   */
  private determineParenContext(tokens: Token[], parenToken: Token): ContextLocation {
    const parenIndex = tokens.indexOf(parenToken);
    
    // 如果括号前是标识符，可能是函数调用
    if (parenIndex > 0) {
      const beforeParen = tokens[parenIndex - 1];
      if (beforeParen.type === TokenType.IDENTIFIER) {
        return ContextLocation.FUNCTION_ARGS;
      }
      // 可能是子查询
      if (beforeParen.type === TokenType.IN || 
          beforeParen.type === TokenType.EXISTS) {
        return ContextLocation.SUBQUERY;
      }
    }
    
    // 独立括号，可能是子查询或表达式分组
    return ContextLocation.SUBQUERY;
  }
  
  /**
   * 标识符之后的上下文
   */
  private determineAfterIdentifier(tokens: Token[], identToken: Token): ContextLocation {
    const identIndex = tokens.indexOf(identToken);
    
    // 查找这个标识符之前的关键字
    for (let i = identIndex - 1; i >= 0; i--) {
      const t = tokens[i];
      
      if (t.type === TokenType.FROM || t.type === TokenType.JOIN) {
        // 表名之后，可能是别名或 JOIN
        return ContextLocation.TABLE_ALIAS;
      }
      if (t.type === TokenType.SELECT) {
        // SELECT 列之后，可能是 AS 或逗号
        return ContextLocation.SELECT_COLUMN;
      }
      if (t.type === TokenType.WHERE || 
          t.type === TokenType.AND || 
          t.type === TokenType.OR ||
          t.type === TokenType.ON) {
        // 条件中的标识符之后，等待运算符
        return ContextLocation.WHERE_OPERATOR;
      }
    }
    
    return ContextLocation.UNKNOWN;
  }
  
  /**
   * 收集当前可用的符号（表、列、别名）
   */
  private collectAvailableSymbols(ast: SelectStatement | null): {
    availableTables: Map<string, TableInfo>;
    availableColumns: ColumnInfo[];
    aliases: Map<string, string>;
  } {
    const availableTables = new Map<string, TableInfo>();
    const availableColumns: ColumnInfo[] = [];
    const aliases = new Map<string, string>();
    
    if (!ast) {
      return { availableTables, availableColumns, aliases };
    }
    
    // 从 FROM 子句收集
    if (ast.from) {
      const tableName = ast.from.name;
      if (tableName) {
        const tableInfo = this.schemaManager.getTable(tableName);
        if (tableInfo) {
          availableTables.set(tableName, {
            name: tableName,
            alias: ast.from.alias,
            columns: tableInfo.columns.map(c => ({
              name: c.name,
              table: tableName,
              dataType: c.dataType,
            })),
          });
          
          // 添加列到可用列表
          tableInfo.columns.forEach(col => {
            availableColumns.push({
              name: col.name,
              table: tableName,
              dataType: col.dataType,
            });
          });
          
          // 记录别名
          if (ast.from.alias) {
            aliases.set(ast.from.alias, tableName);
          }
        }
      }
    }
    
    // 从 JOIN 子句收集
    if (ast.joins) {
      for (const join of ast.joins) {
        const tableName = join.table.name;
        if (tableName) {
          const tableInfo = this.schemaManager.getTable(tableName);
          if (tableInfo) {
            availableTables.set(tableName, {
              name: tableName,
              alias: join.table.alias,
              columns: tableInfo.columns.map(c => ({
                name: c.name,
                table: tableName,
                dataType: c.dataType,
              })),
            });
            
            tableInfo.columns.forEach(col => {
              availableColumns.push({
                name: col.name,
                table: tableName,
                dataType: col.dataType,
              });
            });
            
            if (join.table.alias) {
              aliases.set(join.table.alias, tableName);
            }
          }
        }
      }
    }
    
    return { availableTables, availableColumns, aliases };
  }
  
  /**
   * 检测语句类型
   */
  private detectStatementType(tokens: Token[]): 
    'select' | 'insert' | 'update' | 'delete' | 'unknown' {
    for (const token of tokens) {
      if (token.type === TokenType.SELECT) return 'select';
      if (token.type === TokenType.INSERT) return 'insert';
      if (token.type === TokenType.UPDATE) return 'update';
      if (token.type === TokenType.DELETE) return 'delete';
    }
    return 'unknown';
  }
  
  /**
   * 计算嵌套深度（子查询）
   */
  private calculateNestingLevel(tokens: Token[], cursorPosition: number): number {
    let level = 0;
    for (const token of tokens) {
      if (token.start >= cursorPosition) break;
      if (token.type === TokenType.LPAREN) level++;
      if (token.type === TokenType.RPAREN) level--;
    }
    return Math.max(0, level);
  }
}
```

## 7.4 上下文分析流程

```
┌─────────────────────────────────────────────────────────────┐
│                    上下文分析流程                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   SQL: "SELECT u.name FROM users u WHERE u.|"               │
│                                           ↑                 │
│                                      cursor: 41             │
│                                                             │
│   步骤 1: 分词                                               │
│   ┌─────────────────────────────────────────────┐           │
│   │ [SELECT] [u] [.] [name] [FROM] [users] [u]  │           │
│   │ [WHERE] [u] [.] ← cursor 在这里              │           │
│   └─────────────────────────────────────────────┘           │
│                                                             │
│   步骤 2: 定位光标 Token                                     │
│   ┌─────────────────────────────────────────────┐           │
│   │ previousToken: DOT (.)                       │           │
│   │ currentToken: null (光标在空白处)            │           │
│   │ prefix: ""                                   │           │
│   └─────────────────────────────────────────────┘           │
│                                                             │
│   步骤 3: 解析 AST                                           │
│   ┌─────────────────────────────────────────────┐           │
│   │ {                                            │           │
│   │   type: 'select',                            │           │
│   │   columns: [{ table: 'u', column: 'name' }], │           │
│   │   from: { name: 'users', alias: 'u' },       │           │
│   │   where: { incomplete: true }                │           │
│   │ }                                            │           │
│   └─────────────────────────────────────────────┘           │
│                                                             │
│   步骤 4: 确定位置                                           │
│   ┌─────────────────────────────────────────────┐           │
│   │ previousToken 是 DOT                         │           │
│   │ → location: DOT_ACCESS                       │           │
│   │ → 需要提示 u 表的列名                        │           │
│   └─────────────────────────────────────────────┘           │
│                                                             │
│   步骤 5: 收集可用符号                                       │
│   ┌─────────────────────────────────────────────┐           │
│   │ availableTables: { 'users' → [...columns] } │           │
│   │ aliases: { 'u' → 'users' }                   │           │
│   │ availableColumns: [id, name, email, ...]     │           │
│   └─────────────────────────────────────────────┘           │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## 7.5 边界情况处理

### 7.5.1 空输入

```typescript
// 输入: ""
// cursorPosition: 0

const context = analyzer.analyze("", 0);
// 结果:
// {
//   location: ContextLocation.STATEMENT_START,
//   statementType: 'unknown',
//   prefix: '',
//   availableTables: Map(0),
//   ...
// }

// 应该提示: SELECT, INSERT, UPDATE, DELETE 等
```

### 7.5.2 关键字中间

```typescript
// 输入: "SEL"
// cursorPosition: 3 (在 L 后面)

const context = analyzer.analyze("SEL", 3);
// 结果:
// {
//   location: ContextLocation.STATEMENT_START,
//   prefix: 'SEL',
//   currentToken: { type: IDENTIFIER, value: 'SEL' },
//   ...
// }

// 应该提示: SELECT (匹配前缀 SEL)
```

### 7.5.3 多表 JOIN

```typescript
// 输入: "SELECT * FROM users u JOIN orders o ON u.id = o.|"
// cursorPosition: 最后

const context = analyzer.analyze(sql, sql.length);
// 结果:
// {
//   location: ContextLocation.DOT_ACCESS,
//   availableTables: Map(2) { 'users', 'orders' },
//   aliases: Map(2) { 'u' → 'users', 'o' → 'orders' },
//   ...
// }

// DOT 前面是 'o'，解析为 orders 表
// 应该提示: orders 表的列 (id, user_id, total, status)
```

### 7.5.4 子查询

```typescript
// 输入: "SELECT * FROM users WHERE id IN (SELECT |)"
// 子查询内部

const context = analyzer.analyze(sql, cursorPosition);
// 结果:
// {
//   location: ContextLocation.SELECT_CLAUSE,
//   nestingLevel: 1,  // 在一层子查询中
//   ...
// }

// 子查询中应该提示列名和 * 等
```

## 7.6 DOT 访问的特殊处理

DOT 访问（如 `table.column`）需要特殊处理：

```typescript
/**
 * 处理 DOT 访问上下文
 */
private handleDotAccess(
  tokens: Token[], 
  dotIndex: number, 
  context: ParseContext
): ColumnInfo[] {
  // DOT 前面应该是表名或别名
  if (dotIndex > 0) {
    const beforeDot = tokens[dotIndex - 1];
    if (beforeDot.type === TokenType.IDENTIFIER) {
      const tableName = beforeDot.value;
      
      // 检查是否是别名
      if (context.aliases.has(tableName)) {
        const realTable = context.aliases.get(tableName)!;
        const tableInfo = context.availableTables.get(realTable);
        return tableInfo?.columns || [];
      }
      
      // 直接是表名
      const tableInfo = context.availableTables.get(tableName);
      return tableInfo?.columns || [];
    }
  }
  
  return [];
}
```

## 7.7 实际使用示例

```typescript
// 使用上下文分析器

const schemaManager = new SchemaManager();
schemaManager.addTable({
  name: 'users',
  columns: [
    { name: 'id', dataType: 'INT' },
    { name: 'name', dataType: 'VARCHAR' },
    { name: 'email', dataType: 'VARCHAR' },
  ]
});

const analyzer = new ContextAnalyzer(schemaManager);

// 示例 1: SELECT 后
let context = analyzer.analyze("SELECT ", 7);
console.log(context.location); // SELECT_CLAUSE
// 应提示: *, 列名, 函数, DISTINCT

// 示例 2: FROM 后
context = analyzer.analyze("SELECT * FROM ", 14);
console.log(context.location); // FROM_CLAUSE
// 应提示: 表名

// 示例 3: WHERE 条件
context = analyzer.analyze("SELECT * FROM users WHERE ", 26);
console.log(context.location); // WHERE_CLAUSE
// 应提示: 列名, 函数

// 示例 4: 点号后
context = analyzer.analyze("SELECT * FROM users u WHERE u.", 30);
console.log(context.location); // DOT_ACCESS
// 应提示: users 表的列名
```

## 7.8 小结

```
┌─────────────────────────────────────────────────────────────┐
│                   上下文分析关键点                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. 定位光标 Token                                           │
│     - currentToken: 光标所在的 Token                         │
│     - previousToken: 光标前一个 Token                        │
│     - prefix: 当前输入的前缀                                 │
│                                                             │
│  2. 推断上下文位置                                           │
│     - 根据前一个 Token 类型判断                              │
│     - 需要回溯查找关键字                                     │
│     - 处理特殊情况（DOT, 逗号, 括号）                        │
│                                                             │
│  3. 收集可用符号                                             │
│     - 从 AST 提取已出现的表                                  │
│     - 解析别名映射                                           │
│     - 从 Schema 获取列信息                                   │
│                                                             │
│  4. 边界情况                                                 │
│     - 空输入                                                 │
│     - 关键字中间                                             │
│     - 子查询                                                 │
│     - 多层嵌套                                               │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 练习题

1. **扩展位置类型**：添加对 `INSERT INTO ... VALUES (|)` 的支持
2. **子查询处理**：实现完整的子查询上下文分析
3. **错误恢复**：当 SQL 有语法错误时，如何提供有意义的上下文？
4. **性能优化**：如何缓存分析结果，避免重复计算？

---

[← 上一章：Parser 实现](./06-parser.md) | [下一章：建议引擎 →](./08-suggestion-engine.md)
