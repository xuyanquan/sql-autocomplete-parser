import { DatabaseSchema, TableDefinition, ColumnDefinition } from '@/types';

/**
 * Schema Manager - manages database schema metadata
 */
export class SchemaManager {
  private schema: DatabaseSchema;
  private tableIndex: Map<string, TableDefinition>;

  constructor(schema?: DatabaseSchema) {
    this.schema = schema || { tables: {} };
    this.tableIndex = new Map();
    this.buildIndex();
  }

  /**
   * Load schema
   */
  loadSchema(schema: DatabaseSchema): void {
    this.schema = schema;
    this.buildIndex();
  }

  /**
   * Get table definition
   */
  getTable(tableName: string): TableDefinition | undefined {
    return this.tableIndex.get(tableName.toLowerCase());
  }

  /**
   * Get all table names
   */
  getTableNames(): string[] {
    return Array.from(this.tableIndex.keys());
  }

  /**
   * Get columns for a table
   */
  getColumns(tableName: string): ColumnDefinition[] {
    const table = this.getTable(tableName);
    if (!table) return [];
    return Object.values(table.columns);
  }

  /**
   * Get column names for a table
   */
  getColumnNames(tableName: string): string[] {
    const table = this.getTable(tableName);
    if (!table) return [];
    return Object.keys(table.columns);
  }

  /**
   * Check if table exists
   */
  hasTable(tableName: string): boolean {
    return this.tableIndex.has(tableName.toLowerCase());
  }

  /**
   * Get foreign key relationships for a table
   */
  getForeignKeys(tableName: string): Array<{ column: string; referencedTable: string; referencedColumn: string }> {
    const table = this.getTable(tableName);
    if (!table || !table.foreignKeys) return [];
    
    return table.foreignKeys.map(fk => ({
      column: fk.columnName,
      referencedTable: fk.referencedTable,
      referencedColumn: fk.referencedColumn,
    }));
  }

  private buildIndex(): void {
    this.tableIndex.clear();
    for (const [tableName, tableDef] of Object.entries(this.schema.tables)) {
      this.tableIndex.set(tableName.toLowerCase(), tableDef);
    }
  }
}
