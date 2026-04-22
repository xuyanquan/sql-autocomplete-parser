# SQL Autocomplete Parser

> 🚀 从零开始构建的智能 SQL 自动补全解析器 | A TypeScript SQL autocomplete parser built from scratch

[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Vitest](https://img.shields.io/badge/Tested%20with-Vitest-green.svg)](https://vitest.dev/)

## ✨ 项目简介

这是一个用于学习编译原理的实战项目，从零开始构建一个完整的 SQL 自动补全解析器。项目不仅实现了功能完善的 SQL 解析器，还配套了详尽的教程文档，帮助你深入理解：

- � **词法分析 (Tokenization)** - 将 SQL 字符串分解为 Token 流
- 🌳 **语法分析 (Parsing)** - 构建抽象语法树 (AST)
- 🎯 **上下文分析** - 理解光标位置和用户意图
- 💡 **智能建议** - 生成上下文相关的补全建议
- ✅ **语法验证** - 检测错误并提供智能修复建议

## 🎯 核心功能

| 功能 | 描述 |
|------|------|
| 🧠 上下文感知 | 根据光标位置和 SQL 结构提供智能补全 |
| 📊 Schema 集成 | 加载数据库结构，提供准确的表名/列名建议 |
| 🔍 实时验证 | 即时语法错误检测和 "Did you mean?" 修复建议 |
| � JOIN 智能 | 自动检测外键关系，推荐 JOIN 条件 |
| 🏷️ 别名识别 | 理解并建议表和列的别名 |
| ⚡ 高性能 | <100ms 响应时间，支持残缺输入 |

## 🚀 快速开始

### 安装依赖

```bash
npm install
```

### 运行示例

```bash
# 运行示例程序
npm run example

# 或直接执行
npx ts-node src/example.ts
```

### 运行测试

```bash
# 运行所有测试
npm test

# 监视模式
npm run test:watch

# 查看覆盖率
npm run test:coverage
```

### 构建项目

```bash
npm run build
```

## 💻 基础用法

```typescript
import { SQLAutocompleteParser, SchemaManager } from './src';

// 1. 初始化 Schema 管理器
const schemaManager = new SchemaManager();
schemaManager.addTable({
  name: 'users',
  columns: [
    { name: 'id', dataType: 'INT', isPrimaryKey: true },
    { name: 'name', dataType: 'VARCHAR(100)' },
    { name: 'email', dataType: 'VARCHAR(255)' },
  ],
});

schemaManager.addTable({
  name: 'orders',
  columns: [
    { name: 'id', dataType: 'INT', isPrimaryKey: true },
    { name: 'user_id', dataType: 'INT', foreignKey: { table: 'users', column: 'id' } },
    { name: 'total', dataType: 'DECIMAL(10,2)' },
  ],
});

// 2. 创建解析器
const parser = new SQLAutocompleteParser(schemaManager);

// 3. 获取自动补全建议
const sql = 'SELECT * FROM users WHERE ';
const suggestions = parser.getSuggestions(sql, sql.length);

console.log(suggestions);
// [
//   { label: 'id', type: 'column', detail: 'INT - users' },
//   { label: 'name', type: 'column', detail: 'VARCHAR(100) - users' },
//   { label: 'email', type: 'column', detail: 'VARCHAR(255) - users' },
//   ...
// ]

// 4. 验证 SQL 语法
const validation = parser.validate(sql);
console.log(validation.valid); // true or false
console.log(validation.diagnostics); // 错误列表
```

## 📚 教程文档

本项目配套了完整的 **12 章节** 教程，从编译原理基础到完整实现：

### 第一部分：基础知识
| 章节 | 内容 |
|------|------|
| [01. 项目概述](./docs/01-overview.md) | 项目背景、目标、技术栈 |
| [02. 编译原理入门](./docs/02-compiler-basics.md) | 词法分析、语法分析基础 |
| [03. 项目架构设计](./docs/03-architecture.md) | 整体架构、模块划分 |
| [04. 类型系统设计](./docs/04-type-system.md) | TypeScript 类型定义 |

### 第二部分：核心实现
| 章节 | 内容 |
|------|------|
| [05. Tokenizer 实现](./docs/05-tokenizer.md) | 词法分析器实现 |
| [06. Parser 实现](./docs/06-parser.md) | 递归下降解析器 |
| [07. 上下文分析器](./docs/07-context-analyzer.md) | 光标位置分析 |
| [08. 建议引擎](./docs/08-suggestion-engine.md) | 智能建议生成 |

### 第三部分：进阶功能
| 章节 | 内容 |
|------|------|
| [09. Schema 管理](./docs/09-schema-manager.md) | 数据库元数据管理 |
| [10. 语法验证器](./docs/10-syntax-validator.md) | 错误检测与修复 |

### 第四部分：工程实践
| 章节 | 内容 |
|------|------|
| [11. 测试策略](./docs/11-testing.md) | 单元测试、集成测试 |
| [12. 编辑器集成](./docs/12-editor-integration.md) | Monaco Editor 集成 |

👉 **[开始学习教程](./docs/README.md)**

## 🏗️ 项目架构

```
┌─────────────────────────────────────────────────────────────┐
│                      四阶段处理管道                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   用户输入 + 光标位置                                        │
│         ↓                                                   │
│   ┌─────────────┐                                           │
│   │  Tokenizer  │  词法分析 - 分解为 Token 流                │
│   └─────────────┘                                           │
│         ↓ tokens                                            │
│   ┌─────────────┐                                           │
│   │   Parser    │  语法分析 - 构建 AST                       │
│   └─────────────┘                                           │
│         ↓ AST                                               │
│   ┌─────────────┐                                           │
│   │  Analyzer   │  上下文分析 - 确定光标位置类型              │
│   └─────────────┘                                           │
│         ↓ context                                           │
│   ┌─────────────┐                                           │
│   │   Engine    │  建议引擎 - 生成补全建议                   │
│   └─────────────┘                                           │
│         ↓                                                   │
│   补全建议列表                                               │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## 📁 项目结构

```
learn-parser/
├── docs/                     # 📚 教程文档 (12 章节)
│   ├── README.md            # 教程目录
│   └── *.md                 # 各章节文档
├── src/                      # 源代码
│   ├── types/               # TypeScript 类型定义
│   │   ├── token.ts         # Token 类型
│   │   ├── ast.ts           # AST 节点类型
│   │   └── suggestion.ts    # 建议类型
│   ├── tokenizer/           # 词法分析器
│   │   └── Tokenizer.ts     # Tokenizer 实现
│   ├── parser/              # 语法分析器
│   │   └── Parser.ts        # Parser 实现
│   ├── schema/              # Schema 管理
│   │   └── SchemaManager.ts # 数据库元数据管理
│   ├── validator/           # 语法验证
│   │   └── SyntaxValidator.ts # 验证器实现
│   ├── index.ts             # 主入口 (SQLAutocompleteParser)
│   └── example.ts           # 示例程序
├── tests/                    # 测试文件
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── README.md                 # 本文件
```

## � 开发命令

```bash
# 安装依赖
npm install

# 开发模式
npm run dev

# 运行测试
npm test

# 测试覆盖率
npm run test:coverage

# 构建
npm run build

# 代码检查
npm run lint

# 运行示例
npm run example
```

## 🎯 学习路径

根据你的目标选择学习路径：

### � 初学者路径
```
01-概述 → 02-编译原理 → 03-架构 → 05-Tokenizer → 06-Parser → 运行示例
```

### 🏃 完整学习路径
```
01 → 02 → 03 → 04 → 05 → 06 → 07 → 08 → 09 → 10 → 11 → 12
```

### ⚡ 快速上手路径
```
01-概述 → 03-架构 → 12-编辑器集成 → 按需深入
```

## 🛠️ 技术栈

| 技术 | 用途 |
|------|------|
| TypeScript | 主要编程语言 |
| Vitest | 测试框架 |
| Vite | 构建工具 |
| ESLint | 代码规范 |

## � 延伸阅读

- [编译原理 (龙书)](https://book.douban.com/subject/3296317/)
- [TypeScript 官方文档](https://www.typescriptlang.org/docs/)
- [Monaco Editor 文档](https://microsoft.github.io/monaco-editor/)

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

MIT License

---

**开始你的编译原理学习之旅吧！** 👉 [查看教程](./docs/README.md)