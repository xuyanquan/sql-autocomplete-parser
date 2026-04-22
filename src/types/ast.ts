import { SourceRange } from './token';

/**
 * AST Node base interface
 */
export interface ASTNode {
  type: string;
  range: SourceRange;
  incomplete?: boolean;
}

/**
 * SELECT Statement
 */
export interface SelectStatement extends ASTNode {
  type: 'SelectStatement';
  selectClause: SelectClause;
  fromClause?: FromClause;
  whereClause?: WhereClause;
  groupByClause?: GroupByClause;
  havingClause?: HavingClause;
  orderByClause?: OrderByClause;
  limitClause?: LimitClause;
}

/**
 * SELECT Clause
 */
export interface SelectClause extends ASTNode {
  type: 'SelectClause';
  columns: (ColumnReference | AllColumnsReference | Expression)[];
  distinct?: boolean;
}

/**
 * FROM Clause
 */
export interface FromClause extends ASTNode {
  type: 'FromClause';
  tables: TableReference[];
  joins?: JoinClause[];
}

/**
 * Table Reference
 */
export interface TableReference extends ASTNode {
  type: 'TableReference';
  tableName: string;
  alias?: string;
  database?: string;
}

/**
 * Column Reference
 */
export interface ColumnReference extends ASTNode {
  type: 'ColumnReference';
  columnName: string;
  tableName?: string;
  alias?: string;
}

/**
 * All Columns Reference (*)
 */
export interface AllColumnsReference extends ASTNode {
  type: 'AllColumnsReference';
  tableName?: string;
}

/**
 * JOIN Clause
 */
export interface JoinClause extends ASTNode {
  type: 'JoinClause';
  joinType: 'INNER' | 'LEFT' | 'RIGHT' | 'CROSS' | 'FULL';
  table: TableReference;
  condition?: Expression;
}

/**
 * WHERE Clause
 */
export interface WhereClause extends ASTNode {
  type: 'WhereClause';
  condition: Expression;
}

/**
 * GROUP BY Clause
 */
export interface GroupByClause extends ASTNode {
  type: 'GroupByClause';
  columns: ColumnReference[];
}

/**
 * HAVING Clause
 */
export interface HavingClause extends ASTNode {
  type: 'HavingClause';
  condition: Expression;
}

/**
 * ORDER BY Clause
 */
export interface OrderByClause extends ASTNode {
  type: 'OrderByClause';
  items: OrderByItem[];
}

export interface OrderByItem extends ASTNode {
  type: 'OrderByItem';
  column: ColumnReference;
  direction?: 'ASC' | 'DESC';
}

/**
 * LIMIT Clause
 */
export interface LimitClause extends ASTNode {
  type: 'LimitClause';
  limit: number;
  offset?: number;
}

/**
 * Expression (simplified for MVP)
 */
export interface Expression extends ASTNode {
  type: 'BinaryExpression' | 'UnaryExpression' | 'FunctionCall' | 'Literal';
}

/**
 * Binary Expression
 */
export interface BinaryExpression extends Expression {
  type: 'BinaryExpression';
  left: Expression | ColumnReference;
  operator: string;
  right: Expression | ColumnReference | Literal;
}

/**
 * Function Call
 */
export interface FunctionCall extends Expression {
  type: 'FunctionCall';
  functionName: string;
  arguments: (Expression | ColumnReference | Literal)[];
}

/**
 * Literal Value
 */
export interface Literal extends ASTNode {
  type: 'Literal';
  valueType: 'STRING' | 'NUMBER' | 'BOOLEAN' | 'NULL';
  value: string | number | boolean | null;
}

/**
 * INSERT Statement
 */
export interface InsertStatement extends ASTNode {
  type: 'InsertStatement';
  table: TableReference;
  columns?: string[];
  values: Literal[][];
}

/**
 * UPDATE Statement
 */
export interface UpdateStatement extends ASTNode {
  type: 'UpdateStatement';
  table: TableReference;
  assignments: Assignment[];
  whereClause?: WhereClause;
}

export interface Assignment extends ASTNode {
  type: 'Assignment';
  column: string;
  value: Expression | Literal;
}

/**
 * DELETE Statement
 */
export interface DeleteStatement extends ASTNode {
  type: 'DeleteStatement';
  table: TableReference;
  whereClause?: WhereClause;
}

/**
 * Statement type union
 */
export type Statement = SelectStatement | InsertStatement | UpdateStatement | DeleteStatement;
