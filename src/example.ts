import { SQLAutocompleteParser, DatabaseSchema, SQLDataType } from './index';

// Define example database schema
const exampleSchema: DatabaseSchema = {
  tables: {
    users: {
      name: 'users',
      columns: {
        id: {
          name: 'id',
          type: SQLDataType.INTEGER,
          primaryKey: true,
          autoIncrement: true,
        },
        name: {
          name: 'name',
          type: SQLDataType.VARCHAR,
          length: 255,
        },
        email: {
          name: 'email',
          type: SQLDataType.VARCHAR,
          length: 255,
          unique: true,
        },
        age: {
          name: 'age',
          type: SQLDataType.INTEGER,
        },
        created_at: {
          name: 'created_at',
          type: SQLDataType.TIMESTAMP,
        },
      },
    },
    orders: {
      name: 'orders',
      columns: {
        id: {
          name: 'id',
          type: SQLDataType.INTEGER,
          primaryKey: true,
        },
        user_id: {
          name: 'user_id',
          type: SQLDataType.INTEGER,
        },
        total: {
          name: 'total',
          type: SQLDataType.DECIMAL,
          precision: 10,
          scale: 2,
        },
        status: {
          name: 'status',
          type: SQLDataType.VARCHAR,
          length: 50,
        },
        order_date: {
          name: 'order_date',
          type: SQLDataType.DATE,
        },
      },
      foreignKeys: [
        {
          columnName: 'user_id',
          referencedTable: 'users',
          referencedColumn: 'id',
        },
      ],
    },
    products: {
      name: 'products',
      columns: {
        id: {
          name: 'id',
          type: SQLDataType.INTEGER,
          primaryKey: true,
        },
        name: {
          name: 'name',
          type: SQLDataType.VARCHAR,
          length: 255,
        },
        price: {
          name: 'price',
          type: SQLDataType.DECIMAL,
          precision: 10,
          scale: 2,
        },
        description: {
          name: 'description',
          type: SQLDataType.TEXT,
        },
        in_stock: {
          name: 'in_stock',
          type: SQLDataType.BOOLEAN,
        },
      },
    },
  },
};

// Create parser instance
const parser = new SQLAutocompleteParser({
  schema: exampleSchema,
});

// Example 1: Get suggestions after SELECT
console.log('\\n=== Example 1: After SELECT ===');
const sql1 = 'SELECT ';
const result1 = parser.getSuggestions(sql1, sql1.length);
console.log('SQL:', sql1);
console.log('Context:', result1.context.type);
console.log('Suggestions:', result1.items.slice(0, 10).map(item => `${item.label} (${item.type})`));

// Example 2: Get table suggestions after FROM
console.log('\\n=== Example 2: After FROM ===');
const sql2 = 'SELECT * FROM ';
const result2 = parser.getSuggestions(sql2, sql2.length);
console.log('SQL:', sql2);
console.log('Context:', result2.context.type);
console.log('Suggestions:', result2.items.map(item => `${item.label} (${item.type})`));

// Example 3: Get column suggestions in WHERE clause
console.log('\\n=== Example 3: After WHERE ===');
const sql3 = 'SELECT * FROM users WHERE ';
const result3 = parser.getSuggestions(sql3, sql3.length);
console.log('SQL:', sql3);
console.log('Context:', result3.context.type);
console.log('Available tables:', result3.context.availableTables);
console.log('Suggestions:', result3.items.slice(0, 15).map(item => `${item.label} (${item.type})`));

// Example 4: Column suggestions with table context
console.log('\\n=== Example 4: SELECT with FROM context ===');
const sql4 = 'SELECT  FROM users';
const cursorPos4 = 7; // Between SELECT and FROM
const result4 = parser.getSuggestions(sql4, cursorPos4);
console.log('SQL:', sql4);
console.log('Cursor at position:', cursorPos4);
console.log('Context:', result4.context.type);
console.log('Available columns:', Array.from(result4.context.availableColumns.entries()));
console.log('Suggestions:', result4.items.slice(0, 10).map(item => `${item.label} (${item.type})`));

// Example 5: Statement start
console.log('\\n=== Example 5: Statement start ===');
const sql5 = '';
const result5 = parser.getSuggestions(sql5, 0);
console.log('SQL:', sql5 || '(empty)');
console.log('Context:', result5.context.type);
console.log('Suggestions:', result5.items.map(item => `${item.label} (${item.type})`));

// Example 6: JOIN suggestions
console.log('\\n=== Example 6: JOIN context ===');
const sql6 = 'SELECT * FROM users JOIN ';
const result6 = parser.getSuggestions(sql6, sql6.length);
console.log('SQL:', sql6);
console.log('Context:', result6.context.type);
console.log('Suggestions:', result6.items.slice(0, 5).map(item => `${item.label} (${item.type})`));

// Example 7: Syntax validation
console.log('\\n=== Example 7: Syntax Validation ===');
const sql7Valid = 'SELECT id, name FROM users WHERE age > 18';
const sql7Invalid = 'SELECT id FROM unknown_table';

console.log('Valid SQL:', sql7Valid);
const validation1 = parser.validate(sql7Valid);
console.log('Valid:', validation1.valid);
console.log('Errors:', validation1.errors.length);

console.log('\\nInvalid SQL:', sql7Invalid);
const validation2 = parser.validate(sql7Invalid);
console.log('Valid:', validation2.valid);
console.log('Errors:', validation2.errors.map(e => `${e.severity}: ${e.message}`));

// Example 8: JOIN with ON condition
console.log('\\n=== Example 8: JOIN ON condition ===');
const sql8 = 'SELECT * FROM users u JOIN orders o ON ';
const result8 = parser.getSuggestions(sql8, sql8.length);
console.log('SQL:', sql8);
console.log('Context:', result8.context.type);
console.log('Available tables:', result8.context.availableTables);
console.log('Available aliases:', Array.from(result8.context.aliases.entries()));
console.log('Suggestions (first 10):', result8.items.slice(0, 10).map(item => `${item.label} (${item.type})`));

// Example 9: Complex query with multiple tables
console.log('\\n=== Example 9: Complex query ===');
const sql9 = 'SELECT u.name, o.total FROM users u JOIN orders o ON u.id = o.user_id WHERE ';
const result9 = parser.getSuggestions(sql9, sql9.length);
console.log('SQL:', sql9);
console.log('Context:', result9.context.type);
console.log('Available columns for suggestions:', result9.items.filter(i => i.type === 'column').length);
console.log('Sample suggestions:', result9.items.slice(0, 10).map(item => `${item.label} (${item.type}) [score: ${item.score}]`));
