# 第2章：编译原理入门

> 📚 本章将介绍编译原理的基础概念，帮助你理解解析器的工作原理。

## 2.1 从文本到结构

当计算机处理代码时，它需要经历一个"理解"的过程。就像人类阅读文章一样：

```
人类阅读：
  "今天天气很好" → 识别文字 → 理解语法 → 理解含义

代码处理：
  "SELECT * FROM users" → 识别单词 → 理解结构 → 执行/分析
```

这个过程在编译原理中被分为几个阶段：

```
┌─────────────────────────────────────────────────────────────────┐
│                        编译/解析流程                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  源代码文本                                                      │
│      │                                                          │
│      ▼                                                          │
│  ┌─────────────────┐                                            │
│  │   词法分析       │  将文本分割为 Token (单词)                   │
│  │   (Lexer)       │  "SELECT * FROM users"                     │
│  └────────┬────────┘    → [SELECT] [*] [FROM] [users]           │
│           │                                                     │
│           ▼                                                     │
│  ┌─────────────────┐                                            │
│  │   语法分析       │  将 Token 组织成语法树                       │
│  │   (Parser)      │  → SelectStatement                         │
│  └────────┬────────┘      ├── columns: [*]                      │
│           │               └── from: users                       │
│           ▼                                                     │
│  ┌─────────────────┐                                            │
│  │   语义分析       │  检查含义是否正确                            │
│  │  (Semantic)     │  → users 表是否存在？                       │
│  └─────────────────┘                                            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 2.2 词法分析 (Lexical Analysis)

### 什么是词法分析？

词法分析是将源代码字符串分割成有意义的**词法单元 (Token)** 的过程。

**类比**：就像把一个句子分割成单词：

```
英语句子：  "The cat sat on the mat"
分词结果：  ["The", "cat", "sat", "on", "the", "mat"]

SQL 语句：  "SELECT id FROM users"  
分词结果：  [SELECT] [id] [FROM] [users]
```

### Token 的组成

每个 Token 包含以下信息：

```typescript
interface Token {
  type: TokenType;      // 类型：关键字、标识符、数字等
  value: string;        // 原始值
  range: SourceRange;   // 位置信息
}
```

### SQL Token 类型

```
┌─────────────────────────────────────────────────────────────┐
│                      SQL Token 类型                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  KEYWORD (关键字)                                            │
│    SELECT, FROM, WHERE, JOIN, ORDER, GROUP, ...             │
│                                                             │
│  IDENTIFIER (标识符)                                         │
│    users, id, name, my_table, ...                           │
│                                                             │
│  STRING_LITERAL (字符串字面量)                                │
│    'hello', "world", ...                                    │
│                                                             │
│  NUMBER_LITERAL (数字字面量)                                  │
│    42, 3.14, 1e10, ...                                      │
│                                                             │
│  OPERATOR (运算符)                                           │
│    =, !=, <, >, <=, >=, +, -, *, /, ...                     │
│                                                             │
│  PUNCTUATION (标点符号)                                       │
│    , . ; ( ) [ ]                                            │
│                                                             │
│  COMMENT (注释)                                              │
│    -- single line, /* multi line */                         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 词法分析示例

让我们看看 `SELECT * FROM users WHERE age > 18` 的词法分析结果：

```
输入: "SELECT * FROM users WHERE age > 18"

输出 Token 流:
┌────┬──────────────────┬────────────┬──────────────┐
│ #  │ Type             │ Value      │ Position     │
├────┼──────────────────┼────────────┼──────────────┤
│ 1  │ KEYWORD          │ SELECT     │ 0:0 - 0:6    │
│ 2  │ OPERATOR         │ *          │ 0:7 - 0:8    │
│ 3  │ KEYWORD          │ FROM       │ 0:9 - 0:13   │
│ 4  │ IDENTIFIER       │ users      │ 0:14 - 0:19  │
│ 5  │ KEYWORD          │ WHERE      │ 0:20 - 0:25  │
│ 6  │ IDENTIFIER       │ age        │ 0:26 - 0:29  │
│ 7  │ OPERATOR         │ >          │ 0:30 - 0:31  │
│ 8  │ NUMBER_LITERAL   │ 18         │ 0:32 - 0:34  │
│ 9  │ EOF              │            │ 0:34         │
└────┴──────────────────┴────────────┴──────────────┘
```

### 词法分析的挑战

1. **关键字 vs 标识符**
   ```sql
   SELECT select FROM from
   -- select 是关键字还是标识符？
   -- 需要区分上下文或使用大小写规则
   ```

2. **字符串中的转义**
   ```sql
   SELECT 'It''s a test'
   -- 两个单引号表示一个单引号
   ```

3. **多字符运算符**
   ```sql
   WHERE age >= 18 AND name != 'test'
   -- >= 和 != 是两个字符的运算符
   ```

## 2.3 语法分析 (Syntax Analysis)

### 什么是语法分析？

语法分析是将 Token 流组织成**抽象语法树 (AST)** 的过程。

**类比**：就像分析句子的语法结构：

```
英语句子：  "The cat sat on the mat"
语法分析：
           句子
          /    \
       主语    谓语
        |     /    \
      The cat  sat  介词短语
                    /    \
                  on   the mat

SQL 语句：  "SELECT id FROM users"
语法分析：
           SelectStatement
          /              \
     SelectClause      FromClause
         |                 |
    ColumnRef          TableRef
         |                 |
        id              users
```

### 什么是抽象语法树 (AST)？

AST 是源代码的树形结构表示，它：

- **抽象**：省略了不重要的细节（如空格、注释）
- **结构化**：清晰表达代码的层次关系
- **可遍历**：便于后续分析和处理

### SQL AST 示例

```sql
SELECT u.name, o.total 
FROM users u 
JOIN orders o ON u.id = o.user_id 
WHERE o.total > 100
```

对应的 AST 结构：

```
SelectStatement
├── selectClause
│   ├── columns
│   │   ├── ColumnReference { tableName: "u", columnName: "name" }
│   │   └── ColumnReference { tableName: "o", columnName: "total" }
│   └── distinct: false
│
├── fromClause
│   ├── tables
│   │   └── TableReference { tableName: "users", alias: "u" }
│   └── joins
│       └── JoinClause
│           ├── joinType: "INNER"
│           ├── table: TableReference { tableName: "orders", alias: "o" }
│           └── condition: BinaryExpression
│               ├── left: ColumnReference { tableName: "u", columnName: "id" }
│               ├── operator: "="
│               └── right: ColumnReference { tableName: "o", columnName: "user_id" }
│
└── whereClause
    └── condition: BinaryExpression
        ├── left: ColumnReference { tableName: "o", columnName: "total" }
        ├── operator: ">"
        └── right: Literal { value: 100 }
```

### 解析方法：递归下降

本项目使用**递归下降解析 (Recursive Descent Parsing)**，这是最直观的解析方法：

```
核心思想：
  每种语法结构对应一个解析函数
  函数之间互相调用，形成递归

示例：解析 SELECT 语句
  parseSelect()
    ├── parseSelectClause()  → 解析 SELECT 后的列
    ├── parseFromClause()    → 解析 FROM 后的表
    │     └── parseJoinClause()  → 如果有 JOIN
    ├── parseWhereClause()   → 解析 WHERE 条件
    │     └── parseExpression()  → 解析条件表达式
    └── ...
```

### 为什么选择递归下降？

| 方法 | 优点 | 缺点 |
|------|------|------|
| **递归下降** | 简单直观，错误处理灵活 | 对左递归敏感 |
| LR 解析器 | 高效，支持更多语法 | 复杂，需要工具生成 |
| PEG | 强大，易于理解 | 性能可能较差 |

对于自动补全场景，递归下降是最佳选择，因为：

1. **可控性强** - 可以精确控制解析过程
2. **错误恢复好** - 容易实现残缺输入处理
3. **代码直观** - 每个语法规则对应一个函数

## 2.4 语义分析 (Semantic Analysis)

### 什么是语义分析？

语义分析检查代码的**含义**是否正确，即使语法正确也可能语义错误。

```sql
-- 语法正确，但语义可能错误
SELECT id FROM unknown_table    -- 表不存在
SELECT unknwon_col FROM users   -- 列不存在
SELECT id, name FROM users, orders WHERE users.id  -- 歧义列
```

### 语义分析的任务

```
┌─────────────────────────────────────────────────────────────┐
│                     语义分析任务                              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. 名称解析 (Name Resolution)                               │
│     - 表名是否存在？                                         │
│     - 列名是否属于指定的表？                                  │
│     - 别名如何对应到原名？                                    │
│                                                             │
│  2. 类型检查 (Type Checking)                                 │
│     - WHERE age = 'text'  → 类型不匹配                       │
│     - SUM('hello')        → 参数类型错误                     │
│                                                             │
│  3. 作用域检查 (Scope Checking)                              │
│     - 列名在当前上下文是否可用？                              │
│     - 别名的作用范围？                                       │
│                                                             │
│  4. 约束检查 (Constraint Checking)                           │
│     - GROUP BY 必须包含非聚合列                               │
│     - HAVING 只能用于聚合查询                                 │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## 2.5 自动补全的特殊需求

传统编译器和自动补全解析器有重要区别：

```
传统编译器
┌─────────────────────────────────────────────────────────────┐
│ 输入：完整、正确的源代码                                       │
│ 输出：可执行程序 或 错误信息                                    │
│ 特点：遇到错误就停止                                           │
└─────────────────────────────────────────────────────────────┘

自动补全解析器
┌─────────────────────────────────────────────────────────────┐
│ 输入：残缺的、可能有错误的代码片段 + 光标位置                     │
│ 输出：当前上下文的建议列表                                      │
│ 特点：必须容忍错误，尽可能理解意图                               │
└─────────────────────────────────────────────────────────────┘
```

### 自动补全的挑战

1. **残缺输入**
   ```sql
   SELECT * FROM    -- 用户正在输入表名
   SELECT * FR      -- 用户正在输入 FROM
   SELECT * FROM users WH  -- 用户正在输入 WHERE
   ```

2. **错误恢复**
   ```sql
   SELECT * FORM users WHERE  -- FORM 拼错了，但要继续解析
   SELECT * FROM users WHER   -- 关键字不完整
   ```

3. **光标位置**
   ```sql
   SELECT |* FROM users  -- 光标在 SELECT 后
   SELECT * FROM users WHERE |  -- 光标在 WHERE 后
   ```

### 我们的解决方案

```
┌─────────────────────────────────────────────────────────────┐
│                    自动补全解析流程                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. 词法分析                                                 │
│     - 尽可能分割 Token                                       │
│     - 标记未完成的 Token                                     │
│                                                             │
│  2. 语法分析                                                 │
│     - 构建部分 AST                                           │
│     - 错误恢复：跳到下一个同步点                               │
│     - 标记 incomplete 节点                                   │
│                                                             │
│  3. 上下文分析                                               │
│     - 根据光标位置找到 AST 节点                               │
│     - 判断当前期望的输入类型                                  │
│                                                             │
│  4. 建议生成                                                 │
│     - 根据上下文生成建议                                      │
│     - 考虑已输入的前缀过滤                                    │
│     - 按相关性排序                                           │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## 2.6 关键概念总结

| 概念 | 定义 | 在本项目中的对应 |
|------|------|-----------------|
| **Token** | 最小的有意义单元 | `src/types/token.ts` |
| **Lexer/Tokenizer** | 词法分析器 | `src/tokenizer/Tokenizer.ts` |
| **AST** | 抽象语法树 | `src/types/ast.ts` |
| **Parser** | 语法分析器 | `src/parser/Parser.ts` |
| **递归下降** | 解析方法 | Parser 中的 parseXxx 方法 |
| **语义分析** | 含义检查 | `src/validator/SyntaxValidator.ts` |

## 2.7 本章小结

在本章中，我们学习了：

- ✅ 编译/解析的基本流程
- ✅ 词法分析：将文本转换为 Token
- ✅ 语法分析：将 Token 组织为 AST
- ✅ 语义分析：检查代码含义
- ✅ 自动补全解析器的特殊需求

## 2.8 练习题

1. **分析练习**：手动分析以下 SQL 的 Token：
   ```sql
   SELECT name, age FROM users WHERE age >= 18
   ```

2. **思考题**：为什么自动补全需要"容忍错误"？

3. **设计题**：画出以下 SQL 的 AST 结构：
   ```sql
   SELECT u.name FROM users u WHERE u.age > 20
   ```

## 2.9 下一章预告

在下一章 [第3章：项目架构设计](./03-architecture.md) 中，我们将学习：

- 整体架构设计
- 模块划分和职责
- 数据流和依赖关系

---

[← 上一章：项目概述](./01-overview.md) | [📖 返回目录](./README.md) | [下一章：项目架构设计 →](./03-architecture.md)
