# 第12章：编辑器集成

> 🎯 **学习目标**：学习如何将 SQL 解析器集成到 Monaco Editor 等代码编辑器中

---

## 12.1 集成架构

```
┌─────────────────────────────────────────────────────────────┐
│                     编辑器集成架构                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   ┌─────────────────────────────────────────────────────┐   │
│   │                   Monaco Editor                      │   │
│   │  ┌─────────────────────────────────────────────┐    │   │
│   │  │              用户界面                        │    │   │
│   │  │  • 代码编辑区                                │    │   │
│   │  │  • 自动补全弹出框                            │    │   │
│   │  │  • 错误波浪线                                │    │   │
│   │  │  • 悬停提示                                  │    │   │
│   │  └─────────────────────────────────────────────┘    │   │
│   │                      ↕                               │   │
│   │  ┌─────────────────────────────────────────────┐    │   │
│   │  │           语言服务接口                       │    │   │
│   │  │  • CompletionItemProvider                   │    │   │
│   │  │  • HoverProvider                            │    │   │
│   │  │  • DiagnosticsAdapter                       │    │   │
│   │  │  • CodeActionProvider                       │    │   │
│   │  └─────────────────────────────────────────────┘    │   │
│   └─────────────────────────────────────────────────────┘   │
│                          ↕                                   │
│   ┌─────────────────────────────────────────────────────┐   │
│   │              SQL Autocomplete Parser                 │   │
│   │  • Tokenizer                                         │   │
│   │  • Parser                                            │   │
│   │  • ContextAnalyzer                                   │   │
│   │  • SuggestionEngine                                  │   │
│   │  • SyntaxValidator                                   │   │
│   └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## 12.2 Monaco Editor 配置

### 12.2.1 安装和基础配置

```typescript
// src/editor/setup.ts

import * as monaco from 'monaco-editor';

// 注册 SQL 语言
monaco.languages.register({ id: 'sql' });

// 配置语言特性
monaco.languages.setLanguageConfiguration('sql', {
  comments: {
    lineComment: '--',
    blockComment: ['/*', '*/'],
  },
  brackets: [
    ['(', ')'],
    ['[', ']'],
  ],
  autoClosingPairs: [
    { open: '(', close: ')' },
    { open: '[', close: ']' },
    { open: "'", close: "'", notIn: ['string'] },
    { open: '"', close: '"', notIn: ['string'] },
    { open: '`', close: '`', notIn: ['string'] },
  ],
  surroundingPairs: [
    { open: '(', close: ')' },
    { open: "'", close: "'" },
    { open: '"', close: '"' },
  ],
  folding: {
    markers: {
      start: /^\s*--\s*#?region\b/,
      end: /^\s*--\s*#?endregion\b/,
    },
  },
});

// 配置 Token 高亮
monaco.languages.setMonarchTokensProvider('sql', {
  defaultToken: '',
  tokenPostfix: '.sql',
  ignoreCase: true,
  
  keywords: [
    'SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'NOT', 'IN', 'IS', 'NULL',
    'JOIN', 'INNER', 'LEFT', 'RIGHT', 'OUTER', 'ON', 'AS',
    'ORDER', 'BY', 'ASC', 'DESC', 'GROUP', 'HAVING', 'LIMIT', 'OFFSET',
    'INSERT', 'INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE',
    'CREATE', 'TABLE', 'DROP', 'ALTER', 'INDEX',
    'DISTINCT', 'ALL', 'UNION', 'EXCEPT', 'INTERSECT',
    'CASE', 'WHEN', 'THEN', 'ELSE', 'END',
    'LIKE', 'BETWEEN', 'EXISTS',
  ],
  
  operators: [
    '=', '>', '<', '!', '~', '?', ':', '==', '<=', '>=', '!=',
    '<>', '&&', '||', '++', '--', '+', '-', '*', '/', '&', '|', '^', '%',
  ],
  
  tokenizer: {
    root: [
      // 标识符和关键字
      [/[a-zA-Z_]\w*/, {
        cases: {
          '@keywords': 'keyword',
          '@default': 'identifier',
        },
      }],
      
      // 数字
      [/\d+(\.\d+)?/, 'number'],
      
      // 字符串
      [/'[^']*'/, 'string'],
      [/"[^"]*"/, 'string'],
      [/`[^`]*`/, 'identifier.quote'],
      
      // 注释
      [/--.*$/, 'comment'],
      [/\/\*/, 'comment', '@comment'],
      
      // 运算符
      [/[+\-*/%=<>!&|^~]/, 'operator'],
      
      // 分隔符
      [/[;,.]/, 'delimiter'],
      [/[()]/, '@brackets'],
    ],
    
    comment: [
      [/[^/*]+/, 'comment'],
      [/\*\//, 'comment', '@pop'],
      [/[/*]/, 'comment'],
    ],
  },
});
```

## 12.3 自动补全提供者

```typescript
// src/editor/CompletionProvider.ts

import * as monaco from 'monaco-editor';
import { SQLAutocompleteParser } from '../index';
import { SuggestionType } from '../suggestion/types';

export class SQLCompletionProvider implements monaco.languages.CompletionItemProvider {
  private parser: SQLAutocompleteParser;
  
  triggerCharacters = ['.', ' ', '('];
  
  constructor(parser: SQLAutocompleteParser) {
    this.parser = parser;
  }
  
  provideCompletionItems(
    model: monaco.editor.ITextModel,
    position: monaco.Position,
    context: monaco.languages.CompletionContext,
    token: monaco.CancellationToken
  ): monaco.languages.ProviderResult<monaco.languages.CompletionList> {
    // 获取当前输入的文本和光标位置
    const text = model.getValue();
    const offset = model.getOffsetAt(position);
    
    // 调用解析器获取建议
    const result = this.parser.getSuggestions(text, offset);
    
    // 计算替换范围
    const wordInfo = model.getWordUntilPosition(position);
    const range = new monaco.Range(
      position.lineNumber,
      wordInfo.startColumn,
      position.lineNumber,
      wordInfo.endColumn
    );
    
    // 转换为 Monaco 格式
    const suggestions = result.suggestions.map((s, index) => ({
      label: s.label,
      kind: this.mapKind(s.type),
      insertText: s.insertText,
      insertTextRules: s.insertText.includes('${')
        ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
        : undefined,
      detail: s.detail,
      documentation: s.documentation,
      range,
      sortText: String(index).padStart(5, '0'),
      filterText: s.label,
      preselect: index === 0,
    }));
    
    return {
      suggestions,
      incomplete: !result.isComplete,
    };
  }
  
  private mapKind(type: SuggestionType): monaco.languages.CompletionItemKind {
    switch (type) {
      case SuggestionType.KEYWORD:
        return monaco.languages.CompletionItemKind.Keyword;
      case SuggestionType.TABLE:
        return monaco.languages.CompletionItemKind.Class;
      case SuggestionType.COLUMN:
        return monaco.languages.CompletionItemKind.Field;
      case SuggestionType.FUNCTION:
        return monaco.languages.CompletionItemKind.Function;
      case SuggestionType.SNIPPET:
        return monaco.languages.CompletionItemKind.Snippet;
      case SuggestionType.OPERATOR:
        return monaco.languages.CompletionItemKind.Operator;
      default:
        return monaco.languages.CompletionItemKind.Text;
    }
  }
}

// 注册提供者
export function registerCompletionProvider(parser: SQLAutocompleteParser): monaco.IDisposable {
  return monaco.languages.registerCompletionItemProvider(
    'sql',
    new SQLCompletionProvider(parser)
  );
}
```

## 12.4 悬停提示

```typescript
// src/editor/HoverProvider.ts

import * as monaco from 'monaco-editor';
import { SchemaManager } from '../schema/SchemaManager';

export class SQLHoverProvider implements monaco.languages.HoverProvider {
  private schemaManager: SchemaManager;
  
  constructor(schemaManager: SchemaManager) {
    this.schemaManager = schemaManager;
  }
  
  provideHover(
    model: monaco.editor.ITextModel,
    position: monaco.Position,
    token: monaco.CancellationToken
  ): monaco.languages.ProviderResult<monaco.languages.Hover> {
    // 获取光标所在的单词
    const wordInfo = model.getWordAtPosition(position);
    if (!wordInfo) return null;
    
    const word = wordInfo.word;
    
    // 检查是否是表名
    const table = this.schemaManager.getTable(word);
    if (table) {
      return {
        contents: [
          { value: `**Table: ${table.name}**` },
          { value: table.comment || '' },
          { value: this.formatTableColumns(table) },
        ],
        range: new monaco.Range(
          position.lineNumber,
          wordInfo.startColumn,
          position.lineNumber,
          wordInfo.endColumn
        ),
      };
    }
    
    // 检查是否是函数
    const func = this.schemaManager.getFunction(word.toUpperCase());
    if (func) {
      return {
        contents: [
          { value: `**Function: ${func.name}**` },
          { value: `\`${func.signature}\`` },
          { value: func.description },
          { value: `Returns: ${func.returnType}` },
          ...(func.examples ? [{ value: `Examples: ${func.examples.join(', ')}` }] : []),
        ],
      };
    }
    
    // 检查是否是 SQL 关键字
    const keywordDoc = this.getKeywordDocumentation(word.toUpperCase());
    if (keywordDoc) {
      return {
        contents: [{ value: keywordDoc }],
      };
    }
    
    return null;
  }
  
  private formatTableColumns(table: any): string {
    const cols = table.columns.slice(0, 5).map((col: any) => {
      let line = `- \`${col.name}\`: ${col.dataType}`;
      if (col.isPrimaryKey) line += ' 🔑';
      if (col.foreignKey) line += ' 🔗';
      return line;
    });
    
    if (table.columns.length > 5) {
      cols.push(`- ... and ${table.columns.length - 5} more columns`);
    }
    
    return cols.join('\n');
  }
  
  private getKeywordDocumentation(keyword: string): string | null {
    const docs: Record<string, string> = {
      'SELECT': '**SELECT** - Retrieves data from one or more tables',
      'FROM': '**FROM** - Specifies the table(s) to query',
      'WHERE': '**WHERE** - Filters rows based on a condition',
      'JOIN': '**JOIN** - Combines rows from two or more tables',
      'GROUP BY': '**GROUP BY** - Groups rows that have the same values',
      'ORDER BY': '**ORDER BY** - Sorts the result set',
      'LIMIT': '**LIMIT** - Constrains the number of rows returned',
      'DISTINCT': '**DISTINCT** - Removes duplicate rows from results',
    };
    
    return docs[keyword] || null;
  }
}

// 注册
export function registerHoverProvider(schemaManager: SchemaManager): monaco.IDisposable {
  return monaco.languages.registerHoverProvider(
    'sql',
    new SQLHoverProvider(schemaManager)
  );
}
```

## 12.5 诊断适配器

```typescript
// src/editor/DiagnosticsAdapter.ts

import * as monaco from 'monaco-editor';
import { SyntaxValidator } from '../validator/SyntaxValidator';
import { DiagnosticSeverity } from '../validator/types';

export class SQLDiagnosticsAdapter {
  private validator: SyntaxValidator;
  private disposables: monaco.IDisposable[] = [];
  private diagnosticsCache = new Map<string, any[]>();
  
  constructor(validator: SyntaxValidator) {
    this.validator = validator;
  }
  
  /**
   * 启动实时诊断
   */
  start(editor: monaco.editor.IStandaloneCodeEditor): void {
    // 内容变化时验证
    const contentDisposable = editor.onDidChangeModelContent(
      this.debounce(() => this.validate(editor), 500)
    );
    
    this.disposables.push(contentDisposable);
    
    // 初始验证
    this.validate(editor);
  }
  
  /**
   * 验证并设置诊断
   */
  private validate(editor: monaco.editor.IStandaloneCodeEditor): void {
    const model = editor.getModel();
    if (!model) return;
    
    const sql = model.getValue();
    const result = this.validator.validate(sql);
    
    // 转换为 Monaco markers
    const markers = result.diagnostics.map(diag => {
      const startPos = model.getPositionAt(diag.range.start);
      const endPos = model.getPositionAt(diag.range.end);
      
      // 如果范围为空，至少标记一个字符
      let endColumn = endPos.column;
      if (startPos.lineNumber === endPos.lineNumber && 
          startPos.column === endPos.column) {
        endColumn = startPos.column + 1;
      }
      
      return {
        severity: this.mapSeverity(diag.severity),
        message: diag.message,
        startLineNumber: startPos.lineNumber,
        startColumn: startPos.column,
        endLineNumber: endPos.lineNumber,
        endColumn,
        code: String(diag.code),
        source: 'sql-validator',
      };
    });
    
    // 设置 markers
    monaco.editor.setModelMarkers(model, 'sql-validator', markers);
    
    // 缓存诊断信息（用于 Quick Fix）
    this.diagnosticsCache.set(model.uri.toString(), result.diagnostics);
  }
  
  /**
   * 获取缓存的诊断
   */
  getDiagnostics(uri: string): any[] {
    return this.diagnosticsCache.get(uri) || [];
  }
  
  private mapSeverity(severity: DiagnosticSeverity): monaco.MarkerSeverity {
    switch (severity) {
      case DiagnosticSeverity.ERROR:
        return monaco.MarkerSeverity.Error;
      case DiagnosticSeverity.WARNING:
        return monaco.MarkerSeverity.Warning;
      case DiagnosticSeverity.INFO:
        return monaco.MarkerSeverity.Info;
      default:
        return monaco.MarkerSeverity.Hint;
    }
  }
  
  private debounce<T extends (...args: any[]) => any>(
    fn: T,
    delay: number
  ): T {
    let timer: ReturnType<typeof setTimeout>;
    return ((...args: any[]) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), delay);
    }) as T;
  }
  
  dispose(): void {
    this.disposables.forEach(d => d.dispose());
    this.disposables = [];
  }
}
```

## 12.6 完整集成示例

```typescript
// src/editor/index.ts

import * as monaco from 'monaco-editor';
import { SQLAutocompleteParser } from '../index';
import { SchemaManager } from '../schema/SchemaManager';
import { SyntaxValidator } from '../validator/SyntaxValidator';
import { registerCompletionProvider } from './CompletionProvider';
import { registerHoverProvider } from './HoverProvider';
import { SQLDiagnosticsAdapter } from './DiagnosticsAdapter';

export interface SQLEditorOptions {
  container: HTMLElement;
  schema?: any;
  initialValue?: string;
  theme?: 'vs' | 'vs-dark' | 'hc-black';
}

export class SQLEditor {
  private editor: monaco.editor.IStandaloneCodeEditor;
  private schemaManager: SchemaManager;
  private parser: SQLAutocompleteParser;
  private validator: SyntaxValidator;
  private diagnosticsAdapter: SQLDiagnosticsAdapter;
  private disposables: monaco.IDisposable[] = [];
  
  constructor(options: SQLEditorOptions) {
    // 初始化 Schema
    this.schemaManager = new SchemaManager();
    if (options.schema) {
      this.schemaManager.importSchema(options.schema);
    }
    
    // 初始化解析器和验证器
    this.parser = new SQLAutocompleteParser(this.schemaManager);
    this.validator = new SyntaxValidator(this.schemaManager);
    
    // 创建编辑器
    this.editor = monaco.editor.create(options.container, {
      value: options.initialValue || '',
      language: 'sql',
      theme: options.theme || 'vs',
      automaticLayout: true,
      minimap: { enabled: false },
      fontSize: 14,
      lineNumbers: 'on',
      renderWhitespace: 'selection',
      tabSize: 2,
      wordWrap: 'on',
      suggestOnTriggerCharacters: true,
      quickSuggestions: true,
      acceptSuggestionOnEnter: 'on',
    });
    
    // 注册语言服务
    this.disposables.push(
      registerCompletionProvider(this.parser),
      registerHoverProvider(this.schemaManager)
    );
    
    // 启动诊断
    this.diagnosticsAdapter = new SQLDiagnosticsAdapter(this.validator);
    this.diagnosticsAdapter.start(this.editor);
  }
  
  /**
   * 获取 SQL 内容
   */
  getValue(): string {
    return this.editor.getValue();
  }
  
  /**
   * 设置 SQL 内容
   */
  setValue(value: string): void {
    this.editor.setValue(value);
  }
  
  /**
   * 更新 Schema
   */
  updateSchema(schema: any): void {
    this.schemaManager.clearTables();
    this.schemaManager.importSchema(schema);
  }
  
  /**
   * 添加表
   */
  addTable(table: any): void {
    this.schemaManager.addTable(table);
  }
  
  /**
   * 聚焦编辑器
   */
  focus(): void {
    this.editor.focus();
  }
  
  /**
   * 监听内容变化
   */
  onDidChangeContent(callback: (value: string) => void): monaco.IDisposable {
    return this.editor.onDidChangeModelContent(() => {
      callback(this.getValue());
    });
  }
  
  /**
   * 格式化 SQL（简单实现）
   */
  format(): void {
    // TODO: 实现 SQL 格式化
    this.editor.getAction('editor.action.formatDocument')?.run();
  }
  
  /**
   * 销毁编辑器
   */
  dispose(): void {
    this.diagnosticsAdapter.dispose();
    this.disposables.forEach(d => d.dispose());
    this.editor.dispose();
  }
}

// 导出便捷创建函数
export function createSQLEditor(options: SQLEditorOptions): SQLEditor {
  return new SQLEditor(options);
}
```

## 12.7 使用示例

```html
<!DOCTYPE html>
<html>
<head>
  <title>SQL Editor</title>
  <style>
    #editor {
      width: 100%;
      height: 400px;
      border: 1px solid #ccc;
    }
  </style>
</head>
<body>
  <div id="editor"></div>
  
  <script type="module">
    import { createSQLEditor } from './dist/editor.js';
    
    const editor = createSQLEditor({
      container: document.getElementById('editor'),
      theme: 'vs-dark',
      initialValue: 'SELECT * FROM users WHERE ',
      schema: {
        name: 'demo',
        tables: [
          {
            name: 'users',
            columns: [
              { name: 'id', dataType: 'INT', isPrimaryKey: true },
              { name: 'name', dataType: 'VARCHAR(100)' },
              { name: 'email', dataType: 'VARCHAR(255)' },
            ]
          },
          {
            name: 'orders',
            columns: [
              { name: 'id', dataType: 'INT', isPrimaryKey: true },
              { name: 'user_id', dataType: 'INT', foreignKey: { table: 'users', column: 'id' } },
              { name: 'total', dataType: 'DECIMAL(10,2)' },
            ]
          }
        ]
      }
    });
    
    // 监听变化
    editor.onDidChangeContent(sql => {
      console.log('SQL changed:', sql);
    });
  </script>
</body>
</html>
```

## 12.8 小结

```
┌─────────────────────────────────────────────────────────────┐
│                   编辑器集成关键点                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. 语言配置                                                 │
│     - 注册语言                                              │
│     - 配置括号、注释、高亮                                  │
│                                                             │
│  2. 自动补全                                                 │
│     - CompletionItemProvider                                │
│     - 触发字符配置                                          │
│     - 建议排序和过滤                                        │
│                                                             │
│  3. 悬停提示                                                 │
│     - HoverProvider                                         │
│     - 表/列/函数文档                                        │
│                                                             │
│  4. 实时诊断                                                 │
│     - 内容变化时验证                                        │
│     - 防抖处理                                              │
│     - Markers 显示                                          │
│                                                             │
│  5. Quick Fix                                                │
│     - CodeActionProvider                                    │
│     - 一键修复错误                                          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 练习题

1. **添加格式化功能**：实现 SQL 代码格式化
2. **添加折叠支持**：支持 SQL 块的折叠
3. **定义跳转**：点击表名跳转到表定义
4. **重命名支持**：批量重命名别名

---

[← 上一章：测试策略](./11-testing.md) | [返回目录 →](./README.md)
