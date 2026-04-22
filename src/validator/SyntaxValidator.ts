import { SelectStatement, SyntaxError, ValidationResult } from '@/types';
import { SchemaManager } from '@/schema';

/**
 * Syntax Validator - validates SQL syntax and semantics
 */
export class SyntaxValidator {
  private schemaManager: SchemaManager;

  constructor(schemaManager: SchemaManager) {
    this.schemaManager = schemaManager;
  }

  /**
   * Validate a SQL statement
   */
  validate(ast: SelectStatement | null, sql: string): ValidationResult {
    const errors: SyntaxError[] = [];

    if (!ast) {
      return { valid: true, errors: [] };
    }

    // Validate SELECT statement structure
    if (ast.type === 'SelectStatement') {
      this.validateSelectStatement(ast, errors);
    }

    return {
      valid: errors.filter(e => e.severity === 'error').length === 0,
      errors,
    };
  }

  private validateSelectStatement(ast: SelectStatement, errors: SyntaxError[]): void {
    // Check if SELECT has columns
    if (!ast.selectClause || ast.selectClause.columns.length === 0) {
      if (!ast.incomplete) {
        errors.push({
          message: 'SELECT clause must specify at least one column',
          line: ast.range.start.line,
          column: ast.range.start.column,
          length: 6,
          severity: 'error',
          fixes: ['Add column names or * after SELECT'],
        });
      }
    }

    // Validate FROM clause
    if (ast.fromClause) {
      this.validateFromClause(ast.fromClause, errors);
    } else if (!ast.incomplete) {
      errors.push({
        message: 'SELECT statement should have a FROM clause',
        line: ast.selectClause.range.end.line,
        column: ast.selectClause.range.end.column,
        length: 1,
        severity: 'warning',
        fixes: ['Add FROM table_name'],
      });
    }

    // Validate table and column references
    if (ast.fromClause) {
      this.validateTableReferences(ast, errors);
      this.validateColumnReferences(ast, errors);
    }

    // Validate GROUP BY usage
    if (ast.groupByClause) {
      this.validateGroupBy(ast, errors);
    }

    // Validate JOIN clauses
    if (ast.fromClause?.joins) {
      this.validateJoins(ast.fromClause.joins, errors);
    }

    // Performance warnings
    this.checkPerformanceIssues(ast, errors);
  }

  private validateFromClause(fromClause: any, errors: SyntaxError[]): void {
    if (!fromClause.tables || fromClause.tables.length === 0) {
      errors.push({
        message: 'FROM clause requires at least one table',
        line: fromClause.range.start.line,
        column: fromClause.range.start.column,
        length: 4,
        severity: 'error',
      });
    }
  }

  private validateTableReferences(ast: SelectStatement, errors: SyntaxError[]): void {
    if (!ast.fromClause) return;

    // Check main tables
    for (const table of ast.fromClause.tables || []) {
      if (!this.schemaManager.hasTable(table.tableName)) {
        errors.push({
          message: `Table '${table.tableName}' does not exist`,
          line: table.range?.start.line || 0,
          column: table.range?.start.column || 0,
          length: table.tableName.length,
          severity: 'error',
          fixes: this.suggestSimilarTables(table.tableName),
        });
      }
    }

    // Check joined tables
    if (ast.fromClause.joins) {
      for (const join of ast.fromClause.joins) {
        if (join.table && !this.schemaManager.hasTable(join.table.tableName)) {
          errors.push({
            message: `Table '${join.table.tableName}' does not exist`,
            line: join.range?.start.line || 0,
            column: join.range?.start.column || 0,
            length: join.table.tableName.length,
            severity: 'error',
            fixes: this.suggestSimilarTables(join.table.tableName),
          });
        }
      }
    }
  }

  private validateColumnReferences(ast: SelectStatement, errors: SyntaxError[]): void {
    if (!ast.fromClause) return;

    // Get available tables and their columns
    const availableTables = new Map<string, string[]>();
    const aliases = new Map<string, string>();

    // Collect tables and aliases
    for (const table of ast.fromClause.tables || []) {
      const columns = this.schemaManager.getColumnNames(table.tableName);
      availableTables.set(table.tableName, columns);
      if (table.alias) {
        aliases.set(table.alias, table.tableName);
        availableTables.set(table.alias, columns);
      }
    }

    if (ast.fromClause.joins) {
      for (const join of ast.fromClause.joins) {
        if (join.table) {
          const columns = this.schemaManager.getColumnNames(join.table.tableName);
          availableTables.set(join.table.tableName, columns);
          if (join.table.alias) {
            aliases.set(join.table.alias, join.table.tableName);
            availableTables.set(join.table.alias, columns);
          }
        }
      }
    }

    // Validate columns in SELECT clause
    for (const column of ast.selectClause.columns) {
      if (column.type === 'ColumnReference' && column.columnName !== '*') {
        this.validateColumnReference(column, availableTables, aliases, errors);
      }
    }
  }

  private validateColumnReference(
    column: any,
    availableTables: Map<string, string[]>,
    aliases: Map<string, string>,
    errors: SyntaxError[]
  ): void {
    // If table is specified, check that combination
    if (column.tableName) {
      const tableName = aliases.get(column.tableName) || column.tableName;
      const columns = availableTables.get(column.tableName);
      
      if (!columns) {
        errors.push({
          message: `Unknown table '${column.tableName}'`,
          line: column.range?.start.line || 0,
          column: column.range?.start.column || 0,
          length: column.tableName.length,
          severity: 'error',
        });
        return;
      }

      if (!columns.includes(column.columnName)) {
        errors.push({
          message: `Column '${column.columnName}' does not exist in table '${column.tableName}'`,
          line: column.range?.start.line || 0,
          column: column.range?.start.column || 0,
          length: column.columnName.length,
          severity: 'error',
          fixes: this.suggestSimilarColumns(column.columnName, columns),
        });
      }
    } else {
      // Check if column exists in any available table
      let found = false;
      let matchCount = 0;
      
      for (const columns of availableTables.values()) {
        if (columns.includes(column.columnName)) {
          found = true;
          matchCount++;
        }
      }

      if (!found) {
        const allColumns = Array.from(availableTables.values()).flat();
        errors.push({
          message: `Column '${column.columnName}' not found in any table`,
          line: column.range?.start.line || 0,
          column: column.range?.start.column || 0,
          length: column.columnName.length,
          severity: 'error',
          fixes: this.suggestSimilarColumns(column.columnName, allColumns),
        });
      } else if (matchCount > 1) {
        errors.push({
          message: `Column '${column.columnName}' is ambiguous (exists in multiple tables)`,
          line: column.range?.start.line || 0,
          column: column.range?.start.column || 0,
          length: column.columnName.length,
          severity: 'error',
          fixes: ['Use table.column notation to specify which table'],
        });
      }
    }
  }

  private validateGroupBy(ast: SelectStatement, errors: SyntaxError[]): void {
    // This is a simplified check - in real implementation would be more thorough
    if (ast.groupByClause && ast.groupByClause.columns.length === 0) {
      errors.push({
        message: 'GROUP BY clause must specify at least one column',
        line: ast.groupByClause.range?.start.line || 0,
        column: ast.groupByClause.range?.start.column || 0,
        length: 8,
        severity: 'error',
      });
    }
  }

  private validateJoins(joins: any[], errors: SyntaxError[]): void {
    for (const join of joins) {
      if (join.joinType !== 'CROSS' && !join.condition) {
        errors.push({
          message: `${join.joinType} JOIN requires an ON condition`,
          line: join.range?.start.line || 0,
          column: join.range?.start.column || 0,
          length: 4,
          severity: 'error',
          fixes: ['Add ON table1.column = table2.column'],
        });
      }
    }
  }

  private checkPerformanceIssues(ast: SelectStatement, errors: SyntaxError[]): void {
    // Warn about SELECT *
    const hasSelectStar = ast.selectClause.columns.some(
      col => col.type === 'AllColumnsReference'
    );
    
    if (hasSelectStar) {
      errors.push({
        message: 'Using SELECT * may impact performance. Consider specifying column names explicitly.',
        line: ast.selectClause.range.start.line,
        column: ast.selectClause.range.start.column,
        length: 8,
        severity: 'info',
        fixes: ['Specify column names: SELECT col1, col2, ...'],
      });
    }

    // Warn about missing WHERE clause
    if (!ast.whereClause && ast.fromClause) {
      errors.push({
        message: 'Query without WHERE clause may return large result set',
        line: ast.fromClause.range.end.line,
        column: ast.fromClause.range.end.column,
        length: 1,
        severity: 'info',
        fixes: ['Add WHERE clause to filter results'],
      });
    }
  }

  private suggestSimilarTables(tableName: string): string[] {
    const allTables = this.schemaManager.getTableNames();
    const similar = allTables.filter(t => 
      this.levenshteinDistance(t.toLowerCase(), tableName.toLowerCase()) <= 2
    );
    return similar.map(t => `Did you mean '${t}'?`);
  }

  private suggestSimilarColumns(columnName: string, availableColumns: string[]): string[] {
    const similar = availableColumns.filter(c =>
      this.levenshteinDistance(c.toLowerCase(), columnName.toLowerCase()) <= 2
    );
    return similar.map(c => `Did you mean '${c}'?`);
  }

  private levenshteinDistance(str1: string, str2: string): number {
    const matrix: number[][] = [];

    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }

    return matrix[str2.length][str1.length];
  }
}
