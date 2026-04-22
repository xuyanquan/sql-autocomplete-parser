/**
 * SQL data types
 */
export enum SQLDataType {
  // Numeric
  INTEGER = 'INTEGER',
  INT = 'INT',
  BIGINT = 'BIGINT',
  DECIMAL = 'DECIMAL',
  NUMERIC = 'NUMERIC',
  FLOAT = 'FLOAT',
  DOUBLE = 'DOUBLE',
  
  // String
  VARCHAR = 'VARCHAR',
  CHAR = 'CHAR',
  TEXT = 'TEXT',
  
  // Date/Time
  DATE = 'DATE',
  DATETIME = 'DATETIME',
  TIMESTAMP = 'TIMESTAMP',
  TIME = 'TIME',
  
  // Boolean
  BOOLEAN = 'BOOLEAN',
  BOOL = 'BOOL',
  
  // Other
  BLOB = 'BLOB',
  JSON = 'JSON',
}

/**
 * Column definition
 */
export interface ColumnDefinition {
  name: string;
  type: SQLDataType | string;
  length?: number;
  precision?: number;
  scale?: number;
  nullable?: boolean;
  primaryKey?: boolean;
  unique?: boolean;
  autoIncrement?: boolean;
  defaultValue?: string | number | boolean | null;
  comment?: string;
}

/**
 * Foreign key relationship
 */
export interface ForeignKeyRelationship {
  columnName: string;
  referencedTable: string;
  referencedColumn: string;
}

/**
 * Table definition
 */
export interface TableDefinition {
  name: string;
  columns: Record<string, ColumnDefinition>;
  primaryKeys?: string[];
  foreignKeys?: ForeignKeyRelationship[];
  indexes?: string[][];
  comment?: string;
}

/**
 * Database schema
 */
export interface DatabaseSchema {
  tables: Record<string, TableDefinition>;
  databases?: Record<string, DatabaseSchema>;
}

/**
 * SQL Dialect
 */
export enum SQLDialect {
  MYSQL = 'mysql',
  POSTGRESQL = 'postgresql',
  SQLITE = 'sqlite',
  GENERIC = 'generic',
}

/**
 * Parser options
 */
export interface ParserOptions {
  dialect?: SQLDialect;
  schema?: DatabaseSchema;
  maxRecursionDepth?: number;
}

/**
 * Syntax error
 */
export interface SyntaxError {
  message: string;
  line: number;
  column: number;
  length: number;
  severity: 'error' | 'warning' | 'info';
  fixes?: string[];
}

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors: SyntaxError[];
}
