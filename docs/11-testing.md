# 第11章：测试策略

> 🎯 **学习目标**：掌握如何为 SQL 解析器编写全面的测试用例

---

## 11.1 测试金字塔

```
┌─────────────────────────────────────────────────────────────┐
│                     测试金字塔                               │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│                        /\                                   │
│                       /  \     E2E 测试                     │
│                      /    \    (少量)                       │
│                     /──────\                                │
│                    /        \   集成测试                    │
│                   /          \  (适量)                      │
│                  /────────────\                             │
│                 /              \  单元测试                  │
│                /                \ (大量)                    │
│               /──────────────────\                          │
│                                                             │
│  单元测试: Tokenizer, Parser, 各独立模块                    │
│  集成测试: 完整的补全流程                                    │
│  E2E 测试: 与编辑器集成后的测试                             │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## 11.2 测试工具配置

### 11.2.1 Vitest 配置

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      exclude: ['node_modules', 'tests'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
});
```

## 11.3 Tokenizer 单元测试

```typescript
// src/tokenizer/__tests__/Tokenizer.test.ts

import { describe, it, expect } from 'vitest';
import { Tokenizer } from '../Tokenizer';
import { TokenType } from '../../types/token';

describe('Tokenizer', () => {
  const tokenizer = new Tokenizer();
  
  describe('关键字识别', () => {
    it('应该识别 SELECT 关键字', () => {
      const tokens = tokenizer.tokenize('SELECT');
      expect(tokens[0].type).toBe(TokenType.SELECT);
      expect(tokens[0].value).toBe('SELECT');
    });
    
    it('应该识别小写关键字', () => {
      const tokens = tokenizer.tokenize('select from where');
      expect(tokens[0].type).toBe(TokenType.SELECT);
      expect(tokens[1].type).toBe(TokenType.FROM);
      expect(tokens[2].type).toBe(TokenType.WHERE);
    });
    
    it('应该识别所有 JOIN 类型', () => {
      const keywords = ['INNER JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'CROSS JOIN'];
      keywords.forEach(kw => {
        const tokens = tokenizer.tokenize(kw);
        expect(tokens[0].type).toMatch(/INNER|LEFT|RIGHT|CROSS/);
        expect(tokens[1].type).toBe(TokenType.JOIN);
      });
    });
  });
  
  describe('标识符', () => {
    it('应该识别简单标识符', () => {
      const tokens = tokenizer.tokenize('users');
      expect(tokens[0].type).toBe(TokenType.IDENTIFIER);
      expect(tokens[0].value).toBe('users');
    });
    
    it('应该识别带下划线的标识符', () => {
      const tokens = tokenizer.tokenize('user_accounts');
      expect(tokens[0].type).toBe(TokenType.IDENTIFIER);
      expect(tokens[0].value).toBe('user_accounts');
    });
    
    it('应该识别反引号包围的标识符', () => {
      const tokens = tokenizer.tokenize('`select`');
      expect(tokens[0].type).toBe(TokenType.IDENTIFIER);
      expect(tokens[0].value).toBe('select');
    });
  });
  
  describe('字符串字面量', () => {
    it('应该识别单引号字符串', () => {
      const tokens = tokenizer.tokenize("'hello world'");
      expect(tokens[0].type).toBe(TokenType.STRING);
      expect(tokens[0].value).toBe("'hello world'");
    });
    
    it('应该识别双引号字符串', () => {
      const tokens = tokenizer.tokenize('"hello"');
      expect(tokens[0].type).toBe(TokenType.STRING);
    });
    
    it('应该处理转义引号', () => {
      const tokens = tokenizer.tokenize("'it\\'s'");
      expect(tokens[0].type).toBe(TokenType.STRING);
    });
  });
  
  describe('数字', () => {
    it('应该识别整数', () => {
      const tokens = tokenizer.tokenize('123');
      expect(tokens[0].type).toBe(TokenType.NUMBER);
      expect(tokens[0].value).toBe('123');
    });
    
    it('应该识别小数', () => {
      const tokens = tokenizer.tokenize('3.14');
      expect(tokens[0].type).toBe(TokenType.NUMBER);
    });
    
    it('应该识别科学计数法', () => {
      const tokens = tokenizer.tokenize('1e10');
      expect(tokens[0].type).toBe(TokenType.NUMBER);
    });
  });
  
  describe('运算符', () => {
    it('应该识别比较运算符', () => {
      const ops = ['=', '!=', '<>', '<', '>', '<=', '>='];
      ops.forEach(op => {
        const tokens = tokenizer.tokenize(`a ${op} b`);
        expect(tokens[1].type).toMatch(/EQUALS|NOT_EQUALS|LESS|GREATER/);
      });
    });
    
    it('应该识别算术运算符', () => {
      const ops = ['+', '-', '*', '/', '%'];
      ops.forEach(op => {
        const tokens = tokenizer.tokenize(`a ${op} b`);
        expect(tokens[1].type).toMatch(/PLUS|MINUS|MULTIPLY|DIVIDE|MODULO/);
      });
    });
  });
  
  describe('位置信息', () => {
    it('应该正确记录 Token 位置', () => {
      const tokens = tokenizer.tokenize('SELECT id FROM users');
      
      expect(tokens[0].start).toBe(0);
      expect(tokens[0].end).toBe(6);
      
      expect(tokens[1].start).toBe(7);
      expect(tokens[1].end).toBe(9);
    });
    
    it('应该正确记录行列信息', () => {
      const tokens = tokenizer.tokenize('SELECT\nid');
      
      expect(tokens[0].line).toBe(1);
      expect(tokens[1].line).toBe(2);
    });
  });
  
  describe('完整 SQL 语句', () => {
    it('应该正确分词复杂查询', () => {
      const sql = `
        SELECT u.id, u.name, COUNT(*) as total
        FROM users u
        LEFT JOIN orders o ON u.id = o.user_id
        WHERE u.status = 'active'
        GROUP BY u.id
        ORDER BY total DESC
        LIMIT 10
      `;
      
      const tokens = tokenizer.tokenize(sql);
      
      // 验证关键 Token
      const types = tokens.map(t => t.type);
      expect(types).toContain(TokenType.SELECT);
      expect(types).toContain(TokenType.FROM);
      expect(types).toContain(TokenType.LEFT);
      expect(types).toContain(TokenType.JOIN);
      expect(types).toContain(TokenType.ON);
      expect(types).toContain(TokenType.WHERE);
      expect(types).toContain(TokenType.GROUP);
      expect(types).toContain(TokenType.ORDER);
      expect(types).toContain(TokenType.LIMIT);
    });
  });
});
```

## 11.4 Parser 单元测试

```typescript
// src/parser/__tests__/Parser.test.ts

import { describe, it, expect } from 'vitest';
import { Parser } from '../Parser';

describe('Parser', () => {
  const parser = new Parser();
  
  describe('SELECT 语句', () => {
    it('应该解析简单 SELECT', () => {
      const ast = parser.parse('SELECT * FROM users');
      
      expect(ast).toBeDefined();
      expect(ast?.type).toBe('select');
      expect(ast?.columns).toHaveLength(1);
      expect(ast?.columns[0].expression.type).toBe('star');
      expect(ast?.from?.name).toBe('users');
    });
    
    it('应该解析多列 SELECT', () => {
      const ast = parser.parse('SELECT id, name, email FROM users');
      
      expect(ast?.columns).toHaveLength(3);
      expect(ast?.columns[0].expression.type).toBe('column_ref');
    });
    
    it('应该解析带别名的 SELECT', () => {
      const ast = parser.parse('SELECT id AS user_id FROM users');
      
      expect(ast?.columns[0].alias).toBe('user_id');
    });
    
    it('应该解析 DISTINCT', () => {
      const ast = parser.parse('SELECT DISTINCT status FROM orders');
      
      expect(ast?.distinct).toBe(true);
    });
  });
  
  describe('FROM 子句', () => {
    it('应该解析表别名', () => {
      const ast = parser.parse('SELECT * FROM users u');
      
      expect(ast?.from?.name).toBe('users');
      expect(ast?.from?.alias).toBe('u');
    });
    
    it('应该解析带 AS 的表别名', () => {
      const ast = parser.parse('SELECT * FROM users AS u');
      
      expect(ast?.from?.alias).toBe('u');
    });
  });
  
  describe('JOIN 子句', () => {
    it('应该解析 INNER JOIN', () => {
      const ast = parser.parse(`
        SELECT * FROM users u 
        INNER JOIN orders o ON u.id = o.user_id
      `);
      
      expect(ast?.joins).toHaveLength(1);
      expect(ast?.joins?.[0].type).toBe('INNER');
      expect(ast?.joins?.[0].table.name).toBe('orders');
    });
    
    it('应该解析 LEFT JOIN', () => {
      const ast = parser.parse(`
        SELECT * FROM users u 
        LEFT JOIN orders o ON u.id = o.user_id
      `);
      
      expect(ast?.joins?.[0].type).toBe('LEFT');
    });
    
    it('应该解析多个 JOIN', () => {
      const ast = parser.parse(`
        SELECT * FROM users u 
        JOIN orders o ON u.id = o.user_id
        JOIN products p ON o.product_id = p.id
      `);
      
      expect(ast?.joins).toHaveLength(2);
    });
  });
  
  describe('WHERE 子句', () => {
    it('应该解析简单条件', () => {
      const ast = parser.parse('SELECT * FROM users WHERE id = 1');
      
      expect(ast?.where).toBeDefined();
      expect(ast?.where?.type).toBe('binary');
    });
    
    it('应该解析 AND 条件', () => {
      const ast = parser.parse(`
        SELECT * FROM users 
        WHERE status = 'active' AND age > 18
      `);
      
      expect(ast?.where?.type).toBe('binary');
      expect(ast?.where?.operator).toBe('AND');
    });
    
    it('应该解析 IN 条件', () => {
      const ast = parser.parse(`
        SELECT * FROM users WHERE id IN (1, 2, 3)
      `);
      
      expect(ast?.where).toBeDefined();
    });
    
    it('应该解析 LIKE 条件', () => {
      const ast = parser.parse(`
        SELECT * FROM users WHERE name LIKE '%test%'
      `);
      
      expect(ast?.where?.operator).toBe('LIKE');
    });
  });
  
  describe('GROUP BY 和 HAVING', () => {
    it('应该解析 GROUP BY', () => {
      const ast = parser.parse(`
        SELECT status, COUNT(*) FROM orders GROUP BY status
      `);
      
      expect(ast?.groupBy).toHaveLength(1);
    });
    
    it('应该解析 HAVING', () => {
      const ast = parser.parse(`
        SELECT status, COUNT(*) as cnt FROM orders 
        GROUP BY status HAVING cnt > 10
      `);
      
      expect(ast?.having).toBeDefined();
    });
  });
  
  describe('ORDER BY 和 LIMIT', () => {
    it('应该解析 ORDER BY', () => {
      const ast = parser.parse('SELECT * FROM users ORDER BY name');
      
      expect(ast?.orderBy).toHaveLength(1);
      expect(ast?.orderBy?.[0].direction).toBe('ASC');
    });
    
    it('应该解析 ORDER BY DESC', () => {
      const ast = parser.parse('SELECT * FROM users ORDER BY id DESC');
      
      expect(ast?.orderBy?.[0].direction).toBe('DESC');
    });
    
    it('应该解析 LIMIT', () => {
      const ast = parser.parse('SELECT * FROM users LIMIT 10');
      
      expect(ast?.limit).toBe(10);
    });
    
    it('应该解析 LIMIT OFFSET', () => {
      const ast = parser.parse('SELECT * FROM users LIMIT 10 OFFSET 20');
      
      expect(ast?.limit).toBe(10);
      expect(ast?.offset).toBe(20);
    });
  });
  
  describe('不完整输入', () => {
    it('应该处理 SELECT 后无内容', () => {
      const ast = parser.parse('SELECT ');
      
      expect(ast?.incomplete).toBe(true);
    });
    
    it('应该处理 FROM 后无表名', () => {
      const ast = parser.parse('SELECT * FROM ');
      
      expect(ast?.from?.incomplete).toBe(true);
    });
    
    it('应该处理 WHERE 后无条件', () => {
      const ast = parser.parse('SELECT * FROM users WHERE ');
      
      expect(ast?.where?.incomplete || ast?.incomplete).toBe(true);
    });
  });
  
  describe('函数调用', () => {
    it('应该解析聚合函数', () => {
      const ast = parser.parse('SELECT COUNT(*) FROM users');
      
      expect(ast?.columns[0].expression.type).toBe('function');
    });
    
    it('应该解析 COUNT DISTINCT', () => {
      const ast = parser.parse('SELECT COUNT(DISTINCT id) FROM users');
      
      const func = ast?.columns[0].expression as any;
      expect(func.distinct).toBe(true);
    });
  });
});
```

## 11.5 集成测试

```typescript
// tests/integration/autocomplete.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import { SQLAutocompleteParser } from '../../src';
import { SchemaManager } from '../../src/schema/SchemaManager';

describe('SQL Autocomplete Integration', () => {
  let parser: SQLAutocompleteParser;
  let schemaManager: SchemaManager;
  
  beforeEach(() => {
    schemaManager = new SchemaManager();
    
    schemaManager.addTable({
      name: 'users',
      columns: [
        { name: 'id', dataType: 'INT', isPrimaryKey: true, nullable: false },
        { name: 'name', dataType: 'VARCHAR(100)', nullable: false },
        { name: 'email', dataType: 'VARCHAR(255)', nullable: false },
        { name: 'status', dataType: 'VARCHAR(20)', nullable: false },
        { name: 'created_at', dataType: 'TIMESTAMP', nullable: true },
      ],
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
    });
    
    parser = new SQLAutocompleteParser(schemaManager);
  });
  
  describe('语句开始', () => {
    it('空输入应提示 SQL 关键字', () => {
      const result = parser.getSuggestions('', 0);
      
      const labels = result.suggestions.map(s => s.label);
      expect(labels).toContain('SELECT');
      expect(labels).toContain('INSERT');
      expect(labels).toContain('UPDATE');
    });
  });
  
  describe('SELECT 子句', () => {
    it('SELECT 后应提示列名和 *', () => {
      const result = parser.getSuggestions('SELECT ', 7);
      
      const labels = result.suggestions.map(s => s.label);
      expect(labels).toContain('*');
      expect(labels).toContain('DISTINCT');
    });
    
    it('SELECT 带前缀应过滤', () => {
      const result = parser.getSuggestions('SELECT na', 9);
      
      // 应该匹配 name
      const labels = result.suggestions.map(s => s.label);
      expect(labels.some(l => l.toLowerCase().includes('na'))).toBe(true);
    });
  });
  
  describe('FROM 子句', () => {
    it('FROM 后应提示表名', () => {
      const result = parser.getSuggestions('SELECT * FROM ', 14);
      
      const labels = result.suggestions.map(s => s.label);
      expect(labels).toContain('users');
      expect(labels).toContain('orders');
    });
    
    it('FROM 带前缀应过滤表名', () => {
      const result = parser.getSuggestions('SELECT * FROM us', 16);
      
      const labels = result.suggestions.map(s => s.label);
      expect(labels).toContain('users');
      expect(labels).not.toContain('orders');
    });
  });
  
  describe('JOIN 子句', () => {
    it('JOIN 后应提示表名', () => {
      const result = parser.getSuggestions('SELECT * FROM users JOIN ', 25);
      
      const labels = result.suggestions.map(s => s.label);
      expect(labels).toContain('orders');
    });
    
    it('ON 后应提示列名', () => {
      const result = parser.getSuggestions(
        'SELECT * FROM users u JOIN orders o ON ',
        39
      );
      
      const suggestions = result.suggestions;
      expect(suggestions.length).toBeGreaterThan(0);
    });
  });
  
  describe('WHERE 子句', () => {
    it('WHERE 后应提示列名', () => {
      const result = parser.getSuggestions('SELECT * FROM users WHERE ', 26);
      
      const labels = result.suggestions.map(s => s.label);
      expect(labels).toContain('id');
      expect(labels).toContain('name');
      expect(labels).toContain('status');
    });
    
    it('列名后应提示运算符', () => {
      const result = parser.getSuggestions('SELECT * FROM users WHERE id ', 29);
      
      const labels = result.suggestions.map(s => s.label);
      expect(labels).toContain('=');
      expect(labels).toContain('IN');
      expect(labels).toContain('IS NULL');
    });
  });
  
  describe('点号访问', () => {
    it('表别名后点号应提示该表的列', () => {
      const result = parser.getSuggestions(
        'SELECT u. FROM users u',
        9
      );
      
      const labels = result.suggestions.map(s => s.label);
      expect(labels).toContain('id');
      expect(labels).toContain('name');
      expect(labels).toContain('email');
    });
  });
  
  describe('GROUP BY 和 ORDER BY', () => {
    it('GROUP BY 后应提示列名', () => {
      const result = parser.getSuggestions(
        'SELECT * FROM users GROUP BY ',
        29
      );
      
      const suggestions = result.suggestions;
      expect(suggestions.length).toBeGreaterThan(0);
    });
    
    it('ORDER BY 后应提示列名和方向', () => {
      const result = parser.getSuggestions(
        'SELECT * FROM users ORDER BY ',
        29
      );
      
      const labels = result.suggestions.map(s => s.label);
      expect(labels.some(l => ['ASC', 'DESC'].includes(l) || 
        ['id', 'name'].includes(l))).toBe(true);
    });
  });
});
```

## 11.6 快照测试

```typescript
// tests/snapshots/suggestions.test.ts

import { describe, it, expect } from 'vitest';
import { SQLAutocompleteParser } from '../../src';
import { setupTestSchema } from '../helpers';

describe('Suggestion Snapshots', () => {
  const parser = setupTestSchema();
  
  it('SELECT 后的建议应该保持一致', () => {
    const result = parser.getSuggestions('SELECT ', 7);
    expect(result.suggestions).toMatchSnapshot();
  });
  
  it('FROM 后的建议应该保持一致', () => {
    const result = parser.getSuggestions('SELECT * FROM ', 14);
    expect(result.suggestions).toMatchSnapshot();
  });
  
  it('WHERE 后的建议应该保持一致', () => {
    const result = parser.getSuggestions('SELECT * FROM users WHERE ', 26);
    expect(result.suggestions).toMatchSnapshot();
  });
});
```

## 11.7 测试覆盖率

运行测试并生成覆盖率报告：

```bash
# 运行测试
npm run test

# 运行测试并生成覆盖率
npm run test:coverage

# 监视模式
npm run test:watch
```

### 覆盖率目标

```
┌─────────────────────────────────────────────────────────────┐
│                     覆盖率目标                               │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  模块               语句    分支    函数    行              │
│  ─────────────────────────────────────────────────────────  │
│  Tokenizer          90%     85%     90%     90%             │
│  Parser             85%     80%     85%     85%             │
│  ContextAnalyzer    80%     75%     80%     80%             │
│  SuggestionEngine   80%     75%     80%     80%             │
│  SchemaManager      90%     85%     90%     90%             │
│  SyntaxValidator    80%     75%     80%     80%             │
│  ─────────────────────────────────────────────────────────  │
│  总体               85%     80%     85%     85%             │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## 11.8 小结

```
┌─────────────────────────────────────────────────────────────┐
│                    测试策略关键点                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. 单元测试                                                 │
│     - Tokenizer: 关键字、标识符、运算符、位置               │
│     - Parser: 各种 SQL 结构、不完整输入                     │
│     - 其他模块独立测试                                      │
│                                                             │
│  2. 集成测试                                                 │
│     - 完整的补全流程                                        │
│     - 各种上下文场景                                        │
│     - 前缀过滤验证                                          │
│                                                             │
│  3. 快照测试                                                 │
│     - 确保建议输出的稳定性                                  │
│     - 回归检测                                              │
│                                                             │
│  4. 覆盖率                                                   │
│     - 目标 85%+                                             │
│     - 关注边界情况                                          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

[← 上一章：语法验证器](./10-syntax-validator.md) | [下一章：编辑器集成 →](./12-editor-integration.md)
