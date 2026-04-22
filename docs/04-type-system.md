# 第4章：类型系统设计

> 🎯 **学习目标**：理解如何设计 TypeScript 类型系统来描述 Token、AST 节点和建议结果

---

## 4.1 为什么类型系统很重要

在构建解析器时，类型系统是我们的第一道防线：

```
┌─────────────────────────────────────────────────────────────┐
│                    类型系统的作用                            │
├─────────────────────────────────────────────────────────────┤
│  1. 编译时错误检测 - 避免运行时崩溃                          │
│  2. 代码自动补全 - IDE 智能提示                              │
│  3. 文档作用 - 代码即文档                                    │
│  4. 重构安全 - 修改时编译器会提醒所有相关位置                 │
└─────────────────────────────────────────────────────────────┘
```

## 4.2 Token 类型定义

### 4.2.1 TokenType 枚举

首先定义所有可能的 Token 类型：

```typescript
// src/types/token.ts

/**
 * Token 类型枚举
 * 每种 Token 都有唯一的类型标识
 */
export enum TokenType {
  // ===== SQL 关键字 =====
  SELECT = 'SELECT',
  FROM = 'FROM',
  WHERE = 'WHERE',
  JOIN = 'JOIN',
  INNER = 'INNER',
  LEFT = 'LEFT',
  RIGHT = 'RIGHT',
  OUTER = 'OUTER',
  ON = 'ON',
  AND = 'AND',
  OR = 'OR',
  NOT = 'NOT',
  AS = 'AS',
  ORDER = 'ORDER',
  BY = 'BY',
  GROUP = 'GROUP',
  HAVING = 'HAVING',
  LIMIT = 'LIMIT',
  OFFSET = 'OFFSET',
  ASC = 'ASC',
  DESC = 'DESC',
  DISTINCT = 'DISTINCT',
  ALL = 'ALL',
  NULL = 'NULL',
  TRUE = 'TRUE',
  FALSE = 'FALSE',
  IN = 'IN',
  BETWEEN = 'BETWEEN',
  LIKE = 'LIKE',
  IS = 'IS',
  EXISTS = 'EXISTS',
  CASE = 'CASE',
  WHEN = 'WHEN',
  THEN = 'THEN',
  ELSE = 'ELSE',
  END = 'END',
  UNION = 'UNION',
  EXCEPT = 'EXCEPT',
  INTERSECT = 'INTERSECT',
  INSERT = 'INSERT',
  INTO = 'INTO',
  VALUES = 'VALUES',
  UPDATE = 'UPDATE',
  SET = 'SET',
  DELETE = 'DELETE',
  CREATE = 'CREATE',
  TABLE = 'TABLE',
  DROP = 'DROP',
  ALTER = 'ALTER',
  INDEX = 'INDEX',

  // ===== 标识符和字面量 =====
  IDENTIFIER = 'IDENTIFIER',     // 表名、列名等
  STRING = 'STRING',             // 字符串字面量 'hello'
  NUMBER = 'NUMBER',             // 数字 123, 3.14
  
  // ===== 运算符 =====
  EQUALS = 'EQUALS',             // =
  NOT_EQUALS = 'NOT_EQUALS',     // != 或 <>
  LESS_THAN = 'LESS_THAN',       // <
  GREATER_THAN = 'GREATER_THAN', // >
  LESS_EQUAL = 'LESS_EQUAL',     // <=
  GREATER_EQUAL = 'GREATER_EQUAL', // >=
  PLUS = 'PLUS',                 // +
  MINUS = 'MINUS',               // -
  MULTIPLY = 'MULTIPLY',         // *
  DIVIDE = 'DIVIDE',             // /
  MODULO = 'MODULO',             // %

  // ===== 分隔符 =====
  COMMA = 'COMMA',               // ,
  DOT = 'DOT',                   // .
  SEMICOLON = 'SEMICOLON',       // ;
  LPAREN = 'LPAREN',             // (
  RPAREN = 'RPAREN',             // )
  
  // ===== 特殊 =====
  WHITESPACE = 'WHITESPACE',     // 空白字符
  COMMENT = 'COMMENT',           // 注释
  EOF = 'EOF',                   // 输入结束
  UNKNOWN = 'UNKNOWN',           // 未知 Token
}
```

### 4.2.2 Token 接口

定义 Token 的完整结构：

```typescript
/**
 * Token 接口
 * 表示词法分析产生的最小单元
 */
export interface Token {
  /** Token 类型 */
  type: TokenType;
  
  /** Token 的原始文本值 */
  value: string;
  
  /** 起始位置（相对于输入字符串的索引） */
  start: number;
  
  /** 结束位置（不包含） */
  end: number;
  
  /** 行号（从 1 开始） */
  line: number;
  
  /** 列号（从 1 开始） */
  column: number;
}
```

### 4.2.3 位置信息的重要性

```
输入: "SELECT id FROM users"
       ↑
       position: 7 (id 的起始位置)

Token: {
  type: IDENTIFIER,
  value: "id",
  start: 7,
  end: 9,
  line: 1,
  column: 8
}
```

位置信息在自动补全中至关重要：
- **start/end**：确定光标是否在该 Token 内
- **line/column**：用于错误报告和编辑器集成

## 4.3 AST 节点类型

### 4.3.1 基础节点接口

所有 AST 节点都继承自基础接口：

```typescript
// src/types/ast.ts

/**
 * AST 节点基础接口
 */
export interface ASTNode {
  /** 节点类型 */
  type: string;
  
  /** 节点在源代码中的位置 */
  location?: {
    start: number;
    end: number;
  };
  
  /** 标记节点是否不完整（用于残缺输入） */
  incomplete?: boolean;
}
```

### 4.3.2 表达式节点

```typescript
/**
 * 表达式基础接口
 */
export interface Expression extends ASTNode {
  type: 'identifier' | 'literal' | 'binary' | 'function' | 'column_ref' | 'star';
}

/**
 * 标识符表达式
 * 例如: users, id, name
 */
export interface Identifier extends Expression {
  type: 'identifier';
  name: string;
}

/**
 * 字面量表达式
 * 例如: 42, 'hello', true
 */
export interface Literal extends Expression {
  type: 'literal';
  value: string | number | boolean | null;
  dataType: 'string' | 'number' | 'boolean' | 'null';
}

/**
 * 列引用
 * 例如: users.id, t.name
 */
export interface ColumnRef extends Expression {
  type: 'column_ref';
  table?: string;       // 表名或别名（可选）
  column: string;       // 列名
}

/**
 * 星号表达式
 * 例如: *, users.*
 */
export interface StarExpression extends Expression {
  type: 'star';
  table?: string;       // 限定表名（可选）
}

/**
 * 函数调用
 * 例如: COUNT(*), SUM(amount)
 */
export interface FunctionCall extends Expression {
  type: 'function';
  name: string;
  args: Expression[];
  distinct?: boolean;   // COUNT(DISTINCT id)
}

/**
 * 二元表达式
 * 例如: a = b, x > 10, name LIKE '%test%'
 */
export interface BinaryExpression extends Expression {
  type: 'binary';
  operator: string;
  left: Expression;
  right: Expression;
}
```

### 4.3.3 SELECT 语句节点

```typescript
/**
 * SELECT 列项
 */
export interface SelectColumn {
  expression: Expression;
  alias?: string;         // AS 后的别名
  incomplete?: boolean;
}

/**
 * 表引用
 */
export interface TableRef {
  type: 'table' | 'subquery';
  name?: string;          // 表名
  alias?: string;         // 别名
  schema?: string;        // 数据库/Schema 名
  subquery?: SelectStatement;  // 子查询
  incomplete?: boolean;
}

/**
 * JOIN 子句
 */
export interface JoinClause {
  type: 'INNER' | 'LEFT' | 'RIGHT' | 'FULL' | 'CROSS';
  table: TableRef;
  condition?: Expression;  // ON 条件
  incomplete?: boolean;
}

/**
 * ORDER BY 项
 */
export interface OrderByItem {
  expression: Expression;
  direction: 'ASC' | 'DESC';
}

/**
 * SELECT 语句完整结构
 */
export interface SelectStatement extends ASTNode {
  type: 'select';
  
  /** 是否使用 DISTINCT */
  distinct?: boolean;
  
  /** SELECT 列表 */
  columns: SelectColumn[];
  
  /** FROM 子句 - 主表 */
  from?: TableRef;
  
  /** JOIN 子句列表 */
  joins?: JoinClause[];
  
  /** WHERE 条件 */
  where?: Expression;
  
  /** GROUP BY 表达式列表 */
  groupBy?: Expression[];
  
  /** HAVING 条件 */
  having?: Expression;
  
  /** ORDER BY 列表 */
  orderBy?: OrderByItem[];
  
  /** LIMIT 值 */
  limit?: number;
  
  /** OFFSET 值 */
  offset?: number;
  
  /** 整体是否不完整 */
  incomplete?: boolean;
}
```

### 4.3.4 AST 结构示例

```
SQL: SELECT u.name, COUNT(*) FROM users u WHERE u.age > 18

AST:
{
  type: 'select',
  columns: [
    {
      expression: {
        type: 'column_ref',
        table: 'u',
        column: 'name'
      }
    },
    {
      expression: {
        type: 'function',
        name: 'COUNT',
        args: [{ type: 'star' }]
      }
    }
  ],
  from: {
    type: 'table',
    name: 'users',
    alias: 'u'
  },
  where: {
    type: 'binary',
    operator: '>',
    left: {
      type: 'column_ref',
      table: 'u',
      column: 'age'
    },
    right: {
      type: 'literal',
      value: 18,
      dataType: 'number'
    }
  }
}
```

## 4.4 Schema 类型

### 4.4.1 数据库元信息

```typescript
// src/types/schema.ts

/**
 * 列定义
 */
export interface ColumnDefinition {
  /** 列名 */
  name: string;
  
  /** 数据类型 */
  dataType: string;
  
  /** 是否可为空 */
  nullable?: boolean;
  
  /** 是否是主键 */
  isPrimaryKey?: boolean;
  
  /** 外键引用 */
  foreignKey?: {
    table: string;
    column: string;
  };
  
  /** 列注释/描述 */
  comment?: string;
  
  /** 默认值 */
  defaultValue?: string;
}

/**
 * 表定义
 */
export interface TableDefinition {
  /** 表名 */
  name: string;
  
  /** 所属 Schema/数据库 */
  schema?: string;
  
  /** 列列表 */
  columns: ColumnDefinition[];
  
  /** 表注释 */
  comment?: string;
  
  /** 表别名（常用别名） */
  commonAliases?: string[];
}

/**
 * 完整的数据库 Schema
 */
export interface DatabaseSchema {
  /** Schema 名称 */
  name: string;
  
  /** 表列表 */
  tables: TableDefinition[];
  
  /** 自定义函数 */
  functions?: FunctionDefinition[];
}

/**
 * 函数定义
 */
export interface FunctionDefinition {
  /** 函数名 */
  name: string;
  
  /** 参数签名 */
  signature: string;
  
  /** 返回类型 */
  returnType: string;
  
  /** 描述 */
  description?: string;
  
  /** 示例 */
  example?: string;
}
```

### 4.4.2 Schema 示例

```typescript
const exampleSchema: DatabaseSchema = {
  name: 'ecommerce',
  tables: [
    {
      name: 'users',
      columns: [
        { name: 'id', dataType: 'INT', isPrimaryKey: true },
        { name: 'name', dataType: 'VARCHAR(100)', nullable: false },
        { name: 'email', dataType: 'VARCHAR(255)', nullable: false },
        { name: 'created_at', dataType: 'TIMESTAMP' }
      ],
      comment: '用户表'
    },
    {
      name: 'orders',
      columns: [
        { name: 'id', dataType: 'INT', isPrimaryKey: true },
        { name: 'user_id', dataType: 'INT', foreignKey: { table: 'users', column: 'id' } },
        { name: 'total', dataType: 'DECIMAL(10,2)' },
        { name: 'status', dataType: 'ENUM("pending","paid","shipped")' }
      ],
      comment: '订单表'
    }
  ],
  functions: [
    {
      name: 'COUNT',
      signature: 'COUNT(expr)',
      returnType: 'INT',
      description: '计数函数',
      example: 'COUNT(*), COUNT(DISTINCT id)'
    }
  ]
};
```

## 4.5 上下文和建议类型

### 4.5.1 解析上下文

```typescript
// src/types/context.ts

/**
 * 上下文位置类型
 * 光标可能处于的语法位置
 */
export type ContextLocation = 
  | 'select_clause'      // SELECT 后面
  | 'from_clause'        // FROM 后面
  | 'join_table'         // JOIN 后面
  | 'join_condition'     // ON 后面
  | 'where_clause'       // WHERE 后面
  | 'group_by'           // GROUP BY 后面
  | 'having_clause'      // HAVING 后面
  | 'order_by'           // ORDER BY 后面
  | 'expression'         // 表达式中
  | 'unknown';           // 未知位置

/**
 * 解析上下文
 * 包含光标位置的所有相关信息
 */
export interface ParseContext {
  /** 上下文位置类型 */
  location: ContextLocation;
  
  /** 当前正在输入的前缀（用于过滤） */
  prefix: string;
  
  /** 当前语句类型 */
  statementType: 'select' | 'insert' | 'update' | 'delete' | 'unknown';
  
  /** 已解析的 AST（可能不完整） */
  ast?: SelectStatement;
  
  /** 当前可用的表（包括别名映射） */
  availableTables: Map<string, TableRef>;
  
  /** 当前可用的列（考虑 JOIN） */
  availableColumns: ColumnDefinition[];
  
  /** 光标位置 */
  cursorPosition: number;
  
  /** 光标所在的 Token */
  currentToken?: Token;
  
  /** 光标前一个 Token */
  previousToken?: Token;
}
```

### 4.5.2 建议结果类型

```typescript
// src/types/suggestion.ts

/**
 * 建议类型
 */
export type SuggestionType = 
  | 'keyword'     // SQL 关键字
  | 'table'       // 表名
  | 'column'      // 列名
  | 'function'    // 函数
  | 'alias'       // 别名
  | 'operator'    // 运算符
  | 'snippet';    // 代码片段

/**
 * 单个建议项
 */
export interface Suggestion {
  /** 建议类型 */
  type: SuggestionType;
  
  /** 显示文本 */
  label: string;
  
  /** 插入文本（可能与 label 不同） */
  insertText: string;
  
  /** 详细描述 */
  detail?: string;
  
  /** 文档说明 */
  documentation?: string;
  
  /** 排序优先级（数字越小越靠前） */
  sortOrder: number;
  
  /** 是否需要触发下一次补全 */
  triggerNextCompletion?: boolean;
  
  /** 关联的元数据 */
  metadata?: {
    dataType?: string;
    tableName?: string;
    isPrimaryKey?: boolean;
    isForeignKey?: boolean;
  };
}

/**
 * 建议结果
 */
export interface SuggestionResult {
  /** 建议列表 */
  suggestions: Suggestion[];
  
  /** 是否完整（false 表示可能有更多） */
  isComplete: boolean;
  
  /** 替换范围 */
  replaceRange?: {
    start: number;
    end: number;
  };
}
```

## 4.6 类型守卫和工具函数

### 4.6.1 类型守卫

```typescript
// src/types/guards.ts

import { Expression, ColumnRef, FunctionCall, BinaryExpression, Literal } from './ast';
import { Token, TokenType } from './token';

/**
 * 检查表达式是否是列引用
 */
export function isColumnRef(expr: Expression): expr is ColumnRef {
  return expr.type === 'column_ref';
}

/**
 * 检查表达式是否是函数调用
 */
export function isFunctionCall(expr: Expression): expr is FunctionCall {
  return expr.type === 'function';
}

/**
 * 检查表达式是否是二元表达式
 */
export function isBinaryExpression(expr: Expression): expr is BinaryExpression {
  return expr.type === 'binary';
}

/**
 * 检查表达式是否是字面量
 */
export function isLiteral(expr: Expression): expr is Literal {
  return expr.type === 'literal';
}

/**
 * 检查 Token 是否是关键字
 */
export function isKeywordToken(token: Token): boolean {
  const keywords = [
    TokenType.SELECT, TokenType.FROM, TokenType.WHERE,
    TokenType.JOIN, TokenType.ON, TokenType.AND, TokenType.OR,
    // ... 其他关键字
  ];
  return keywords.includes(token.type);
}

/**
 * 检查 Token 是否是比较运算符
 */
export function isComparisonOperator(token: Token): boolean {
  return [
    TokenType.EQUALS,
    TokenType.NOT_EQUALS,
    TokenType.LESS_THAN,
    TokenType.GREATER_THAN,
    TokenType.LESS_EQUAL,
    TokenType.GREATER_EQUAL,
  ].includes(token.type);
}
```

### 4.6.2 工具类型

```typescript
// src/types/utils.ts

/**
 * 使某些属性变为必需
 */
export type RequireKeys<T, K extends keyof T> = T & Required<Pick<T, K>>;

/**
 * 深度只读
 */
export type DeepReadonly<T> = {
  readonly [P in keyof T]: T[P] extends object ? DeepReadonly<T[P]> : T[P];
};

/**
 * 提取 AST 中所有表引用
 */
export type ExtractTableRefs<T> = T extends { from?: infer F }
  ? F extends TableRef
    ? F
    : never
  : never;
```

## 4.7 完整类型导出

```typescript
// src/types/index.ts

// Token 相关
export { TokenType, Token } from './token';

// AST 相关
export {
  ASTNode,
  Expression,
  Identifier,
  Literal,
  ColumnRef,
  StarExpression,
  FunctionCall,
  BinaryExpression,
  SelectColumn,
  TableRef,
  JoinClause,
  OrderByItem,
  SelectStatement,
} from './ast';

// Schema 相关
export {
  ColumnDefinition,
  TableDefinition,
  DatabaseSchema,
  FunctionDefinition,
} from './schema';

// 上下文和建议
export {
  ContextLocation,
  ParseContext,
} from './context';

export {
  SuggestionType,
  Suggestion,
  SuggestionResult,
} from './suggestion';

// 类型守卫
export * from './guards';
```

## 4.8 小结

```
┌─────────────────────────────────────────────────────────────┐
│                     类型系统总览                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Token 类型          AST 类型           Schema 类型         │
│  ┌─────────┐        ┌─────────┐        ┌─────────┐         │
│  │TokenType│        │ASTNode  │        │Database │         │
│  │Token    │   →    │Expression│  →    │Table    │         │
│  └─────────┘        │Statement│        │Column   │         │
│                     └─────────┘        └─────────┘         │
│       ↓                  ↓                  ↓               │
│  ┌─────────────────────────────────────────────────┐       │
│  │              Context & Suggestion               │       │
│  │  ParseContext ──→ SuggestionResult              │       │
│  └─────────────────────────────────────────────────┘       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 关键要点

1. **Token 类型** 是词法分析的基础，包含位置信息
2. **AST 类型** 描述语法结构，支持 `incomplete` 标记
3. **Schema 类型** 存储数据库元信息
4. **Context 类型** 连接 AST 和 Schema，确定光标位置
5. **Suggestion 类型** 是最终输出，面向编辑器

---

## 练习题

1. **扩展 Token 类型**：添加对 `CASE WHEN` 语句的支持
2. **设计 INSERT AST**：设计 `InsertStatement` 接口
3. **类型守卫**：实现 `isSelectStatement` 类型守卫
4. **泛型应用**：设计一个泛型 `visit` 函数遍历 AST

---

[← 上一章：项目架构设计](./03-architecture.md) | [下一章：Tokenizer 实现 →](./05-tokenizer.md)
