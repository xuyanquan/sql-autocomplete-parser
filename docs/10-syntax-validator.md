# 第10章：语法验证器

> 🎯 **学习目标**：理解如何验证 SQL 语法正确性，并提供有意义的错误提示

---

## 10.1 语法验证的作用

语法验证器在自动补全之外提供额外的价值：

```
┌─────────────────────────────────────────────────────────────┐
│                    语法验证器的职责                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. 语法错误检测                                             │
│     - 缺少关键字                                            │
│     - 括号不匹配                                            │
│     - 语法顺序错误                                          │
│                                                             │
│  2. 语义错误检测                                             │
│     - 表名不存在                                            │
│     - 列名不存在                                            │
│     - 类型不匹配                                            │
│                                                             │
│  3. 最佳实践警告                                             │
│     - SELECT *                                              │
│     - 缺少 WHERE 的 UPDATE/DELETE                           │
│     - 可能的性能问题                                         │
│                                                             │
│  4. 智能修复建议                                             │
│     - "Did you mean...?"                                    │
│     - 自动修复选项                                           │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## 10.2 诊断类型定义

```typescript
// src/validator/types.ts

/**
 * 诊断严重程度
 */
export enum DiagnosticSeverity {
  ERROR = 'error',       // 语法错误，必须修复
  WARNING = 'warning',   // 可能的问题
  INFO = 'info',         // 信息提示
  HINT = 'hint',         // 建议优化
}

/**
 * 诊断代码（用于分类）
 */
export enum DiagnosticCode {
  // 语法错误 (1xxx)
  UNEXPECTED_TOKEN = 1001,
  MISSING_KEYWORD = 1002,
  UNMATCHED_PAREN = 1003,
  INVALID_SYNTAX = 1004,
  
  // 语义错误 (2xxx)
  UNKNOWN_TABLE = 2001,
  UNKNOWN_COLUMN = 2002,
  AMBIGUOUS_COLUMN = 2003,
  TYPE_MISMATCH = 2004,
  
  // 警告 (3xxx)
  SELECT_STAR = 3001,
  MISSING_WHERE = 3002,
  IMPLICIT_CONVERSION = 3003,
  POSSIBLE_CARTESIAN = 3004,
  
  // 提示 (4xxx)
  PREFER_EXPLICIT_JOIN = 4001,
  CONSIDER_INDEX = 4002,
}

/**
 * 修复操作
 */
export interface QuickFix {
  /** 修复标题 */
  title: string;
  
  /** 替换的文本 */
  replacement: string;
  
  /** 替换范围 */
  range: {
    start: number;
    end: number;
  };
  
  /** 是否推荐 */
  isPreferred?: boolean;
}

/**
 * 诊断信息
 */
export interface Diagnostic {
  /** 严重程度 */
  severity: DiagnosticSeverity;
  
  /** 诊断代码 */
  code: DiagnosticCode;
  
  /** 错误消息 */
  message: string;
  
  /** 详细说明 */
  detail?: string;
  
  /** 位置范围 */
  range: {
    start: number;
    end: number;
  };
  
  /** 行列位置 */
  location?: {
    line: number;
    column: number;
  };
  
  /** 快速修复选项 */
  quickFixes?: QuickFix[];
  
  /** 相关信息 */
  relatedInfo?: Array<{
    message: string;
    range: { start: number; end: number };
  }>;
}

/**
 * 验证结果
 */
export interface ValidationResult {
  /** 是否有效 */
  valid: boolean;
  
  /** 诊断列表 */
  diagnostics: Diagnostic[];
  
  /** 错误数量 */
  errorCount: number;
  
  /** 警告数量 */
  warningCount: number;
}
```

## 10.3 语法验证器实现

```typescript
// src/validator/SyntaxValidator.ts

import { Token, TokenType } from '../types/token';
import { SelectStatement } from '../types/ast';
import { SchemaManager } from '../schema/SchemaManager';
import { Tokenizer } from '../tokenizer/Tokenizer';
import { Parser } from '../parser/Parser';
import {
  Diagnostic,
  DiagnosticSeverity,
  DiagnosticCode,
  ValidationResult,
  QuickFix,
} from './types';

export class SyntaxValidator {
  private tokenizer: Tokenizer;
  private parser: Parser;
  private schemaManager: SchemaManager;
  
  constructor(schemaManager: SchemaManager) {
    this.tokenizer = new Tokenizer();
    this.parser = new Parser();
    this.schemaManager = schemaManager;
  }
  
  /**
   * 验证 SQL 语句
   */
  validate(sql: string): ValidationResult {
    const diagnostics: Diagnostic[] = [];
    
    // 1. 词法分析检查
    const tokens = this.tokenizer.tokenize(sql);
    diagnostics.push(...this.checkTokens(tokens));
    
    // 2. 语法分析检查
    const ast = this.parser.parse(sql);
    if (ast) {
      diagnostics.push(...this.checkSyntax(ast, tokens));
      
      // 3. 语义分析检查
      diagnostics.push(...this.checkSemantics(ast));
      
      // 4. 最佳实践检查
      diagnostics.push(...this.checkBestPractices(ast));
    }
    
    // 统计
    const errorCount = diagnostics.filter(
      d => d.severity === DiagnosticSeverity.ERROR
    ).length;
    const warningCount = diagnostics.filter(
      d => d.severity === DiagnosticSeverity.WARNING
    ).length;
    
    return {
      valid: errorCount === 0,
      diagnostics,
      errorCount,
      warningCount,
    };
  }
  
  // ===== 词法检查 =====
  
  private checkTokens(tokens: Token[]): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    
    // 检查未知 Token
    tokens.forEach(token => {
      if (token.type === TokenType.UNKNOWN) {
        diagnostics.push({
          severity: DiagnosticSeverity.ERROR,
          code: DiagnosticCode.UNEXPECTED_TOKEN,
          message: `Unexpected character: "${token.value}"`,
          range: { start: token.start, end: token.end },
        });
      }
    });
    
    // 检查括号匹配
    diagnostics.push(...this.checkParentheses(tokens));
    
    // 检查引号匹配
    diagnostics.push(...this.checkQuotes(tokens));
    
    return diagnostics;
  }
  
  private checkParentheses(tokens: Token[]): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const stack: Token[] = [];
    
    tokens.forEach(token => {
      if (token.type === TokenType.LPAREN) {
        stack.push(token);
      } else if (token.type === TokenType.RPAREN) {
        if (stack.length === 0) {
          diagnostics.push({
            severity: DiagnosticSeverity.ERROR,
            code: DiagnosticCode.UNMATCHED_PAREN,
            message: 'Unmatched closing parenthesis',
            range: { start: token.start, end: token.end },
          });
        } else {
          stack.pop();
        }
      }
    });
    
    // 检查未关闭的括号
    stack.forEach(token => {
      diagnostics.push({
        severity: DiagnosticSeverity.ERROR,
        code: DiagnosticCode.UNMATCHED_PAREN,
        message: 'Unclosed parenthesis',
        range: { start: token.start, end: token.end },
        quickFixes: [{
          title: 'Add closing parenthesis',
          replacement: ')',
          range: { start: tokens[tokens.length - 1]?.end || 0, end: tokens[tokens.length - 1]?.end || 0 },
        }],
      });
    });
    
    return diagnostics;
  }
  
  private checkQuotes(tokens: Token[]): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    
    tokens.forEach(token => {
      if (token.type === TokenType.STRING) {
        // 检查字符串是否正确闭合
        const value = token.value;
        if (value.length < 2 || value[0] !== value[value.length - 1]) {
          diagnostics.push({
            severity: DiagnosticSeverity.ERROR,
            code: DiagnosticCode.INVALID_SYNTAX,
            message: 'Unclosed string literal',
            range: { start: token.start, end: token.end },
          });
        }
      }
    });
    
    return diagnostics;
  }
  
  // ===== 语法检查 =====
  
  private checkSyntax(ast: SelectStatement, tokens: Token[]): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    
    // SELECT 必须有列
    if (!ast.columns || ast.columns.length === 0) {
      diagnostics.push({
        severity: DiagnosticSeverity.ERROR,
        code: DiagnosticCode.MISSING_KEYWORD,
        message: 'SELECT requires at least one column',
        range: this.findKeywordRange(tokens, TokenType.SELECT) || { start: 0, end: 6 },
      });
    }
    
    // SELECT ... FROM 的 FROM 不能为空
    if (ast.from === undefined && !ast.incomplete) {
      // 这是可以的，比如 SELECT 1+1
    } else if (ast.from?.incomplete) {
      const fromRange = this.findKeywordRange(tokens, TokenType.FROM);
      if (fromRange) {
        diagnostics.push({
          severity: DiagnosticSeverity.ERROR,
          code: DiagnosticCode.MISSING_KEYWORD,
          message: 'FROM clause is incomplete',
          range: fromRange,
        });
      }
    }
    
    // JOIN 必须有 ON（除了 CROSS JOIN）
    if (ast.joins) {
      ast.joins.forEach(join => {
        if (join.type !== 'CROSS' && !join.condition && !join.incomplete) {
          diagnostics.push({
            severity: DiagnosticSeverity.ERROR,
            code: DiagnosticCode.MISSING_KEYWORD,
            message: `${join.type} JOIN requires ON condition`,
            range: { start: 0, end: 0 }, // 需要精确定位
          });
        }
      });
    }
    
    // GROUP BY 检查
    if (ast.groupBy && ast.groupBy.length === 0) {
      diagnostics.push({
        severity: DiagnosticSeverity.ERROR,
        code: DiagnosticCode.MISSING_KEYWORD,
        message: 'GROUP BY requires at least one column',
        range: this.findKeywordRange(tokens, TokenType.GROUP) || { start: 0, end: 0 },
      });
    }
    
    return diagnostics;
  }
  
  // ===== 语义检查 =====
  
  private checkSemantics(ast: SelectStatement): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    
    // 收集查询中的所有表
    const tables = new Map<string, string>(); // alias -> tableName
    
    if (ast.from?.name) {
      const alias = ast.from.alias || ast.from.name;
      tables.set(alias, ast.from.name);
      
      // 检查表是否存在
      if (!this.schemaManager.hasTable(ast.from.name)) {
        diagnostics.push({
          severity: DiagnosticSeverity.ERROR,
          code: DiagnosticCode.UNKNOWN_TABLE,
          message: `Unknown table: "${ast.from.name}"`,
          range: { start: 0, end: 0 }, // 需要从 AST 获取位置
          quickFixes: this.suggestSimilarTables(ast.from.name),
        });
      }
    }
    
    // 检查 JOIN 的表
    ast.joins?.forEach(join => {
      if (join.table.name) {
        const alias = join.table.alias || join.table.name;
        tables.set(alias, join.table.name);
        
        if (!this.schemaManager.hasTable(join.table.name)) {
          diagnostics.push({
            severity: DiagnosticSeverity.ERROR,
            code: DiagnosticCode.UNKNOWN_TABLE,
            message: `Unknown table: "${join.table.name}"`,
            range: { start: 0, end: 0 },
            quickFixes: this.suggestSimilarTables(join.table.name),
          });
        }
      }
    });
    
    // 检查 SELECT 的列
    ast.columns.forEach(col => {
      if (col.expression.type === 'column_ref') {
        const colRef = col.expression as any;
        const colName = colRef.column;
        const tableRef = colRef.table;
        
        if (tableRef) {
          // 带表前缀的列
          const tableName = tables.get(tableRef);
          if (!tableName) {
            diagnostics.push({
              severity: DiagnosticSeverity.ERROR,
              code: DiagnosticCode.UNKNOWN_TABLE,
              message: `Unknown table or alias: "${tableRef}"`,
              range: { start: 0, end: 0 },
            });
          } else {
            // 检查列是否存在
            const column = this.schemaManager.getColumn(tableName, colName);
            if (!column) {
              diagnostics.push({
                severity: DiagnosticSeverity.ERROR,
                code: DiagnosticCode.UNKNOWN_COLUMN,
                message: `Unknown column "${colName}" in table "${tableName}"`,
                range: { start: 0, end: 0 },
                quickFixes: this.suggestSimilarColumns(tableName, colName),
              });
            }
          }
        } else {
          // 不带表前缀的列，检查是否有歧义
          const matchingTables: string[] = [];
          tables.forEach((tableName) => {
            if (this.schemaManager.getColumn(tableName, colName)) {
              matchingTables.push(tableName);
            }
          });
          
          if (matchingTables.length === 0) {
            diagnostics.push({
              severity: DiagnosticSeverity.ERROR,
              code: DiagnosticCode.UNKNOWN_COLUMN,
              message: `Unknown column: "${colName}"`,
              range: { start: 0, end: 0 },
            });
          } else if (matchingTables.length > 1) {
            diagnostics.push({
              severity: DiagnosticSeverity.ERROR,
              code: DiagnosticCode.AMBIGUOUS_COLUMN,
              message: `Ambiguous column "${colName}" - exists in multiple tables: ${matchingTables.join(', ')}`,
              range: { start: 0, end: 0 },
              quickFixes: matchingTables.map(t => {
                const alias = [...tables.entries()].find(([_, v]) => v === t)?.[0] || t;
                return {
                  title: `Use ${alias}.${colName}`,
                  replacement: `${alias}.${colName}`,
                  range: { start: 0, end: 0 },
                };
              }),
            });
          }
        }
      }
    });
    
    return diagnostics;
  }
  
  // ===== 最佳实践检查 =====
  
  private checkBestPractices(ast: SelectStatement): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    
    // 检查 SELECT *
    const hasStar = ast.columns.some(col => col.expression.type === 'star');
    if (hasStar) {
      diagnostics.push({
        severity: DiagnosticSeverity.WARNING,
        code: DiagnosticCode.SELECT_STAR,
        message: 'Avoid using SELECT * in production code',
        detail: 'Explicitly listing columns improves readability and performance',
        range: { start: 0, end: 0 },
      });
    }
    
    // 检查没有 WHERE 的 UPDATE/DELETE（如果有的话）
    // TODO: 扩展到其他语句类型
    
    // 检查隐式笛卡尔积
    if (ast.from && ast.joins && ast.joins.length > 0) {
      ast.joins.forEach(join => {
        if (join.type === 'CROSS' || !join.condition) {
          diagnostics.push({
            severity: DiagnosticSeverity.WARNING,
            code: DiagnosticCode.POSSIBLE_CARTESIAN,
            message: 'Possible Cartesian product - missing JOIN condition',
            range: { start: 0, end: 0 },
          });
        }
      });
    }
    
    // 检查 LIKE 以 % 开头（无法使用索引）
    // TODO: 遍历 WHERE 条件
    
    return diagnostics;
  }
  
  // ===== 辅助方法 =====
  
  private findKeywordRange(tokens: Token[], type: TokenType): { start: number; end: number } | null {
    const token = tokens.find(t => t.type === type);
    return token ? { start: token.start, end: token.end } : null;
  }
  
  /**
   * 建议相似的表名
   */
  private suggestSimilarTables(wrongName: string): QuickFix[] {
    const allTables = this.schemaManager.getAllTables();
    const suggestions = this.findSimilar(
      wrongName,
      allTables.map(t => t.name)
    );
    
    return suggestions.map(name => ({
      title: `Did you mean "${name}"?`,
      replacement: name,
      range: { start: 0, end: 0 },
      isPreferred: true,
    }));
  }
  
  /**
   * 建议相似的列名
   */
  private suggestSimilarColumns(tableName: string, wrongColumn: string): QuickFix[] {
    const columns = this.schemaManager.getColumns(tableName);
    const suggestions = this.findSimilar(
      wrongColumn,
      columns.map(c => c.name)
    );
    
    return suggestions.map(name => ({
      title: `Did you mean "${name}"?`,
      replacement: name,
      range: { start: 0, end: 0 },
      isPreferred: true,
    }));
  }
  
  /**
   * 使用编辑距离查找相似的名称
   */
  private findSimilar(target: string, candidates: string[], maxDistance: number = 3): string[] {
    const results: Array<{ name: string; distance: number }> = [];
    
    candidates.forEach(candidate => {
      const distance = this.levenshteinDistance(
        target.toLowerCase(),
        candidate.toLowerCase()
      );
      if (distance <= maxDistance) {
        results.push({ name: candidate, distance });
      }
    });
    
    // 按距离排序，返回前3个
    return results
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 3)
      .map(r => r.name);
  }
  
  /**
   * 计算 Levenshtein 编辑距离
   */
  private levenshteinDistance(s1: string, s2: string): number {
    const m = s1.length;
    const n = s2.length;
    
    // 创建距离矩阵
    const dp: number[][] = Array(m + 1)
      .fill(null)
      .map(() => Array(n + 1).fill(0));
    
    // 初始化
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    
    // 填充矩阵
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (s1[i - 1] === s2[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1];
        } else {
          dp[i][j] = 1 + Math.min(
            dp[i - 1][j],     // 删除
            dp[i][j - 1],     // 插入
            dp[i - 1][j - 1]  // 替换
          );
        }
      }
    }
    
    return dp[m][n];
  }
}
```

## 10.4 验证流程

```
┌─────────────────────────────────────────────────────────────┐
│                     验证流程                                 │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   输入: "SELECT * FROM usres WHERE id = 1"                  │
│                          ↑                                  │
│                     表名拼写错误                             │
│                                                             │
│   步骤 1: 词法分析                                           │
│   ┌─────────────────────────────────────────────┐           │
│   │ 检查: 未知字符、括号匹配、引号匹配          │           │
│   │ 结果: ✓ 无词法错误                          │           │
│   └─────────────────────────────────────────────┘           │
│                                                             │
│   步骤 2: 语法分析                                           │
│   ┌─────────────────────────────────────────────┐           │
│   │ 检查: SELECT 有列、FROM 有表、JOIN 有 ON    │           │
│   │ 结果: ✓ 语法正确                            │           │
│   └─────────────────────────────────────────────┘           │
│                                                             │
│   步骤 3: 语义分析                                           │
│   ┌─────────────────────────────────────────────┐           │
│   │ 检查: 表是否存在                            │           │
│   │ 发现: "usres" 不存在                        │           │
│   │ 建议: "users" (编辑距离=2)                  │           │
│   └─────────────────────────────────────────────┘           │
│                                                             │
│   步骤 4: 最佳实践                                           │
│   ┌─────────────────────────────────────────────┐           │
│   │ 警告: SELECT * 不推荐                       │           │
│   └─────────────────────────────────────────────┘           │
│                                                             │
│   输出:                                                     │
│   {                                                         │
│     valid: false,                                           │
│     diagnostics: [                                          │
│       { severity: ERROR, message: "Unknown table: usres",   │
│         quickFixes: [{ title: 'Did you mean "users"?' }] }, │
│       { severity: WARNING, message: "Avoid SELECT *" }      │
│     ]                                                       │
│   }                                                         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## 10.5 编辑距离算法详解

Levenshtein 距离是计算两个字符串相似度的经典算法：

```
计算 "usres" 和 "users" 的编辑距离:

        u  s  e  r  s
     0  1  2  3  4  5
  u  1  0  1  2  3  4
  s  2  1  0  1  2  3
  r  3  2  1  1  1  2   ← 最小操作数
  e  4  3  2  1  2  2
  s  5  4  3  2  2  2   ← 最终距离 = 2

操作: 
  usres → users (交换 r 和 e)
  
距离 = 2，足够相似，可以推荐
```

## 10.6 使用示例

```typescript
// 创建验证器
const schemaManager = new SchemaManager();
schemaManager.addTable({
  name: 'users',
  columns: [
    { name: 'id', dataType: 'INT', isPrimaryKey: true, nullable: false },
    { name: 'name', dataType: 'VARCHAR(100)', nullable: false },
    { name: 'email', dataType: 'VARCHAR(255)', nullable: false },
  ],
});

const validator = new SyntaxValidator(schemaManager);

// 示例 1: 正确的 SQL
let result = validator.validate("SELECT id, name FROM users WHERE id = 1");
console.log(result.valid); // true
console.log(result.diagnostics.length); // 0

// 示例 2: 表名拼写错误
result = validator.validate("SELECT * FROM usres");
console.log(result.valid); // false
console.log(result.diagnostics[0]);
// {
//   severity: 'error',
//   code: 2001,
//   message: 'Unknown table: "usres"',
//   quickFixes: [{ title: 'Did you mean "users"?' }]
// }

// 示例 3: 列名错误
result = validator.validate("SELECT nmae FROM users");
console.log(result.diagnostics[0]);
// {
//   severity: 'error',
//   code: 2002,
//   message: 'Unknown column "nmae" in table "users"',
//   quickFixes: [{ title: 'Did you mean "name"?' }]
// }

// 示例 4: SELECT * 警告
result = validator.validate("SELECT * FROM users");
console.log(result.valid); // true (警告不影响有效性)
console.log(result.diagnostics[0]);
// {
//   severity: 'warning',
//   code: 3001,
//   message: 'Avoid using SELECT * in production code'
// }
```

## 10.7 与编辑器集成

### 10.7.1 Monaco Editor 集成

```typescript
// 将诊断转换为 Monaco markers
function toMonacoMarkers(
  result: ValidationResult,
  model: monaco.editor.ITextModel
): monaco.editor.IMarkerData[] {
  return result.diagnostics.map(diag => {
    const startPos = model.getPositionAt(diag.range.start);
    const endPos = model.getPositionAt(diag.range.end);
    
    return {
      severity: diag.severity === DiagnosticSeverity.ERROR
        ? monaco.MarkerSeverity.Error
        : diag.severity === DiagnosticSeverity.WARNING
        ? monaco.MarkerSeverity.Warning
        : monaco.MarkerSeverity.Info,
      message: diag.message,
      startLineNumber: startPos.lineNumber,
      startColumn: startPos.column,
      endLineNumber: endPos.lineNumber,
      endColumn: endPos.column,
      code: String(diag.code),
    };
  });
}

// 实时验证
editor.onDidChangeModelContent(() => {
  const sql = editor.getValue();
  const result = validator.validate(sql);
  
  monaco.editor.setModelMarkers(
    editor.getModel()!,
    'sql-validator',
    toMonacoMarkers(result, editor.getModel()!)
  );
});
```

### 10.7.2 Code Action (Quick Fix)

```typescript
// 提供 Quick Fix
monaco.languages.registerCodeActionProvider('sql', {
  provideCodeActions(model, range, context) {
    const actions: monaco.languages.CodeAction[] = [];
    
    context.markers.forEach(marker => {
      // 从我们的缓存中找到对应的诊断
      const diag = findDiagnostic(marker);
      if (diag?.quickFixes) {
        diag.quickFixes.forEach(fix => {
          actions.push({
            title: fix.title,
            kind: 'quickfix',
            isPreferred: fix.isPreferred,
            edit: {
              edits: [{
                resource: model.uri,
                edit: {
                  range: new monaco.Range(
                    model.getPositionAt(fix.range.start).lineNumber,
                    model.getPositionAt(fix.range.start).column,
                    model.getPositionAt(fix.range.end).lineNumber,
                    model.getPositionAt(fix.range.end).column
                  ),
                  text: fix.replacement,
                },
              }],
            },
          });
        });
      }
    });
    
    return { actions, dispose: () => {} };
  },
});
```

## 10.8 小结

```
┌─────────────────────────────────────────────────────────────┐
│                   语法验证关键点                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. 多层验证                                                 │
│     - 词法层: Token 级别错误                                │
│     - 语法层: 结构和顺序错误                                │
│     - 语义层: 表/列存在性检查                               │
│     - 实践层: 最佳实践建议                                  │
│                                                             │
│  2. 智能修复                                                 │
│     - Levenshtein 编辑距离                                  │
│     - "Did you mean...?" 建议                               │
│     - 一键修复 (Quick Fix)                                  │
│                                                             │
│  3. 友好提示                                                 │
│     - 清晰的错误消息                                        │
│     - 位置信息 (行/列)                                      │
│     - 相关信息链接                                          │
│                                                             │
│  4. 编辑器集成                                               │
│     - 实时波浪线提示                                        │
│     - 悬停显示详情                                          │
│     - Code Action 快速修复                                  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 练习题

1. **扩展语义检查**：添加对 WHERE 条件中类型匹配的检查
2. **索引建议**：当 WHERE 列没有索引时给出提示
3. **SQL 注入检测**：检测可能的 SQL 注入模式
4. **性能分析**：添加 EXPLAIN 集成，分析执行计划

---

[← 上一章：Schema 管理](./09-schema-manager.md) | [下一章：测试策略 →](./11-testing.md)
