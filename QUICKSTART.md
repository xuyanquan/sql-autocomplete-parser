# 🚀 Quick Start Guide

## Installation

```bash
npm install
```

## Run Example

```bash
npm run dev
# Or directly with ts-node
npx tsx src/example.ts
```

## Run Tests

```bash
# Run all tests
npm test

# Run tests with UI
npm run test:ui

# Run tests with coverage
npm run test:coverage
```

## Build

```bash
npm run build
```

## Basic Usage

```typescript
import { SQLAutocompleteParser, DatabaseSchema, SQLDataType } from './index';

// Define your database schema
const schema: DatabaseSchema = {
  tables: {
    users: {
      name: 'users',
      columns: {
        id: { name: 'id', type: SQLDataType.INTEGER, primaryKey: true },
        name: { name: 'name', type: SQLDataType.VARCHAR, length: 255 },
        email: { name: 'email', type: SQLDataType.VARCHAR, length: 255 },
      },
    },
  },
};

// Create parser instance
const parser = new SQLAutocompleteParser({ schema });

// Get autocomplete suggestions
const sql = 'SELECT * FROM ';
const cursorPosition = sql.length;
const result = parser.getSuggestions(sql, cursorPosition);

console.log('Suggestions:', result.items);
// Output: [{ label: 'users', type: 'table', ... }]
```

## Features (MVP)

✅ **Core Functionality:**
- SQL Tokenization (keywords, identifiers, literals, operators)
- SELECT statement parsing
- Context-aware suggestions
- Schema-based table and column suggestions
- Keyword and function suggestions
- Position tracking

✅ **Supported SQL:**
- SELECT statements with FROM, WHERE clauses
- Table aliases
- Multiple tables
- Column references

⏳ **Coming Soon:**
- JOIN clause support
- INSERT/UPDATE/DELETE statements
- Subqueries
- GROUP BY, ORDER BY, LIMIT
- Syntax validation
- Error recovery

## Project Structure

```
src/
├── types/              # TypeScript type definitions
│   ├── token.ts       # Token types
│   ├── ast.ts         # AST node types
│   ├── context.ts     # Context and suggestion types
│   └── schema.ts      # Schema types
├── tokenizer/         # SQL tokenization
│   └── Tokenizer.ts
├── parser/            # SQL parsing
│   └── Parser.ts
├── schema/            # Schema management
│   └── SchemaManager.ts
├── index.ts           # Main API (SQLAutocompleteParser)
├── example.ts         # Usage examples
└── __tests__/         # Unit tests
```

## Development

```bash
# Type checking
npm run typecheck

# Linting
npm run lint

# Format code
npm run format

# Run all checks
npm run typecheck && npm run lint && npm test
```

## Next Steps

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Run the example:**
   ```bash
   npx tsx src/example.ts
   ```

3. **Run tests:**
   ```bash
   npm test
   ```

4. **Build the project:**
   ```bash
   npm run build
   ```

## API Reference

### `SQLAutocompleteParser`

Main class for SQL autocomplete functionality.

#### Constructor

```typescript
new SQLAutocompleteParser(options?: ParserOptions)
```

#### Methods

**`getSuggestions(sql: string, cursorPosition: number): SuggestionResult`**

Get autocomplete suggestions for SQL at cursor position.

**`setSchema(schema: DatabaseSchema): void`**

Update the database schema.

### Example Schemas

See `src/example.ts` for a complete example with users, orders, and products tables.

## Troubleshooting

**Issue: Import errors**
- Make sure to run `npm install` first
- Check that `tsconfig.json` paths are correctly configured

**Issue: Tests failing**
- Run `npm run typecheck` to check for TypeScript errors
- Make sure all dependencies are installed

**Issue: Build errors**
- Clean and rebuild: `rm -rf dist && npm run build`

## Contributing

This is an MVP (Minimum Viable Product). Contributions are welcome!

Areas for improvement:
- Complete JOIN support
- Syntax validation
- More SQL dialects (PostgreSQL, SQL Server)
- Better error recovery
- UI components
- Performance optimization

## License

MIT - see LICENSE file
