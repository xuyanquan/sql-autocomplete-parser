# 第8章：建议引擎

> 🎯 **学习目标**：理解如何根据上下文生成智能的自动补全建议

---

## 8.1 建议引擎概述

建议引擎是自动补全系统的最后一环，它接收上下文分析结果，输出用户需要的补全建议：

```
┌─────────────────────────────────────────────────────────────┐
│                     建议引擎的职责                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   输入                        输出                          │
│   ┌───────────────┐          ┌───────────────────────┐     │
│   │ ParseContext  │    →     │ Suggestion[]          │     │
│   │ - location    │          │ - label: "users"      │     │
│   │ - prefix      │          │ - type: "table"       │     │
│   │ - tables      │          │ - sortOrder: 1        │     │
│   │ - columns     │          │ - ...                 │     │
│   └───────────────┘          └───────────────────────┘     │
│                                                             │
│   核心任务:                                                  │
│   1. 根据位置确定应该提示什么类型                            │
│   2. 从 Schema 和上下文获取候选项                           │
│   3. 使用前缀过滤候选项                                      │
│   4. 排序并返回最相关的建议                                  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## 8.2 建议类型定义

### 8.2.1 建议项结构

```typescript
// src/suggestion/types.ts

/**
 * 建议类型枚举
 */
export enum SuggestionType {
  KEYWORD = 'keyword',       // SQL 关键字
  TABLE = 'table',           // 表名
  COLUMN = 'column',         // 列名
  FUNCTION = 'function',     // 函数
  ALIAS = 'alias',           // 别名
  OPERATOR = 'operator',     // 运算符
  SNIPPET = 'snippet',       // 代码片段
  VALUE = 'value',           // 值（如枚举值）
}

/**
 * 单个建议项
 */
export interface Suggestion {
  /** 建议类型 */
  type: SuggestionType;
  
  /** 显示标签 */
  label: string;
  
  /** 插入文本 */
  insertText: string;
  
  /** 详细信息（显示在右侧） */
  detail?: string;
  
  /** 文档说明（显示在弹出框） */
  documentation?: string;
  
  /** 排序优先级（数字越小越靠前） */
  sortOrder: number;
  
  /** 图标类型（用于 UI 显示） */
  icon?: string;
  
  /** 是否在插入后触发下一次补全 */
  triggerNextCompletion?: boolean;
  
  /** 额外元数据 */
  metadata?: {
    dataType?: string;
    tableName?: string;
    isPrimaryKey?: boolean;
    isForeignKey?: boolean;
    isNullable?: boolean;
  };
}

/**
 * 建议结果
 */
export interface SuggestionResult {
  /** 建议列表 */
  suggestions: Suggestion[];
  
  /** 是否完整（false 表示被截断） */
  isComplete: boolean;
  
  /** 替换范围 */
  replaceRange?: {
    start: number;
    end: number;
  };
  
  /** 调试信息 */
  debug?: {
    location: string;
    prefix: string;
    candidateCount: number;
  };
}
```

## 8.3 建议引擎实现

### 8.3.1 核心引擎类

```typescript
// src/suggestion/SuggestionEngine.ts

import { ParseContext, ContextLocation } from '../context/types';
import { SchemaManager } from '../schema/SchemaManager';
import { Suggestion, SuggestionType, SuggestionResult } from './types';

export class SuggestionEngine {
  private schemaManager: SchemaManager;
  private maxSuggestions: number = 50;
  
  constructor(schemaManager: SchemaManager) {
    this.schemaManager = schemaManager;
  }
  
  /**
   * 根据上下文生成建议
   */
  getSuggestions(context: ParseContext): SuggestionResult {
    let suggestions: Suggestion[] = [];
    
    // 根据位置类型生成候选
    switch (context.location) {
      case ContextLocation.STATEMENT_START:
        suggestions = this.getStatementStartSuggestions();
        break;
        
      case ContextLocation.SELECT_CLAUSE:
        suggestions = this.getSelectClauseSuggestions(context);
        break;
        
      case ContextLocation.FROM_CLAUSE:
        suggestions = this.getFromClauseSuggestions(context);
        break;
        
      case ContextLocation.JOIN_TABLE:
        suggestions = this.getJoinTableSuggestions(context);
        break;
        
      case ContextLocation.JOIN_CONDITION:
        suggestions = this.getJoinConditionSuggestions(context);
        break;
        
      case ContextLocation.WHERE_CLAUSE:
        suggestions = this.getWhereClauseSuggestions(context);
        break;
        
      case ContextLocation.WHERE_OPERATOR:
        suggestions = this.getOperatorSuggestions();
        break;
        
      case ContextLocation.WHERE_VALUE:
        suggestions = this.getValueSuggestions(context);
        break;
        
      case ContextLocation.GROUP_BY:
      case ContextLocation.ORDER_BY:
        suggestions = this.getGroupOrderBySuggestions(context);
        break;
        
      case ContextLocation.DOT_ACCESS:
        suggestions = this.getDotAccessSuggestions(context);
        break;
        
      case ContextLocation.FUNCTION_ARGS:
        suggestions = this.getFunctionArgsSuggestions(context);
        break;
        
      default:
        suggestions = this.getDefaultSuggestions(context);
    }
    
    // 应用前缀过滤
    if (context.prefix) {
      suggestions = this.filterByPrefix(suggestions, context.prefix);
    }
    
    // 排序
    suggestions = this.sortSuggestions(suggestions);
    
    // 截断
    const isComplete = suggestions.length <= this.maxSuggestions;
    suggestions = suggestions.slice(0, this.maxSuggestions);
    
    return {
      suggestions,
      isComplete,
      replaceRange: this.calculateReplaceRange(context),
      debug: {
        location: context.location,
        prefix: context.prefix,
        candidateCount: suggestions.length,
      },
    };
  }
  
  /**
   * 语句开始处的建议
   */
  private getStatementStartSuggestions(): Suggestion[] {
    return [
      this.createKeywordSuggestion('SELECT', 1, 'Query data from tables'),
      this.createKeywordSuggestion('INSERT', 2, 'Insert new records'),
      this.createKeywordSuggestion('UPDATE', 3, 'Update existing records'),
      this.createKeywordSuggestion('DELETE', 4, 'Delete records'),
      this.createKeywordSuggestion('CREATE', 5, 'Create database objects'),
      this.createKeywordSuggestion('ALTER', 6, 'Modify database objects'),
      this.createKeywordSuggestion('DROP', 7, 'Delete database objects'),
      
      // 代码片段
      this.createSnippet(
        'SELECT FROM',
        'SELECT ${1:*} FROM ${2:table}',
        8,
        'Basic SELECT statement'
      ),
      this.createSnippet(
        'SELECT WHERE',
        'SELECT ${1:*} FROM ${2:table} WHERE ${3:condition}',
        9,
        'SELECT with WHERE clause'
      ),
    ];
  }
  
  /**
   * SELECT 子句建议
   */
  private getSelectClauseSuggestions(context: ParseContext): Suggestion[] {
    const suggestions: Suggestion[] = [];
    
    // 星号
    suggestions.push({
      type: SuggestionType.KEYWORD,
      label: '*',
      insertText: '*',
      detail: 'All columns',
      sortOrder: 1,
    });
    
    // DISTINCT
    suggestions.push(
      this.createKeywordSuggestion('DISTINCT', 2, 'Remove duplicates')
    );
    
    // 如果已经有 FROM，提示可用列
    if (context.availableColumns.length > 0) {
      context.availableColumns.forEach((col, index) => {
        suggestions.push(this.createColumnSuggestion(col, 10 + index));
      });
    }
    
    // 聚合函数
    suggestions.push(...this.getAggregateFunctions(50));
    
    // 表名前缀（用于 table.*）
    context.availableTables.forEach((table, name) => {
      suggestions.push({
        type: SuggestionType.TABLE,
        label: table.alias || name,
        insertText: (table.alias || name) + '.',
        detail: `${name} (table)`,
        sortOrder: 100,
        triggerNextCompletion: true, // 输入后继续补全列名
      });
    });
    
    return suggestions;
  }
  
  /**
   * FROM 子句建议
   */
  private getFromClauseSuggestions(context: ParseContext): Suggestion[] {
    const suggestions: Suggestion[] = [];
    
    // 所有表名
    const tables = this.schemaManager.getAllTables();
    tables.forEach((table, index) => {
      suggestions.push({
        type: SuggestionType.TABLE,
        label: table.name,
        insertText: table.name,
        detail: table.comment || `Table with ${table.columns.length} columns`,
        documentation: this.formatTableDoc(table),
        sortOrder: index + 1,
        metadata: {
          tableName: table.name,
        },
      });
    });
    
    // 子查询片段
    suggestions.push(this.createSnippet(
      '(SELECT ...)',
      '(SELECT ${1:*} FROM ${2:table}) AS ${3:subquery}',
      100,
      'Subquery'
    ));
    
    return suggestions;
  }
  
  /**
   * JOIN 表名建议
   */
  private getJoinTableSuggestions(context: ParseContext): Suggestion[] {
    const suggestions: Suggestion[] = [];
    
    // 排除已经在查询中的表
    const usedTables = new Set<string>();
    context.availableTables.forEach((_, name) => usedTables.add(name));
    
    const tables = this.schemaManager.getAllTables();
    tables.forEach((table, index) => {
      // 已使用的表降低优先级
      const sortOrder = usedTables.has(table.name) ? 100 + index : index + 1;
      
      suggestions.push({
        type: SuggestionType.TABLE,
        label: table.name,
        insertText: table.name,
        detail: usedTables.has(table.name) 
          ? '(already in query)' 
          : `Join with ${table.name}`,
        sortOrder,
      });
    });
    
    return suggestions;
  }
  
  /**
   * JOIN 条件建议
   */
  private getJoinConditionSuggestions(context: ParseContext): Suggestion[] {
    const suggestions: Suggestion[] = [];
    
    // 智能推荐：基于外键关系
    const foreignKeyConditions = this.detectForeignKeyConditions(context);
    foreignKeyConditions.forEach((cond, index) => {
      suggestions.push({
        type: SuggestionType.SNIPPET,
        label: cond.label,
        insertText: cond.insertText,
        detail: 'Foreign key relationship',
        sortOrder: index + 1,
        icon: '🔗',
      });
    });
    
    // 所有可用的列
    context.availableColumns.forEach((col, index) => {
      const prefix = context.aliases.size > 0 
        ? this.getAliasForTable(context, col.table) + '.'
        : '';
      
      suggestions.push({
        type: SuggestionType.COLUMN,
        label: prefix + col.name,
        insertText: prefix + col.name,
        detail: `${col.dataType} - ${col.table}`,
        sortOrder: 50 + index,
      });
    });
    
    return suggestions;
  }
  
  /**
   * WHERE 子句建议
   */
  private getWhereClauseSuggestions(context: ParseContext): Suggestion[] {
    const suggestions: Suggestion[] = [];
    
    // 列名
    context.availableColumns.forEach((col, index) => {
      suggestions.push(this.createColumnSuggestion(col, index + 1));
    });
    
    // 带表前缀的列名
    context.availableTables.forEach((table, tableName) => {
      const alias = table.alias || tableName;
      table.columns.forEach((col, index) => {
        suggestions.push({
          type: SuggestionType.COLUMN,
          label: `${alias}.${col.name}`,
          insertText: `${alias}.${col.name}`,
          detail: `${col.dataType} - ${tableName}`,
          sortOrder: 100 + index,
        });
      });
    });
    
    // 逻辑关键字
    suggestions.push(
      this.createKeywordSuggestion('AND', 200, 'Logical AND'),
      this.createKeywordSuggestion('OR', 201, 'Logical OR'),
      this.createKeywordSuggestion('NOT', 202, 'Logical NOT'),
      this.createKeywordSuggestion('EXISTS', 203, 'Subquery exists'),
      this.createKeywordSuggestion('IN', 204, 'Value in list'),
      this.createKeywordSuggestion('BETWEEN', 205, 'Range check'),
      this.createKeywordSuggestion('LIKE', 206, 'Pattern matching'),
      this.createKeywordSuggestion('IS NULL', 207, 'Null check'),
      this.createKeywordSuggestion('IS NOT NULL', 208, 'Not null check'),
    );
    
    // 函数
    suggestions.push(...this.getCommonFunctions(250));
    
    return suggestions;
  }
  
  /**
   * 运算符建议
   */
  private getOperatorSuggestions(): Suggestion[] {
    return [
      { type: SuggestionType.OPERATOR, label: '=', insertText: '= ', detail: 'Equal', sortOrder: 1 },
      { type: SuggestionType.OPERATOR, label: '!=', insertText: '!= ', detail: 'Not equal', sortOrder: 2 },
      { type: SuggestionType.OPERATOR, label: '<>', insertText: '<> ', detail: 'Not equal', sortOrder: 3 },
      { type: SuggestionType.OPERATOR, label: '>', insertText: '> ', detail: 'Greater than', sortOrder: 4 },
      { type: SuggestionType.OPERATOR, label: '<', insertText: '< ', detail: 'Less than', sortOrder: 5 },
      { type: SuggestionType.OPERATOR, label: '>=', insertText: '>= ', detail: 'Greater or equal', sortOrder: 6 },
      { type: SuggestionType.OPERATOR, label: '<=', insertText: '<= ', detail: 'Less or equal', sortOrder: 7 },
      { type: SuggestionType.OPERATOR, label: 'LIKE', insertText: 'LIKE ', detail: 'Pattern match', sortOrder: 8 },
      { type: SuggestionType.OPERATOR, label: 'IN', insertText: 'IN (', detail: 'In list', sortOrder: 9 },
      { type: SuggestionType.OPERATOR, label: 'BETWEEN', insertText: 'BETWEEN ', detail: 'Range', sortOrder: 10 },
      { type: SuggestionType.OPERATOR, label: 'IS NULL', insertText: 'IS NULL', detail: 'Is null', sortOrder: 11 },
      { type: SuggestionType.OPERATOR, label: 'IS NOT NULL', insertText: 'IS NOT NULL', detail: 'Is not null', sortOrder: 12 },
    ];
  }
  
  /**
   * DOT 访问建议（table. 后面）
   */
  private getDotAccessSuggestions(context: ParseContext): Suggestion[] {
    const suggestions: Suggestion[] = [];
    
    // 找到 DOT 前面的标识符
    const tableName = this.getTableBeforeDot(context);
    if (!tableName) return suggestions;
    
    // 解析别名
    const realTableName = context.aliases.get(tableName) || tableName;
    const tableInfo = context.availableTables.get(realTableName);
    
    if (tableInfo) {
      // 星号
      suggestions.push({
        type: SuggestionType.KEYWORD,
        label: '*',
        insertText: '*',
        detail: `All columns from ${realTableName}`,
        sortOrder: 1,
      });
      
      // 该表的所有列
      tableInfo.columns.forEach((col, index) => {
        suggestions.push({
          type: SuggestionType.COLUMN,
          label: col.name,
          insertText: col.name,
          detail: col.dataType,
          documentation: this.formatColumnDoc(col, realTableName),
          sortOrder: index + 2,
          metadata: {
            dataType: col.dataType,
            tableName: realTableName,
            isPrimaryKey: col.isPrimaryKey,
            isForeignKey: !!col.foreignKey,
          },
        });
      });
    }
    
    return suggestions;
  }
  
  /**
   * GROUP BY / ORDER BY 建议
   */
  private getGroupOrderBySuggestions(context: ParseContext): Suggestion[] {
    const suggestions: Suggestion[] = [];
    
    // SELECT 中已出现的列（优先推荐）
    // TODO: 从 AST 中提取 SELECT 列
    
    // 所有可用列
    context.availableColumns.forEach((col, index) => {
      suggestions.push(this.createColumnSuggestion(col, index + 1));
    });
    
    // ORDER BY 特有：方向
    if (context.location === ContextLocation.ORDER_BY) {
      suggestions.push(
        this.createKeywordSuggestion('ASC', 100, 'Ascending order'),
        this.createKeywordSuggestion('DESC', 101, 'Descending order'),
      );
    }
    
    return suggestions;
  }
  
  // ===== 辅助方法 =====
  
  /**
   * 创建关键字建议
   */
  private createKeywordSuggestion(
    keyword: string, 
    sortOrder: number, 
    detail?: string
  ): Suggestion {
    return {
      type: SuggestionType.KEYWORD,
      label: keyword,
      insertText: keyword + ' ',
      detail,
      sortOrder,
      icon: '🔑',
    };
  }
  
  /**
   * 创建列建议
   */
  private createColumnSuggestion(
    col: { name: string; table: string; dataType: string },
    sortOrder: number
  ): Suggestion {
    return {
      type: SuggestionType.COLUMN,
      label: col.name,
      insertText: col.name,
      detail: `${col.dataType} - ${col.table}`,
      sortOrder,
      icon: '📊',
    };
  }
  
  /**
   * 创建代码片段建议
   */
  private createSnippet(
    label: string,
    insertText: string,
    sortOrder: number,
    detail?: string
  ): Suggestion {
    return {
      type: SuggestionType.SNIPPET,
      label,
      insertText,
      detail,
      sortOrder,
      icon: '📝',
    };
  }
  
  /**
   * 获取聚合函数
   */
  private getAggregateFunctions(startOrder: number): Suggestion[] {
    const funcs = [
      { name: 'COUNT', sig: 'COUNT(expr)', desc: 'Count rows' },
      { name: 'SUM', sig: 'SUM(expr)', desc: 'Sum values' },
      { name: 'AVG', sig: 'AVG(expr)', desc: 'Average value' },
      { name: 'MAX', sig: 'MAX(expr)', desc: 'Maximum value' },
      { name: 'MIN', sig: 'MIN(expr)', desc: 'Minimum value' },
      { name: 'GROUP_CONCAT', sig: 'GROUP_CONCAT(expr)', desc: 'Concatenate values' },
    ];
    
    return funcs.map((f, i) => ({
      type: SuggestionType.FUNCTION,
      label: f.name,
      insertText: f.name + '(${1:})',
      detail: f.sig,
      documentation: f.desc,
      sortOrder: startOrder + i,
      icon: 'ƒ',
    }));
  }
  
  /**
   * 获取常用函数
   */
  private getCommonFunctions(startOrder: number): Suggestion[] {
    const funcs = [
      { name: 'CONCAT', sig: 'CONCAT(str1, str2, ...)', desc: 'Concatenate strings' },
      { name: 'SUBSTRING', sig: 'SUBSTRING(str, pos, len)', desc: 'Extract substring' },
      { name: 'UPPER', sig: 'UPPER(str)', desc: 'Convert to uppercase' },
      { name: 'LOWER', sig: 'LOWER(str)', desc: 'Convert to lowercase' },
      { name: 'TRIM', sig: 'TRIM(str)', desc: 'Remove whitespace' },
      { name: 'LENGTH', sig: 'LENGTH(str)', desc: 'String length' },
      { name: 'NOW', sig: 'NOW()', desc: 'Current timestamp' },
      { name: 'DATE', sig: 'DATE(datetime)', desc: 'Extract date' },
      { name: 'YEAR', sig: 'YEAR(date)', desc: 'Extract year' },
      { name: 'MONTH', sig: 'MONTH(date)', desc: 'Extract month' },
      { name: 'COALESCE', sig: 'COALESCE(val1, val2, ...)', desc: 'First non-null value' },
      { name: 'IFNULL', sig: 'IFNULL(expr, alt)', desc: 'Replace null' },
      { name: 'CAST', sig: 'CAST(expr AS type)', desc: 'Type conversion' },
    ];
    
    return funcs.map((f, i) => ({
      type: SuggestionType.FUNCTION,
      label: f.name,
      insertText: f.name + '(${1:})',
      detail: f.sig,
      documentation: f.desc,
      sortOrder: startOrder + i,
      icon: 'ƒ',
    }));
  }
  
  /**
   * 前缀过滤
   */
  private filterByPrefix(suggestions: Suggestion[], prefix: string): Suggestion[] {
    const lowerPrefix = prefix.toLowerCase();
    
    return suggestions.filter(s => {
      const label = s.label.toLowerCase();
      // 前缀匹配
      if (label.startsWith(lowerPrefix)) return true;
      // 模糊匹配（包含）
      if (label.includes(lowerPrefix)) return true;
      // 驼峰/下划线缩写匹配
      if (this.matchesCamelCase(s.label, prefix)) return true;
      return false;
    }).map(s => {
      // 调整排序：精确前缀匹配优先
      const label = s.label.toLowerCase();
      if (label.startsWith(lowerPrefix)) {
        return { ...s, sortOrder: s.sortOrder - 1000 };
      }
      return s;
    });
  }
  
  /**
   * 驼峰/下划线缩写匹配
   * 例如: "uc" 匹配 "user_count" 或 "UserCount"
   */
  private matchesCamelCase(text: string, abbrev: string): boolean {
    // 提取首字母
    const parts = text.split(/[_\s]|(?=[A-Z])/);
    const initials = parts.map(p => p[0]?.toLowerCase() || '').join('');
    return initials.startsWith(abbrev.toLowerCase());
  }
  
  /**
   * 排序建议
   */
  private sortSuggestions(suggestions: Suggestion[]): Suggestion[] {
    return suggestions.sort((a, b) => {
      // 首先按 sortOrder
      if (a.sortOrder !== b.sortOrder) {
        return a.sortOrder - b.sortOrder;
      }
      // 其次按类型优先级
      const typePriority: Record<SuggestionType, number> = {
        [SuggestionType.COLUMN]: 1,
        [SuggestionType.TABLE]: 2,
        [SuggestionType.FUNCTION]: 3,
        [SuggestionType.KEYWORD]: 4,
        [SuggestionType.OPERATOR]: 5,
        [SuggestionType.SNIPPET]: 6,
        [SuggestionType.ALIAS]: 7,
        [SuggestionType.VALUE]: 8,
      };
      return (typePriority[a.type] || 99) - (typePriority[b.type] || 99);
    });
  }
  
  /**
   * 计算替换范围
   */
  private calculateReplaceRange(context: ParseContext): { start: number; end: number } | undefined {
    if (context.currentToken) {
      return {
        start: context.currentToken.start,
        end: context.currentToken.end,
      };
    }
    // 如果没有当前 Token，替换位置就是光标位置
    return {
      start: context.cursorPosition,
      end: context.cursorPosition,
    };
  }
  
  /**
   * 检测外键关系并生成 JOIN 条件
   */
  private detectForeignKeyConditions(context: ParseContext): Array<{
    label: string;
    insertText: string;
  }> {
    const conditions: Array<{ label: string; insertText: string }> = [];
    
    // 遍历所有表的所有列，查找外键
    context.availableTables.forEach((table, tableName) => {
      const alias1 = table.alias || tableName;
      
      table.columns.forEach(col => {
        if (col.foreignKey) {
          // 找到外键引用的表
          const refTableName = col.foreignKey.table;
          const refColumn = col.foreignKey.column;
          
          // 检查引用的表是否也在查询中
          const refTable = context.availableTables.get(refTableName);
          if (refTable) {
            const alias2 = refTable.alias || refTableName;
            const label = `${alias1}.${col.name} = ${alias2}.${refColumn}`;
            conditions.push({
              label,
              insertText: label,
            });
          }
        }
      });
    });
    
    return conditions;
  }
  
  /**
   * 获取表的别名
   */
  private getAliasForTable(context: ParseContext, tableName: string): string {
    for (const [alias, table] of context.aliases) {
      if (table === tableName) return alias;
    }
    return tableName;
  }
  
  /**
   * 获取 DOT 前的表名
   */
  private getTableBeforeDot(context: ParseContext): string | null {
    if (context.previousToken?.type === 'DOT') {
      // TODO: 需要追溯到 DOT 之前的标识符
      // 这里简化处理，从 tokens 中查找
    }
    return null;
  }
  
  /**
   * 格式化表文档
   */
  private formatTableDoc(table: { name: string; columns: any[]; comment?: string }): string {
    let doc = `**${table.name}**\n\n`;
    if (table.comment) {
      doc += `${table.comment}\n\n`;
    }
    doc += `Columns:\n`;
    table.columns.slice(0, 5).forEach(col => {
      doc += `- ${col.name}: ${col.dataType}\n`;
    });
    if (table.columns.length > 5) {
      doc += `- ... and ${table.columns.length - 5} more\n`;
    }
    return doc;
  }
  
  /**
   * 格式化列文档
   */
  private formatColumnDoc(col: any, tableName: string): string {
    let doc = `**${col.name}**\n\n`;
    doc += `Type: ${col.dataType}\n`;
    doc += `Table: ${tableName}\n`;
    if (col.isPrimaryKey) doc += `🔑 Primary Key\n`;
    if (col.foreignKey) doc += `🔗 Foreign Key → ${col.foreignKey.table}.${col.foreignKey.column}\n`;
    if (col.comment) doc += `\n${col.comment}`;
    return doc;
  }
  
  /**
   * 默认建议（当位置不确定时）
   */
  private getDefaultSuggestions(context: ParseContext): Suggestion[] {
    // 返回一些通用建议
    return [
      ...this.getStatementStartSuggestions().slice(0, 5),
      ...this.getCommonFunctions(50).slice(0, 5),
    ];
  }
  
  /**
   * 值建议（WHERE value 位置）
   */
  private getValueSuggestions(context: ParseContext): Suggestion[] {
    const suggestions: Suggestion[] = [];
    
    // 子查询
    suggestions.push(this.createSnippet(
      '(SELECT ...)',
      '(SELECT ${1:column} FROM ${2:table})',
      1,
      'Subquery'
    ));
    
    // 占位符
    suggestions.push({
      type: SuggestionType.VALUE,
      label: '?',
      insertText: '?',
      detail: 'Parameter placeholder',
      sortOrder: 2,
    });
    
    // NULL
    suggestions.push(
      this.createKeywordSuggestion('NULL', 3, 'Null value')
    );
    
    // 函数
    suggestions.push(...this.getCommonFunctions(10).slice(0, 5));
    
    return suggestions;
  }
  
  /**
   * 函数参数建议
   */
  private getFunctionArgsSuggestions(context: ParseContext): Suggestion[] {
    const suggestions: Suggestion[] = [];
    
    // 列名
    context.availableColumns.forEach((col, index) => {
      suggestions.push(this.createColumnSuggestion(col, index + 1));
    });
    
    // 星号（用于 COUNT(*)）
    suggestions.push({
      type: SuggestionType.KEYWORD,
      label: '*',
      insertText: '*',
      detail: 'All rows',
      sortOrder: 0,
    });
    
    // DISTINCT
    suggestions.push(
      this.createKeywordSuggestion('DISTINCT', 1, 'Distinct values')
    );
    
    return suggestions;
  }
}
```

## 8.4 建议生成流程

```
┌─────────────────────────────────────────────────────────────┐
│                    建议生成流程                              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   输入: ParseContext                                         │
│   ┌──────────────────────────────────────┐                  │
│   │ location: WHERE_CLAUSE               │                  │
│   │ prefix: "na"                         │                  │
│   │ availableColumns: [id, name, email]  │                  │
│   └──────────────────────────────────────┘                  │
│                                                             │
│   步骤 1: 根据 location 生成候选                              │
│   ┌──────────────────────────────────────┐                  │
│   │ 候选: [id, name, email, AND, OR, ...] │                  │
│   │ 数量: 20                              │                  │
│   └──────────────────────────────────────┘                  │
│                                                             │
│   步骤 2: 前缀过滤 (prefix = "na")                           │
│   ┌──────────────────────────────────────┐                  │
│   │ 过滤后: [name]                        │                  │
│   │ 数量: 1                               │                  │
│   └──────────────────────────────────────┘                  │
│                                                             │
│   步骤 3: 排序                                               │
│   ┌──────────────────────────────────────┐                  │
│   │ 精确匹配优先, 类型优先级次之           │                  │
│   └──────────────────────────────────────┘                  │
│                                                             │
│   步骤 4: 截断并返回                                         │
│   ┌──────────────────────────────────────┐                  │
│   │ suggestions: [{ label: "name", ... }] │                  │
│   │ isComplete: true                      │                  │
│   └──────────────────────────────────────┘                  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## 8.5 智能排序策略

### 8.5.1 排序因素

```typescript
/**
 * 高级排序策略
 */
class SuggestionSorter {
  sort(suggestions: Suggestion[], context: ParseContext): Suggestion[] {
    return suggestions.sort((a, b) => {
      // 1. 前缀精确匹配
      const aExact = a.label.toLowerCase().startsWith(context.prefix.toLowerCase());
      const bExact = b.label.toLowerCase().startsWith(context.prefix.toLowerCase());
      if (aExact !== bExact) return aExact ? -1 : 1;
      
      // 2. 使用频率（如果有历史数据）
      // const aFreq = this.getUsageFrequency(a.label);
      // const bFreq = this.getUsageFrequency(b.label);
      // if (aFreq !== bFreq) return bFreq - aFreq;
      
      // 3. 相关性（同表的列优先）
      if (a.metadata?.tableName && b.metadata?.tableName) {
        // 如果有主表，主表的列优先
      }
      
      // 4. 类型优先级
      const typePriority = {
        column: 1,
        table: 2,
        function: 3,
        keyword: 4,
        snippet: 5,
      };
      
      // 5. sortOrder
      return a.sortOrder - b.sortOrder;
    });
  }
}
```

### 8.5.2 上下文感知排序

```typescript
/**
 * 根据上下文调整排序
 */
function contextAwareSort(suggestions: Suggestion[], context: ParseContext): Suggestion[] {
  // JOIN ON 后面：外键列优先
  if (context.location === ContextLocation.JOIN_CONDITION) {
    return suggestions.sort((a, b) => {
      if (a.metadata?.isForeignKey && !b.metadata?.isForeignKey) return -1;
      if (!a.metadata?.isForeignKey && b.metadata?.isForeignKey) return 1;
      return a.sortOrder - b.sortOrder;
    });
  }
  
  // WHERE 后面：索引列优先（如果有索引信息）
  // ...
  
  return suggestions;
}
```

## 8.6 使用示例

```typescript
// 完整使用流程

const schemaManager = new SchemaManager();
schemaManager.addTable({
  name: 'users',
  columns: [
    { name: 'id', dataType: 'INT', isPrimaryKey: true },
    { name: 'name', dataType: 'VARCHAR(100)' },
    { name: 'email', dataType: 'VARCHAR(255)' },
  ]
});

const contextAnalyzer = new ContextAnalyzer(schemaManager);
const suggestionEngine = new SuggestionEngine(schemaManager);

// 用户输入
const sql = "SELECT * FROM users WHERE na";
const cursorPosition = sql.length;

// 分析上下文
const context = contextAnalyzer.analyze(sql, cursorPosition);
console.log(context.location); // WHERE_CLAUSE
console.log(context.prefix);   // "na"

// 生成建议
const result = suggestionEngine.getSuggestions(context);
console.log(result.suggestions);
// [
//   { label: "name", type: "column", detail: "VARCHAR(100) - users" }
// ]
```

## 8.7 小结

```
┌─────────────────────────────────────────────────────────────┐
│                    建议引擎关键点                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. 分类型生成候选                                           │
│     - 根据 location 确定候选类型                             │
│     - 关键字、表名、列名、函数、片段                         │
│                                                             │
│  2. 智能过滤                                                 │
│     - 前缀匹配                                               │
│     - 模糊匹配                                               │
│     - 缩写匹配（驼峰/下划线）                                │
│                                                             │
│  3. 智能排序                                                 │
│     - 精确匹配优先                                           │
│     - 类型优先级                                             │
│     - 上下文相关性                                           │
│     - 使用频率（可选）                                       │
│                                                             │
│  4. 丰富的元数据                                             │
│     - 类型信息                                               │
│     - 文档说明                                               │
│     - 外键关系                                               │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 练习题

1. **添加函数签名提示**：当用户输入函数名后，提示函数的参数签名
2. **历史记录排序**：记录用户选择的建议，提升常用项的优先级
3. **智能 JOIN 建议**：根据外键自动推荐 JOIN 条件
4. **枚举值提示**：当列是 ENUM 类型时，提示可选值

---

[← 上一章：上下文分析器](./07-context-analyzer.md) | [下一章：Schema 管理 →](./09-schema-manager.md)
