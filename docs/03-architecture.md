# 第3章：项目架构设计

> 📚 本章将介绍项目的整体架构、模块划分和数据流设计。

## 3.1 架构概览

本项目采用**分层架构**，各层职责清晰，便于维护和扩展：

```
┌─────────────────────────────────────────────────────────────────┐
│                         应用层                                   │
│              SQLAutocompleteParser (主 API)                      │
├─────────────────────────────────────────────────────────────────┤
│                         核心层                                   │
│  ┌─────────────┬─────────────┬─────────────┬─────────────┐      │
│  │  Tokenizer  │   Parser    │  Context    │ Suggestion  │      │
│  │  词法分析    │   语法分析   │  上下文分析  │  建议生成    │      │
│  └─────────────┴─────────────┴─────────────┴─────────────┘      │
├─────────────────────────────────────────────────────────────────┤
│                         支撑层                                   │
│  ┌─────────────┬─────────────┬─────────────┐                    │
│  │   Schema    │  Validator  │   Types     │                    │
│  │  Schema管理  │   语法验证   │   类型定义   │                    │
│  └─────────────┴─────────────┴─────────────┘                    │
└─────────────────────────────────────────────────────────────────┘
```

## 3.2 数据流

当用户请求自动补全时，数据流如下：

```
┌─────────────────────────────────────────────────────────────────┐
│                         数据流程                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  输入                                                           │
│  ├── SQL 文本: "SELECT * FROM users WHERE "                     │
│  └── 光标位置: 27                                               │
│          │                                                      │
│          ▼                                                      │
│  ┌─────────────────┐                                            │
│  │   Tokenizer     │  "SELECT * FROM users WHERE "              │
│  │                 │  → [SELECT, *, FROM, users, WHERE, EOF]    │
│  └────────┬────────┘                                            │
│           │ Token[]                                             │
│           ▼                                                     │
│  ┌─────────────────┐                                            │
│  │    Parser       │  Token[] → AST                             │
│  │                 │  → SelectStatement { ... whereClause }     │
│  └────────┬────────┘                                            │
│           │ AST + Token[]                                       │
│           ▼                                                     │
│  ┌─────────────────┐                                            │
│  │ Context Analyzer│  光标位置 27 + AST                          │
│  │                 │  → ContextType.WHERE_CONDITION             │
│  │                 │  → availableTables: ['users']              │
│  └────────┬────────┘                                            │
│           │ ContextInfo                                         │
│           ▼                                                     │
│  ┌─────────────────┐                                            │
│  │Suggestion Engine│  ContextInfo + Schema                      │
│  │                 │  → [id, name, email, age, =, !=, ...]      │
│  └────────┬────────┘                                            │
│           │ SuggestionItem[]                                    │
│           ▼                                                     │
│  输出                                                           │
│  └── 建议列表: [{label: 'id', type: 'column'}, ...]             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 3.3 模块详解

### 3.3.1 Types (类型定义)

**位置**: `src/types/`

**职责**: 定义所有的 TypeScript 类型和接口

```
types/
├── token.ts      # Token 相关类型
├── ast.ts        # AST 节点类型
├── context.ts    # 上下文和建议类型
├── schema.ts     # Schema 和配置类型
└── index.ts      # 统一导出
```

**核心类型一览**：

```typescript
// Token 类型
interface Token {
  type: TokenType;
  value: string;
  range: SourceRange;
}

// AST 节点
interface SelectStatement {
  type: 'SelectStatement';
  selectClause: SelectClause;
  fromClause?: FromClause;
  whereClause?: WhereClause;
  // ...
}

// 上下文信息
interface ContextInfo {
  type: ContextType;
  availableTables: string[];
  availableColumns: Map<string, string[]>;
  aliases: Map<string, string>;
}

// 建议项
interface SuggestionItem {
  label: string;
  type: SuggestionType;
  detail?: string;
  score?: number;
}
```

### 3.3.2 Tokenizer (词法分析器)

**位置**: `src/tokenizer/Tokenizer.ts`

**职责**: 将 SQL 文本转换为 Token 数组

**核心方法**：

```typescript
class Tokenizer {
  constructor(input: string);
  
  // 主方法：分词
  tokenize(): Token[];
  
  // 内部方法
  private nextToken(): Token | null;
  private readIdentifier(): Token;
  private readNumber(): Token;
  private readStringLiteral(): Token;
  // ...
}
```

**设计要点**：

1. **流式处理** - 逐字符读取，维护位置信息
2. **关键字识别** - 大小写不敏感的关键字匹配
3. **容错处理** - 遇到未知字符时标记为 UNKNOWN

### 3.3.3 Parser (语法分析器)

**位置**: `src/parser/Parser.ts`

**职责**: 将 Token 数组转换为 AST

**核心方法**：

```typescript
class Parser {
  constructor(tokens: Token[]);
  
  // 主方法：解析
  parse(): Statement | null;
  
  // 语句解析
  private parseSelect(): SelectStatement;
  
  // 子句解析
  private parseFromClause(): FromClause;
  private parseJoinClause(): JoinClause;
  private parseWhereClause(): WhereClause;
  private parseGroupByClause(): GroupByClause;
  private parseOrderByClause(): OrderByClause;
  private parseLimitClause(): LimitClause;
  
  // 辅助方法
  private findTokenAtPosition(offset: number): Token | null;
}
```

**设计要点**：

1. **递归下降** - 每个语法规则对应一个方法
2. **残缺处理** - 标记 incomplete 节点
3. **错误恢复** - 跳过错误，继续解析

### 3.3.4 Schema Manager (Schema 管理器)

**位置**: `src/schema/SchemaManager.ts`

**职责**: 管理数据库元数据（表、列、关系）

**核心方法**：

```typescript
class SchemaManager {
  constructor(schema?: DatabaseSchema);
  
  // 加载 Schema
  loadSchema(schema: DatabaseSchema): void;
  
  // 表查询
  getTable(tableName: string): TableDefinition | undefined;
  getTableNames(): string[];
  hasTable(tableName: string): boolean;
  
  // 列查询
  getColumns(tableName: string): ColumnDefinition[];
  getColumnNames(tableName: string): string[];
  
  // 关系查询
  getForeignKeys(tableName: string): ForeignKeyRelationship[];
}
```

**Schema 数据结构**：

```typescript
interface DatabaseSchema {
  tables: Record<string, TableDefinition>;
}

interface TableDefinition {
  name: string;
  columns: Record<string, ColumnDefinition>;
  foreignKeys?: ForeignKeyRelationship[];
}

interface ColumnDefinition {
  name: string;
  type: SQLDataType;
  primaryKey?: boolean;
  nullable?: boolean;
}
```

### 3.3.5 Context Analyzer (上下文分析器)

**位置**: 集成在 `src/index.ts` 中

**职责**: 根据光标位置判断当前上下文

**核心逻辑**：

```typescript
// 上下文类型
enum ContextType {
  STATEMENT_START,    // 语句开始
  SELECT_COLUMN,      // SELECT 后的列
  FROM_TABLE,         // FROM 后的表名
  JOIN_TABLE,         // JOIN 后的表名
  JOIN_CONDITION,     // ON 后的条件
  WHERE_CONDITION,    // WHERE 后的条件
  KEYWORD,            // 期望关键字
  // ...
}

// 分析方法
function analyzeContext(
  sql: string, 
  cursorPosition: number, 
  ast: AST
): ContextInfo {
  // 1. 从 AST 提取可用表和列
  // 2. 根据光标位置判断上下文类型
  // 3. 返回上下文信息
}
```

### 3.3.6 Suggestion Engine (建议引擎)

**位置**: 集成在 `src/index.ts` 中

**职责**: 根据上下文生成补全建议

**核心逻辑**：

```typescript
function generateSuggestions(
  context: ContextInfo,
  tokenAtCursor: Token | null
): SuggestionItem[] {
  const suggestions: SuggestionItem[] = [];
  
  switch (context.type) {
    case ContextType.STATEMENT_START:
      // 建议: SELECT, INSERT, UPDATE, DELETE
      break;
      
    case ContextType.FROM_TABLE:
      // 建议: 所有表名
      break;
      
    case ContextType.WHERE_CONDITION:
      // 建议: 可用列名 + 运算符
      break;
    // ...
  }
  
  // 根据已输入的前缀过滤
  // 按评分排序
  return rankSuggestions(suggestions, tokenAtCursor);
}
```

### 3.3.7 Syntax Validator (语法验证器)

**位置**: `src/validator/SyntaxValidator.ts`

**职责**: 验证 SQL 语法和语义错误

**核心方法**：

```typescript
class SyntaxValidator {
  constructor(schemaManager: SchemaManager);
  
  // 主方法：验证
  validate(ast: Statement, sql: string): ValidationResult;
  
  // 验证规则
  private validateSelectStatement(ast: SelectStatement): void;
  private validateTableReferences(ast: SelectStatement): void;
  private validateColumnReferences(ast: SelectStatement): void;
  private validateJoins(joins: JoinClause[]): void;
  
  // 辅助方法
  private suggestSimilarTables(tableName: string): string[];
  private suggestSimilarColumns(columnName: string): string[];
}
```

### 3.3.8 Main API (主 API)

**位置**: `src/index.ts`

**职责**: 对外暴露统一的 API

```typescript
class SQLAutocompleteParser {
  constructor(options?: ParserOptions);
  
  // 获取补全建议
  getSuggestions(sql: string, cursorPosition: number): SuggestionResult;
  
  // 验证 SQL
  validate(sql: string): ValidationResult;
  
  // 设置 Schema
  setSchema(schema: DatabaseSchema): void;
}
```

## 3.4 模块依赖关系

```
┌─────────────────────────────────────────────────────────────────┐
│                         模块依赖图                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│                 ┌───────────────────────────┐                   │
│                 │   SQLAutocompleteParser   │                   │
│                 │       (主 API)            │                   │
│                 └─────────────┬─────────────┘                   │
│                               │                                 │
│         ┌─────────────────────┼─────────────────────┐           │
│         │                     │                     │           │
│         ▼                     ▼                     ▼           │
│  ┌─────────────┐      ┌─────────────┐      ┌─────────────┐      │
│  │  Tokenizer  │      │   Parser    │      │  Validator  │      │
│  └──────┬──────┘      └──────┬──────┘      └──────┬──────┘      │
│         │                    │                    │             │
│         └────────────────────┼────────────────────┘             │
│                              │                                  │
│                              ▼                                  │
│                      ┌─────────────┐                            │
│                      │   Schema    │                            │
│                      │   Manager   │                            │
│                      └──────┬──────┘                            │
│                             │                                   │
│                             ▼                                   │
│                      ┌─────────────┐                            │
│                      │   Types     │                            │
│                      │  (共享类型)  │                            │
│                      └─────────────┘                            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

依赖方向: 上层 → 下层
共享依赖: Types 被所有模块使用
```

## 3.5 设计原则

### 3.5.1 单一职责

每个模块只负责一件事：

| 模块 | 单一职责 |
|------|---------|
| Tokenizer | 文本 → Token |
| Parser | Token → AST |
| SchemaManager | 管理 Schema |
| Validator | 检查错误 |
| API | 组合调用 |

### 3.5.2 依赖倒置

- 高层模块不依赖低层实现细节
- 通过接口（类型定义）通信
- 便于替换和测试

### 3.5.3 开放封闭

- 对扩展开放：易于添加新功能
- 对修改封闭：不需要修改现有代码

**示例**: 添加新的 SQL 方言

```typescript
// 只需要扩展，不需要修改核心代码
const mysqlKeywords = new Set([...SQL_KEYWORDS, 'LIMIT', 'OFFSET']);
const postgresKeywords = new Set([...SQL_KEYWORDS, 'RETURNING']);
```

## 3.6 目录结构

```
src/
├── types/                    # 📦 类型定义
│   ├── token.ts              #    Token 类型
│   ├── ast.ts                #    AST 节点类型
│   ├── context.ts            #    上下文类型
│   ├── schema.ts             #    Schema 类型
│   └── index.ts              #    统一导出
│
├── tokenizer/                # 📦 词法分析
│   ├── Tokenizer.ts          #    Tokenizer 实现
│   └── index.ts              #    导出
│
├── parser/                   # 📦 语法分析
│   ├── Parser.ts             #    Parser 实现
│   └── index.ts              #    导出
│
├── schema/                   # 📦 Schema 管理
│   ├── SchemaManager.ts      #    SchemaManager 实现
│   └── index.ts              #    导出
│
├── validator/                # 📦 语法验证
│   ├── SyntaxValidator.ts    #    Validator 实现
│   └── index.ts              #    导出
│
├── index.ts                  # 📦 主 API (SQLAutocompleteParser)
├── example.ts                # 📝 使用示例
│
└── __tests__/                # 🧪 测试文件
    ├── setup.ts              #    测试配置
    ├── tokenizer/            #    Tokenizer 测试
    ├── parser/               #    Parser 测试
    └── SQLAutocompleteParser.test.ts  # 集成测试
```

## 3.7 本章小结

在本章中，我们学习了：

- ✅ 项目的分层架构设计
- ✅ 数据流：从 SQL 文本到建议列表
- ✅ 各模块的职责和核心方法
- ✅ 模块之间的依赖关系
- ✅ 设计原则的应用

## 3.8 练习题

1. **架构分析**：画出从用户输入到获取建议的完整数据流图

2. **设计思考**：如果要添加 INSERT 语句的自动补全，需要修改哪些模块？

3. **代码阅读**：打开 `src/index.ts`，理解 `getSuggestions` 方法的实现

## 3.9 下一章预告

在下一章 [第4章：类型系统设计](./04-type-system.md) 中，我们将深入学习：

- Token 类型的详细设计
- AST 节点类型的设计
- 上下文和建议类型

---

[← 上一章：编译原理入门](./02-compiler-basics.md) | [📖 返回目录](./README.md) | [下一章：类型系统设计 →](./04-type-system.md)
