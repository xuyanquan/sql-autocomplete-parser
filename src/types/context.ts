/**
 * Context types for autocomplete
 */
export enum ContextType {
  // Statement level
  STATEMENT_START = 'STATEMENT_START',
  
  // SELECT contexts
  SELECT_COLUMN = 'SELECT_COLUMN',
  FROM_TABLE = 'FROM_TABLE',
  WHERE_CONDITION = 'WHERE_CONDITION',
  JOIN_TABLE = 'JOIN_TABLE',
  JOIN_CONDITION = 'JOIN_CONDITION',
  
  // Other contexts
  COLUMN_NAME = 'COLUMN_NAME',
  TABLE_NAME = 'TABLE_NAME',
  FUNCTION_NAME = 'FUNCTION_NAME',
  FUNCTION_ARGUMENT = 'FUNCTION_ARGUMENT',
  VALUE_EXPRESSION = 'VALUE_EXPRESSION',
  KEYWORD = 'KEYWORD',
  
  // Special
  UNKNOWN = 'UNKNOWN',
}

/**
 * Context information for autocomplete
 */
export interface ContextInfo {
  type: ContextType;
  expectedTypes: string[];
  availableTables: string[];
  availableColumns: Map<string, string[]>;
  aliases: Map<string, string>;
  confidence: number;
}

/**
 * Suggestion item type
 */
export enum SuggestionType {
  KEYWORD = 'keyword',
  TABLE = 'table',
  COLUMN = 'column',
  FUNCTION = 'function',
  SNIPPET = 'snippet',
  ALIAS = 'alias',
  OPERATOR = 'operator',
}

/**
 * Suggestion item
 */
export interface SuggestionItem {
  label: string;
  type: SuggestionType;
  detail?: string;
  documentation?: string;
  insertText?: string;
  sortText?: string;
  filterText?: string;
  score?: number;
}

/**
 * Suggestion result
 */
export interface SuggestionResult {
  items: SuggestionItem[];
  context: ContextInfo;
}
