import { Tokenizer } from './tokenizer';
import { Parser } from './parser';
import { SchemaManager } from './schema';
import { SyntaxValidator } from './validator';
import {
  SuggestionItem,
  SuggestionResult,
  SuggestionType,
  ContextType,
  ContextInfo,
  ParserOptions,
  DatabaseSchema,
  ValidationResult,
  SQL_KEYWORDS,
  SelectStatement,
  TokenType,
} from './types';

/**
 * Main SQL Autocomplete Parser
 */
export class SQLAutocompleteParser {
  private schemaManager: SchemaManager;
  private validator: SyntaxValidator;
  private options: ParserOptions;

  constructor(options: ParserOptions = {}) {
    this.options = options;
    this.schemaManager = new SchemaManager(options.schema);
    this.validator = new SyntaxValidator(this.schemaManager);
  }

  /**
   * Get autocomplete suggestions for SQL at cursor position
   */
  getSuggestions(sql: string, cursorPosition: number): SuggestionResult {
    // Tokenize
    const tokenizer = new Tokenizer(sql);
    const tokens = tokenizer.tokenize();

    // Parse
    const parser = new Parser(tokens);
    const ast = parser.parse();

    // Find token at cursor
    const tokenAtCursor = parser.findTokenAtPosition(cursorPosition);

    // Analyze context
    const context = this.analyzeContext(sql, cursorPosition, ast, tokenAtCursor);

    // Generate suggestions
    const suggestions = this.generateSuggestions(context, tokenAtCursor);

    return {
      items: suggestions,
      context,
    };
  }

  /**
   * Set database schema
   */
  setSchema(schema: DatabaseSchema): void {
    this.schemaManager.loadSchema(schema);
  }

  /**
   * Validate SQL syntax
   */
  validate(sql: string): ValidationResult {
    // Tokenize
    const tokenizer = new Tokenizer(sql);
    const tokens = tokenizer.tokenize();

    // Parse
    const parser = new Parser(tokens);
    const ast = parser.parse();

    // Validate
    return this.validator.validate(ast as SelectStatement, sql);
  }

  /**
   * Analyze context at cursor position
   */
  private analyzeContext(sql: string, cursorPosition: number, ast: any, tokenAtCursor: any): ContextInfo {
    const context: ContextInfo = {
      type: ContextType.UNKNOWN,
      expectedTypes: [],
      availableTables: [],
      availableColumns: new Map(),
      aliases: new Map(),
      confidence: 1.0,
    };

    if (!ast) {
      context.type = ContextType.STATEMENT_START;
      return context;
    }

    // Extract tables and joins from FROM clause
    if (ast.type === 'SelectStatement' && ast.fromClause) {
      const fromClause = ast.fromClause as any;
      
      // Extract main tables
      if (fromClause.tables) {
        for (const table of fromClause.tables) {
          this.addTableToContext(context, table.tableName, table.alias);
        }
      }

      // Extract joined tables
      if (fromClause.joins) {
        for (const join of fromClause.joins) {
          if (join.table) {
            this.addTableToContext(context, join.table.tableName, join.table.alias);
          }
        }
      }
    }

    // Determine context type based on position
    const beforeCursor = sql.substring(0, cursorPosition).trim().toUpperCase();
    const lastWord = this.getLastKeyword(beforeCursor);
    
    // Check for JOIN context
    if (beforeCursor.endsWith('JOIN') || lastWord === 'JOIN') {
      context.type = ContextType.JOIN_TABLE;
      return context;
    }

    if (beforeCursor.endsWith('ON') || (beforeCursor.includes(' ON ') && !beforeCursor.split(' ON ').pop()!.includes('='))) {
      context.type = ContextType.JOIN_CONDITION;
      return context;
    }

    // Check for other contexts
    if (beforeCursor.endsWith('SELECT') || (beforeCursor.includes('SELECT') && beforeCursor.split('SELECT').pop()!.trim() === '')) {
      context.type = ContextType.SELECT_COLUMN;
    } else if (beforeCursor.endsWith('FROM') || (beforeCursor.includes('FROM') && this.isLastClause(beforeCursor, 'FROM'))) {
      context.type = ContextType.FROM_TABLE;
    } else if (beforeCursor.endsWith('WHERE') || (beforeCursor.includes('WHERE') && this.isLastClause(beforeCursor, 'WHERE'))) {
      context.type = ContextType.WHERE_CONDITION;
    } else if (beforeCursor.includes('SELECT') && !beforeCursor.includes('FROM')) {
      context.type = ContextType.SELECT_COLUMN;
    } else if (beforeCursor.includes('FROM') && !beforeCursor.includes('WHERE') && !beforeCursor.includes('JOIN')) {
      // Could be completing table name or expecting WHERE/JOIN
      if (context.availableTables.length === 0) {
        context.type = ContextType.FROM_TABLE;
      } else {
        context.type = ContextType.KEYWORD;
      }
    } else if (beforeCursor.includes('WHERE')) {
      context.type = ContextType.WHERE_CONDITION;
    }

    return context;
  }

  private addTableToContext(context: ContextInfo, tableName: string, alias?: string): void {
    context.availableTables.push(tableName);
    
    if (alias) {
      context.aliases.set(alias, tableName);
    }

    // Get columns for this table
    const columns = this.schemaManager.getColumnNames(tableName);
    context.availableColumns.set(tableName, columns);
    if (alias) {
      context.availableColumns.set(alias, columns);
    }
  }

  private getLastKeyword(sql: string): string | null {
    const keywords = ['SELECT', 'FROM', 'WHERE', 'JOIN', 'INNER', 'LEFT', 'RIGHT', 'ON', 'GROUP', 'ORDER', 'HAVING', 'LIMIT'];
    const words = sql.split(/\s+/);
    for (let i = words.length - 1; i >= 0; i--) {
      if (keywords.includes(words[i])) {
        return words[i];
      }
    }
    return null;
  }

  private isLastClause(sql: string, clause: string): boolean {
    const afterClause = sql.split(clause).pop()!.trim();
    // Check if there's nothing significant after the clause keyword
    return afterClause === '' || !afterClause.match(/\w/);
  }

  /**
   * Generate suggestions based on context
   */
  private generateSuggestions(context: ContextInfo, tokenAtCursor: any): SuggestionItem[] {
    const suggestions: SuggestionItem[] = [];

    switch (context.type) {
      case ContextType.STATEMENT_START:
        suggestions.push(...this.getKeywordSuggestions(['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'WITH']));
        break;

      case ContextType.SELECT_COLUMN:
        // Add * option
        suggestions.push({
          label: '*',
          type: SuggestionType.COLUMN,
          detail: 'All columns',
          insertText: '*',
          score: 100,
        });

        // Add columns from available tables
        for (const [table, columns] of context.availableColumns) {
          for (const column of columns) {
            const tableInfo = this.schemaManager.getTable(table);
            const columnDef = tableInfo?.columns[column];
            
            suggestions.push({
              label: column,
              type: SuggestionType.COLUMN,
              detail: `${table}.${column}${columnDef ? ` (${columnDef.type})` : ''}`,
              insertText: column,
              score: columnDef?.primaryKey ? 90 : 80,
            });

            // Also add qualified column reference
            suggestions.push({
              label: `${table}.${column}`,
              type: SuggestionType.COLUMN,
              detail: columnDef ? `${columnDef.type}` : 'Column',
              insertText: `${table}.${column}`,
              score: 70,
            });
          }
        }

        // Add aggregate functions
        suggestions.push(...this.getFunctionSuggestions());
        
        // Add DISTINCT keyword
        suggestions.push({
          label: 'DISTINCT',
          type: SuggestionType.KEYWORD,
          detail: 'Remove duplicates',
          insertText: 'DISTINCT ',
          score: 60,
        });
        break;

      case ContextType.FROM_TABLE:
      case ContextType.JOIN_TABLE:
        // Add table suggestions
        const tableNames = this.schemaManager.getTableNames();
        for (const tableName of tableNames) {
          const tableDef = this.schemaManager.getTable(tableName);
          const columnCount = tableDef ? Object.keys(tableDef.columns).length : 0;
          
          suggestions.push({
            label: tableName,
            type: SuggestionType.TABLE,
            detail: `Table (${columnCount} columns)`,
            documentation: tableDef?.comment,
            insertText: tableName,
            score: 90,
          });
        }

        // If in JOIN context, add JOIN keywords
        if (context.type === ContextType.JOIN_TABLE) {
          suggestions.push(...this.getKeywordSuggestions(['INNER JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'CROSS JOIN']));
        }
        break;

      case ContextType.WHERE_CONDITION:
      case ContextType.JOIN_CONDITION:
        // Add columns from available tables
        for (const [table, columns] of context.availableColumns) {
          for (const column of columns) {
            const tableDef = this.schemaManager.getTable(table);
            const columnDef = tableDef?.columns[column];
            
            suggestions.push({
              label: column,
              type: SuggestionType.COLUMN,
              detail: `${table}.${column}${columnDef ? ` (${columnDef.type})` : ''}`,
              insertText: column,
              score: 80,
            });

            // Add qualified reference
            suggestions.push({
              label: `${table}.${column}`,
              type: SuggestionType.COLUMN,
              detail: columnDef ? `${columnDef.type}` : 'Column',
              insertText: `${table}.${column}`,
              score: 85,
            });
          }
        }

        // Add operators
        suggestions.push(...this.getOperatorSuggestions());

        // Add logical operators for WHERE
        if (context.type === ContextType.WHERE_CONDITION) {
          suggestions.push(...this.getKeywordSuggestions(['AND', 'OR', 'NOT']));
        }
        break;

      case ContextType.KEYWORD:
        // After FROM and tables are specified, suggest next clauses
        if (context.availableTables.length > 0) {
          suggestions.push(...this.getKeywordSuggestions([
            'WHERE',
            'INNER JOIN',
            'LEFT JOIN',
            'GROUP BY',
            'ORDER BY',
            'LIMIT',
          ]));
        }
        break;

      default:
        // Add common keywords based on query structure
        suggestions.push(...this.getKeywordSuggestions(['WHERE', 'JOIN', 'GROUP BY', 'ORDER BY', 'LIMIT']));
    }

    return this.rankSuggestions(suggestions, tokenAtCursor);
  }

  private getKeywordSuggestions(keywords: string[]): SuggestionItem[] {
    return keywords.map(keyword => ({
      label: keyword,
      type: SuggestionType.KEYWORD,
      detail: 'Keyword',
      insertText: keyword,
    }));
  }

  private getFunctionSuggestions(): SuggestionItem[] {
    const aggregateFunctions = [
      { name: 'COUNT', detail: 'Count rows', doc: 'COUNT(column) - Returns the number of rows' },
      { name: 'SUM', detail: 'Sum values', doc: 'SUM(column) - Returns the sum of numeric values' },
      { name: 'AVG', detail: 'Average value', doc: 'AVG(column) - Returns the average value' },
      { name: 'MAX', detail: 'Maximum value', doc: 'MAX(column) - Returns the maximum value' },
      { name: 'MIN', detail: 'Minimum value', doc: 'MIN(column) - Returns the minimum value' },
    ];

    const scalarFunctions = [
      { name: 'UPPER', detail: 'Convert to uppercase', doc: 'UPPER(string) - Convert string to uppercase' },
      { name: 'LOWER', detail: 'Convert to lowercase', doc: 'LOWER(string) - Convert string to lowercase' },
      { name: 'CONCAT', detail: 'Concatenate strings', doc: 'CONCAT(str1, str2, ...) - Join strings together' },
      { name: 'LENGTH', detail: 'String length', doc: 'LENGTH(string) - Returns the length of string' },
      { name: 'TRIM', detail: 'Remove spaces', doc: 'TRIM(string) - Remove leading/trailing spaces' },
      { name: 'SUBSTRING', detail: 'Extract substring', doc: 'SUBSTRING(string, start, length)' },
      { name: 'NOW', detail: 'Current timestamp', doc: 'NOW() - Returns current date and time' },
      { name: 'DATE', detail: 'Extract date', doc: 'DATE(datetime) - Extract date part' },
    ];

    const allFunctions = [...aggregateFunctions, ...scalarFunctions];
    
    return allFunctions.map(func => ({
      label: func.name,
      type: SuggestionType.FUNCTION,
      detail: func.detail,
      documentation: func.doc,
      insertText: `${func.name}()`,
      score: 75,
    }));
  }

  private getOperatorSuggestions(): SuggestionItem[] {
    const operators = ['=', '!=', '<', '>', '<=', '>=', 'LIKE', 'IN', 'IS NULL', 'BETWEEN'];
    return operators.map(op => ({
      label: op,
      type: SuggestionType.OPERATOR,
      detail: 'Operator',
      insertText: op,
    }));
  }

  private rankSuggestions(suggestions: SuggestionItem[], tokenAtCursor: any): SuggestionItem[] {
    let filtered = suggestions;

    // Filter by prefix if token exists
    if (tokenAtCursor && tokenAtCursor.value && tokenAtCursor.type !== TokenType.EOF) {
      const prefix = tokenAtCursor.value.toLowerCase();
      filtered = suggestions.filter(s => s.label.toLowerCase().startsWith(prefix));
    }

    // Sort by score (descending) and then alphabetically
    return filtered.sort((a, b) => {
      const scoreA = a.score || 0;
      const scoreB = b.score || 0;
      
      if (scoreA !== scoreB) {
        return scoreB - scoreA; // Higher score first
      }
      
      return a.label.localeCompare(b.label);
    });
  }
}

// Export everything
export * from './types';
export { Tokenizer } from './tokenizer';
export { Parser } from './parser';
export { SchemaManager } from './schema';
export { SyntaxValidator } from './validator';
