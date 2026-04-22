# 第9章：Schema 管理

> 🎯 **学习目标**：理解如何管理数据库元数据，为自动补全提供表和列信息

---

## 9.1 Schema 管理的作用

Schema 管理器是自动补全系统的"知识库"，它存储和提供数据库结构信息：

```
┌─────────────────────────────────────────────────────────────┐
│                   Schema 管理器的职责                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   存储的信息:                                                │
│   ┌─────────────────────────────────────────────────┐       │
│   │ • 数据库列表                                     │       │
│   │ • 表名和表结构                                   │       │
│   │ • 列名、类型、约束                               │       │
│   │ • 主键和外键关系                                 │       │
│   │ • 索引信息                                       │       │
│   │ • 内置函数定义                                   │       │
│   └─────────────────────────────────────────────────┘       │
│                                                             │
│   提供的能力:                                                │
│   ┌─────────────────────────────────────────────────┐       │
│   │ • getTable(name) → 获取表定义                    │       │
│   │ • getColumns(table) → 获取表的列                 │       │
│   │ • getAllTables() → 获取所有表                    │       │
│   │ • findForeignKeys(table) → 查找外键关系          │       │
│   │ • searchTables(prefix) → 模糊搜索表名            │       │
│   └─────────────────────────────────────────────────┘       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## 9.2 Schema 类型定义

### 9.2.1 基础类型

```typescript
// src/schema/types.ts

/**
 * 列定义
 */
export interface ColumnDefinition {
  /** 列名 */
  name: string;
  
  /** 数据类型 (如 INT, VARCHAR(255), DECIMAL(10,2)) */
  dataType: string;
  
  /** 是否可为空 */
  nullable: boolean;
  
  /** 是否是主键 */
  isPrimaryKey: boolean;
  
  /** 是否自增 */
  autoIncrement?: boolean;
  
  /** 默认值 */
  defaultValue?: string | null;
  
  /** 外键关系 */
  foreignKey?: {
    table: string;
    column: string;
  };
  
  /** 列注释 */
  comment?: string;
  
  /** 字符集 (针对字符串类型) */
  charset?: string;
  
  /** 枚举值 (针对 ENUM 类型) */
  enumValues?: string[];
}

/**
 * 索引定义
 */
export interface IndexDefinition {
  /** 索引名 */
  name: string;
  
  /** 索引列 */
  columns: string[];
  
  /** 是否唯一 */
  unique: boolean;
  
  /** 索引类型 */
  type: 'BTREE' | 'HASH' | 'FULLTEXT' | 'SPATIAL';
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
  
  /** 索引列表 */
  indexes?: IndexDefinition[];
  
  /** 主键列名 */
  primaryKey?: string[];
  
  /** 表注释 */
  comment?: string;
  
  /** 表引擎 */
  engine?: string;
  
  /** 字符集 */
  charset?: string;
}

/**
 * 函数定义
 */
export interface FunctionDefinition {
  /** 函数名 */
  name: string;
  
  /** 函数签名 */
  signature: string;
  
  /** 返回类型 */
  returnType: string;
  
  /** 描述 */
  description: string;
  
  /** 使用示例 */
  examples?: string[];
  
  /** 函数类别 */
  category: 'aggregate' | 'string' | 'numeric' | 'date' | 'control' | 'other';
}

/**
 * 数据库 Schema
 */
export interface DatabaseSchema {
  /** Schema 名称 */
  name: string;
  
  /** 表列表 */
  tables: TableDefinition[];
  
  /** 函数列表 */
  functions?: FunctionDefinition[];
}
```

## 9.3 Schema 管理器实现

### 9.3.1 核心管理器类

```typescript
// src/schema/SchemaManager.ts

import {
  TableDefinition,
  ColumnDefinition,
  FunctionDefinition,
  DatabaseSchema,
} from './types';

export class SchemaManager {
  /** 表缓存 (表名 -> 表定义) */
  private tables: Map<string, TableDefinition> = new Map();
  
  /** 函数缓存 (函数名 -> 函数定义) */
  private functions: Map<string, FunctionDefinition> = new Map();
  
  /** 当前 Schema 名称 */
  private currentSchema: string = 'default';
  
  constructor() {
    // 初始化内置函数
    this.initBuiltinFunctions();
  }
  
  // ===== 表管理 =====
  
  /**
   * 添加表定义
   */
  addTable(table: TableDefinition): void {
    // 标准化表名（小写）
    const tableName = table.name.toLowerCase();
    
    // 处理列
    const columns = table.columns.map(col => ({
      ...col,
      name: col.name,
      nullable: col.nullable ?? true,
      isPrimaryKey: col.isPrimaryKey ?? false,
    }));
    
    // 自动检测主键
    const primaryKey = table.primaryKey || 
      columns.filter(c => c.isPrimaryKey).map(c => c.name);
    
    this.tables.set(tableName, {
      ...table,
      name: tableName,
      columns,
      primaryKey,
    });
  }
  
  /**
   * 批量添加表
   */
  addTables(tables: TableDefinition[]): void {
    tables.forEach(table => this.addTable(table));
  }
  
  /**
   * 获取表定义
   */
  getTable(name: string): TableDefinition | undefined {
    return this.tables.get(name.toLowerCase());
  }
  
  /**
   * 获取所有表
   */
  getAllTables(): TableDefinition[] {
    return Array.from(this.tables.values());
  }
  
  /**
   * 搜索表名（支持前缀匹配）
   */
  searchTables(prefix: string): TableDefinition[] {
    const lowerPrefix = prefix.toLowerCase();
    return this.getAllTables().filter(table =>
      table.name.startsWith(lowerPrefix)
    );
  }
  
  /**
   * 检查表是否存在
   */
  hasTable(name: string): boolean {
    return this.tables.has(name.toLowerCase());
  }
  
  /**
   * 删除表
   */
  removeTable(name: string): boolean {
    return this.tables.delete(name.toLowerCase());
  }
  
  /**
   * 清空所有表
   */
  clearTables(): void {
    this.tables.clear();
  }
  
  // ===== 列管理 =====
  
  /**
   * 获取表的所有列
   */
  getColumns(tableName: string): ColumnDefinition[] {
    const table = this.getTable(tableName);
    return table?.columns || [];
  }
  
  /**
   * 获取指定列
   */
  getColumn(tableName: string, columnName: string): ColumnDefinition | undefined {
    const columns = this.getColumns(tableName);
    return columns.find(c => c.name.toLowerCase() === columnName.toLowerCase());
  }
  
  /**
   * 搜索列名
   */
  searchColumns(tableName: string, prefix: string): ColumnDefinition[] {
    const lowerPrefix = prefix.toLowerCase();
    return this.getColumns(tableName).filter(col =>
      col.name.toLowerCase().startsWith(lowerPrefix)
    );
  }
  
  /**
   * 获取表的主键列
   */
  getPrimaryKeyColumns(tableName: string): ColumnDefinition[] {
    return this.getColumns(tableName).filter(col => col.isPrimaryKey);
  }
  
  /**
   * 获取表的外键关系
   */
  getForeignKeys(tableName: string): Array<{
    column: ColumnDefinition;
    referencedTable: string;
    referencedColumn: string;
  }> {
    const columns = this.getColumns(tableName);
    return columns
      .filter(col => col.foreignKey)
      .map(col => ({
        column: col,
        referencedTable: col.foreignKey!.table,
        referencedColumn: col.foreignKey!.column,
      }));
  }
  
  /**
   * 查找引用指定表的外键
   */
  findReferencingTables(tableName: string): Array<{
    table: TableDefinition;
    column: ColumnDefinition;
  }> {
    const results: Array<{ table: TableDefinition; column: ColumnDefinition }> = [];
    
    this.tables.forEach(table => {
      table.columns.forEach(col => {
        if (col.foreignKey?.table.toLowerCase() === tableName.toLowerCase()) {
          results.push({ table, column: col });
        }
      });
    });
    
    return results;
  }
  
  // ===== 函数管理 =====
  
  /**
   * 添加函数定义
   */
  addFunction(func: FunctionDefinition): void {
    this.functions.set(func.name.toUpperCase(), func);
  }
  
  /**
   * 获取函数定义
   */
  getFunction(name: string): FunctionDefinition | undefined {
    return this.functions.get(name.toUpperCase());
  }
  
  /**
   * 获取所有函数
   */
  getAllFunctions(): FunctionDefinition[] {
    return Array.from(this.functions.values());
  }
  
  /**
   * 按类别获取函数
   */
  getFunctionsByCategory(category: FunctionDefinition['category']): FunctionDefinition[] {
    return this.getAllFunctions().filter(f => f.category === category);
  }
  
  /**
   * 搜索函数
   */
  searchFunctions(prefix: string): FunctionDefinition[] {
    const upperPrefix = prefix.toUpperCase();
    return this.getAllFunctions().filter(f =>
      f.name.startsWith(upperPrefix)
    );
  }
  
  // ===== 初始化内置函数 =====
  
  private initBuiltinFunctions(): void {
    // 聚合函数
    const aggregateFuncs: FunctionDefinition[] = [
      {
        name: 'COUNT',
        signature: 'COUNT(expr) / COUNT(*) / COUNT(DISTINCT expr)',
        returnType: 'INT',
        description: 'Returns a count of the number of rows',
        examples: ['COUNT(*)', 'COUNT(id)', 'COUNT(DISTINCT status)'],
        category: 'aggregate',
      },
      {
        name: 'SUM',
        signature: 'SUM(expr)',
        returnType: 'DECIMAL',
        description: 'Returns the sum of expr',
        examples: ['SUM(amount)', 'SUM(quantity * price)'],
        category: 'aggregate',
      },
      {
        name: 'AVG',
        signature: 'AVG(expr)',
        returnType: 'DECIMAL',
        description: 'Returns the average value of expr',
        examples: ['AVG(score)', 'AVG(price)'],
        category: 'aggregate',
      },
      {
        name: 'MAX',
        signature: 'MAX(expr)',
        returnType: 'varies',
        description: 'Returns the maximum value of expr',
        examples: ['MAX(price)', 'MAX(created_at)'],
        category: 'aggregate',
      },
      {
        name: 'MIN',
        signature: 'MIN(expr)',
        returnType: 'varies',
        description: 'Returns the minimum value of expr',
        examples: ['MIN(price)', 'MIN(created_at)'],
        category: 'aggregate',
      },
      {
        name: 'GROUP_CONCAT',
        signature: 'GROUP_CONCAT(expr [ORDER BY ...] [SEPARATOR str])',
        returnType: 'VARCHAR',
        description: 'Returns a concatenated string',
        examples: ["GROUP_CONCAT(name SEPARATOR ', ')"],
        category: 'aggregate',
      },
    ];
    
    // 字符串函数
    const stringFuncs: FunctionDefinition[] = [
      {
        name: 'CONCAT',
        signature: 'CONCAT(str1, str2, ...)',
        returnType: 'VARCHAR',
        description: 'Returns concatenated string',
        examples: ["CONCAT(first_name, ' ', last_name)"],
        category: 'string',
      },
      {
        name: 'SUBSTRING',
        signature: 'SUBSTRING(str, pos, [len])',
        returnType: 'VARCHAR',
        description: 'Returns a substring',
        examples: ['SUBSTRING(name, 1, 3)'],
        category: 'string',
      },
      {
        name: 'UPPER',
        signature: 'UPPER(str)',
        returnType: 'VARCHAR',
        description: 'Converts to uppercase',
        examples: ['UPPER(name)'],
        category: 'string',
      },
      {
        name: 'LOWER',
        signature: 'LOWER(str)',
        returnType: 'VARCHAR',
        description: 'Converts to lowercase',
        examples: ['LOWER(email)'],
        category: 'string',
      },
      {
        name: 'TRIM',
        signature: 'TRIM([BOTH|LEADING|TRAILING] [char] FROM str)',
        returnType: 'VARCHAR',
        description: 'Removes leading/trailing spaces',
        examples: ['TRIM(name)', "TRIM(BOTH ' ' FROM name)"],
        category: 'string',
      },
      {
        name: 'LENGTH',
        signature: 'LENGTH(str)',
        returnType: 'INT',
        description: 'Returns length in bytes',
        examples: ['LENGTH(description)'],
        category: 'string',
      },
      {
        name: 'REPLACE',
        signature: 'REPLACE(str, from_str, to_str)',
        returnType: 'VARCHAR',
        description: 'Replaces occurrences',
        examples: ["REPLACE(text, 'old', 'new')"],
        category: 'string',
      },
    ];
    
    // 日期函数
    const dateFuncs: FunctionDefinition[] = [
      {
        name: 'NOW',
        signature: 'NOW()',
        returnType: 'DATETIME',
        description: 'Returns current date and time',
        examples: ['NOW()'],
        category: 'date',
      },
      {
        name: 'CURDATE',
        signature: 'CURDATE()',
        returnType: 'DATE',
        description: 'Returns current date',
        examples: ['CURDATE()'],
        category: 'date',
      },
      {
        name: 'DATE',
        signature: 'DATE(expr)',
        returnType: 'DATE',
        description: 'Extracts date part',
        examples: ['DATE(created_at)'],
        category: 'date',
      },
      {
        name: 'YEAR',
        signature: 'YEAR(date)',
        returnType: 'INT',
        description: 'Returns year',
        examples: ['YEAR(birth_date)'],
        category: 'date',
      },
      {
        name: 'MONTH',
        signature: 'MONTH(date)',
        returnType: 'INT',
        description: 'Returns month',
        examples: ['MONTH(created_at)'],
        category: 'date',
      },
      {
        name: 'DAY',
        signature: 'DAY(date)',
        returnType: 'INT',
        description: 'Returns day of month',
        examples: ['DAY(order_date)'],
        category: 'date',
      },
      {
        name: 'DATE_FORMAT',
        signature: 'DATE_FORMAT(date, format)',
        returnType: 'VARCHAR',
        description: 'Formats date',
        examples: ["DATE_FORMAT(NOW(), '%Y-%m-%d')"],
        category: 'date',
      },
      {
        name: 'DATEDIFF',
        signature: 'DATEDIFF(date1, date2)',
        returnType: 'INT',
        description: 'Returns difference in days',
        examples: ['DATEDIFF(NOW(), created_at)'],
        category: 'date',
      },
    ];
    
    // 控制流函数
    const controlFuncs: FunctionDefinition[] = [
      {
        name: 'IF',
        signature: 'IF(condition, true_value, false_value)',
        returnType: 'varies',
        description: 'If condition is true, returns true_value',
        examples: ["IF(score > 60, 'pass', 'fail')"],
        category: 'control',
      },
      {
        name: 'IFNULL',
        signature: 'IFNULL(expr, alt_value)',
        returnType: 'varies',
        description: 'If expr is NULL, returns alt_value',
        examples: ["IFNULL(name, 'Unknown')"],
        category: 'control',
      },
      {
        name: 'COALESCE',
        signature: 'COALESCE(val1, val2, ...)',
        returnType: 'varies',
        description: 'Returns first non-NULL value',
        examples: ['COALESCE(nickname, name, email)'],
        category: 'control',
      },
      {
        name: 'NULLIF',
        signature: 'NULLIF(expr1, expr2)',
        returnType: 'varies',
        description: 'Returns NULL if expr1 = expr2',
        examples: ["NULLIF(status, 'unknown')"],
        category: 'control',
      },
      {
        name: 'CASE',
        signature: 'CASE expr WHEN val THEN result ... [ELSE default] END',
        returnType: 'varies',
        description: 'Case expression',
        examples: ["CASE status WHEN 1 THEN 'active' ELSE 'inactive' END"],
        category: 'control',
      },
    ];
    
    // 数值函数
    const numericFuncs: FunctionDefinition[] = [
      {
        name: 'ABS',
        signature: 'ABS(num)',
        returnType: 'DECIMAL',
        description: 'Returns absolute value',
        examples: ['ABS(balance)'],
        category: 'numeric',
      },
      {
        name: 'ROUND',
        signature: 'ROUND(num, [decimals])',
        returnType: 'DECIMAL',
        description: 'Rounds to specified decimals',
        examples: ['ROUND(price, 2)'],
        category: 'numeric',
      },
      {
        name: 'CEIL',
        signature: 'CEIL(num)',
        returnType: 'INT',
        description: 'Returns smallest integer >= num',
        examples: ['CEIL(4.2)'],
        category: 'numeric',
      },
      {
        name: 'FLOOR',
        signature: 'FLOOR(num)',
        returnType: 'INT',
        description: 'Returns largest integer <= num',
        examples: ['FLOOR(4.8)'],
        category: 'numeric',
      },
      {
        name: 'MOD',
        signature: 'MOD(n, m)',
        returnType: 'INT',
        description: 'Returns remainder of n/m',
        examples: ['MOD(id, 10)'],
        category: 'numeric',
      },
    ];
    
    // 注册所有函数
    [
      ...aggregateFuncs,
      ...stringFuncs,
      ...dateFuncs,
      ...controlFuncs,
      ...numericFuncs,
    ].forEach(func => this.addFunction(func));
  }
  
  // ===== 导入/导出 =====
  
  /**
   * 从 JSON 导入 Schema
   */
  importSchema(schema: DatabaseSchema): void {
    this.currentSchema = schema.name;
    
    if (schema.tables) {
      this.addTables(schema.tables);
    }
    
    if (schema.functions) {
      schema.functions.forEach(func => this.addFunction(func));
    }
  }
  
  /**
   * 导出当前 Schema
   */
  exportSchema(): DatabaseSchema {
    return {
      name: this.currentSchema,
      tables: this.getAllTables(),
      functions: this.getAllFunctions(),
    };
  }
  
  /**
   * 从 MySQL INFORMATION_SCHEMA 格式导入
   */
  importFromInformationSchema(data: {
    tables: Array<{
      TABLE_NAME: string;
      TABLE_COMMENT?: string;
    }>;
    columns: Array<{
      TABLE_NAME: string;
      COLUMN_NAME: string;
      DATA_TYPE: string;
      IS_NULLABLE: 'YES' | 'NO';
      COLUMN_KEY: string;
      COLUMN_DEFAULT?: string;
      COLUMN_COMMENT?: string;
      EXTRA?: string;
    }>;
  }): void {
    // 先按表分组列
    const columnsByTable = new Map<string, typeof data.columns>();
    data.columns.forEach(col => {
      const tableName = col.TABLE_NAME;
      if (!columnsByTable.has(tableName)) {
        columnsByTable.set(tableName, []);
      }
      columnsByTable.get(tableName)!.push(col);
    });
    
    // 创建表定义
    data.tables.forEach(tableInfo => {
      const tableName = tableInfo.TABLE_NAME;
      const columns = columnsByTable.get(tableName) || [];
      
      const tableDefinition: TableDefinition = {
        name: tableName,
        comment: tableInfo.TABLE_COMMENT,
        columns: columns.map(col => ({
          name: col.COLUMN_NAME,
          dataType: col.DATA_TYPE.toUpperCase(),
          nullable: col.IS_NULLABLE === 'YES',
          isPrimaryKey: col.COLUMN_KEY === 'PRI',
          autoIncrement: col.EXTRA?.includes('auto_increment'),
          defaultValue: col.COLUMN_DEFAULT,
          comment: col.COLUMN_COMMENT,
        })),
      };
      
      this.addTable(tableDefinition);
    });
  }
}
```

## 9.4 Schema 数据来源

### 9.4.1 静态配置

```typescript
// 手动定义 Schema
const schemaManager = new SchemaManager();

schemaManager.addTable({
  name: 'users',
  comment: '用户表',
  columns: [
    { name: 'id', dataType: 'INT', isPrimaryKey: true, autoIncrement: true, nullable: false },
    { name: 'username', dataType: 'VARCHAR(50)', nullable: false },
    { name: 'email', dataType: 'VARCHAR(255)', nullable: false },
    { name: 'created_at', dataType: 'TIMESTAMP', defaultValue: 'CURRENT_TIMESTAMP' },
  ],
});

schemaManager.addTable({
  name: 'orders',
  comment: '订单表',
  columns: [
    { name: 'id', dataType: 'INT', isPrimaryKey: true },
    { name: 'user_id', dataType: 'INT', nullable: false, foreignKey: { table: 'users', column: 'id' } },
    { name: 'total', dataType: 'DECIMAL(10,2)' },
    { name: 'status', dataType: "ENUM('pending','paid','shipped')", enumValues: ['pending', 'paid', 'shipped'] },
  ],
});
```

### 9.4.2 从数据库动态加载

```typescript
// 从 MySQL 数据库加载 Schema
async function loadSchemaFromMySQL(connection: any): Promise<void> {
  const schemaManager = new SchemaManager();
  
  // 查询所有表
  const [tables] = await connection.query(`
    SELECT TABLE_NAME, TABLE_COMMENT
    FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA = DATABASE()
  `);
  
  // 查询所有列
  const [columns] = await connection.query(`
    SELECT 
      TABLE_NAME,
      COLUMN_NAME,
      DATA_TYPE,
      IS_NULLABLE,
      COLUMN_KEY,
      COLUMN_DEFAULT,
      COLUMN_COMMENT,
      EXTRA
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
    ORDER BY TABLE_NAME, ORDINAL_POSITION
  `);
  
  // 查询外键
  const [foreignKeys] = await connection.query(`
    SELECT
      TABLE_NAME,
      COLUMN_NAME,
      REFERENCED_TABLE_NAME,
      REFERENCED_COLUMN_NAME
    FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
    WHERE TABLE_SCHEMA = DATABASE()
      AND REFERENCED_TABLE_NAME IS NOT NULL
  `);
  
  // 构建外键映射
  const fkMap = new Map<string, { table: string; column: string }>();
  foreignKeys.forEach((fk: any) => {
    const key = `${fk.TABLE_NAME}.${fk.COLUMN_NAME}`;
    fkMap.set(key, {
      table: fk.REFERENCED_TABLE_NAME,
      column: fk.REFERENCED_COLUMN_NAME,
    });
  });
  
  // 导入
  schemaManager.importFromInformationSchema({
    tables,
    columns: columns.map((col: any) => {
      const fkKey = `${col.TABLE_NAME}.${col.COLUMN_NAME}`;
      const fk = fkMap.get(fkKey);
      return {
        ...col,
        foreignKey: fk,
      };
    }),
  });
}
```

### 9.4.3 从 JSON 文件加载

```typescript
// schema.json
{
  "name": "ecommerce",
  "tables": [
    {
      "name": "users",
      "columns": [
        { "name": "id", "dataType": "INT", "isPrimaryKey": true },
        { "name": "name", "dataType": "VARCHAR(100)" }
      ]
    }
  ]
}

// 加载
import schemaJson from './schema.json';
const schemaManager = new SchemaManager();
schemaManager.importSchema(schemaJson);
```

## 9.5 外键智能推荐

利用外键关系提供智能 JOIN 建议：

```typescript
// src/schema/ForeignKeyAnalyzer.ts

export class ForeignKeyAnalyzer {
  constructor(private schemaManager: SchemaManager) {}
  
  /**
   * 推荐 JOIN 条件
   */
  suggestJoinConditions(
    table1: string, 
    table2: string
  ): Array<{
    column1: string;
    column2: string;
    type: 'direct' | 'reverse';
  }> {
    const results: Array<{
      column1: string;
      column2: string;
      type: 'direct' | 'reverse';
    }> = [];
    
    // 检查 table1 -> table2 的外键
    const fks1 = this.schemaManager.getForeignKeys(table1);
    fks1.forEach(fk => {
      if (fk.referencedTable.toLowerCase() === table2.toLowerCase()) {
        results.push({
          column1: fk.column.name,
          column2: fk.referencedColumn,
          type: 'direct',
        });
      }
    });
    
    // 检查 table2 -> table1 的外键（反向）
    const fks2 = this.schemaManager.getForeignKeys(table2);
    fks2.forEach(fk => {
      if (fk.referencedTable.toLowerCase() === table1.toLowerCase()) {
        results.push({
          column1: fk.referencedColumn,
          column2: fk.column.name,
          type: 'reverse',
        });
      }
    });
    
    return results;
  }
  
  /**
   * 查找可能的关联表
   */
  findRelatedTables(tableName: string): Array<{
    table: string;
    relationship: 'references' | 'referenced_by';
    column: string;
    relatedColumn: string;
  }> {
    const results: Array<{
      table: string;
      relationship: 'references' | 'referenced_by';
      column: string;
      relatedColumn: string;
    }> = [];
    
    // 该表引用的其他表
    const fks = this.schemaManager.getForeignKeys(tableName);
    fks.forEach(fk => {
      results.push({
        table: fk.referencedTable,
        relationship: 'references',
        column: fk.column.name,
        relatedColumn: fk.referencedColumn,
      });
    });
    
    // 引用该表的其他表
    const refs = this.schemaManager.findReferencingTables(tableName);
    refs.forEach(ref => {
      results.push({
        table: ref.table.name,
        relationship: 'referenced_by',
        column: ref.column.foreignKey!.column,
        relatedColumn: ref.column.name,
      });
    });
    
    return results;
  }
}
```

## 9.6 使用示例

```typescript
// 完整使用流程

const schemaManager = new SchemaManager();

// 1. 添加表定义
schemaManager.addTable({
  name: 'users',
  columns: [
    { name: 'id', dataType: 'INT', isPrimaryKey: true, nullable: false },
    { name: 'name', dataType: 'VARCHAR(100)', nullable: false },
    { name: 'email', dataType: 'VARCHAR(255)', nullable: false },
    { name: 'created_at', dataType: 'TIMESTAMP', nullable: true },
  ],
  comment: '用户表',
});

schemaManager.addTable({
  name: 'orders',
  columns: [
    { name: 'id', dataType: 'INT', isPrimaryKey: true, nullable: false },
    { name: 'user_id', dataType: 'INT', nullable: false, 
      foreignKey: { table: 'users', column: 'id' } },
    { name: 'total', dataType: 'DECIMAL(10,2)', nullable: true },
    { name: 'status', dataType: 'VARCHAR(20)', nullable: false },
  ],
  comment: '订单表',
});

// 2. 查询表信息
const users = schemaManager.getTable('users');
console.log(users?.columns.length); // 4

// 3. 查询列信息
const columns = schemaManager.getColumns('users');
console.log(columns.map(c => c.name)); // ['id', 'name', 'email', 'created_at']

// 4. 查询外键
const fks = schemaManager.getForeignKeys('orders');
console.log(fks); 
// [{ column: {...}, referencedTable: 'users', referencedColumn: 'id' }]

// 5. 搜索表
const matched = schemaManager.searchTables('us');
console.log(matched.map(t => t.name)); // ['users']

// 6. 获取函数
const countFunc = schemaManager.getFunction('COUNT');
console.log(countFunc?.signature); // 'COUNT(expr) / COUNT(*) / COUNT(DISTINCT expr)'

// 7. 外键分析
const fkAnalyzer = new ForeignKeyAnalyzer(schemaManager);
const joinSuggestions = fkAnalyzer.suggestJoinConditions('users', 'orders');
console.log(joinSuggestions);
// [{ column1: 'id', column2: 'user_id', type: 'reverse' }]
```

## 9.7 小结

```
┌─────────────────────────────────────────────────────────────┐
│                   Schema 管理关键点                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. 存储结构                                                 │
│     - Map<string, TableDefinition> 表缓存                   │
│     - Map<string, FunctionDefinition> 函数缓存              │
│                                                             │
│  2. 核心能力                                                 │
│     - 表/列的增删查                                          │
│     - 前缀搜索                                               │
│     - 外键关系查询                                           │
│                                                             │
│  3. 数据来源                                                 │
│     - 静态配置                                               │
│     - 数据库动态加载                                         │
│     - JSON 文件                                              │
│                                                             │
│  4. 智能功能                                                 │
│     - 外键 JOIN 推荐                                         │
│     - 关联表查找                                             │
│     - 内置函数库                                             │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 练习题

1. **缓存优化**：实现 LRU 缓存，限制内存使用
2. **增量更新**：实现 Schema 变更的增量同步
3. **多 Schema 支持**：支持跨数据库查询
4. **索引提示**：利用索引信息优化 WHERE 条件建议

---

[← 上一章：建议引擎](./08-suggestion-engine.md) | [下一章：语法验证器 →](./10-syntax-validator.md)
