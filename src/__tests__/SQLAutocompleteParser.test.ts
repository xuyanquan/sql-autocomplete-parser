import { describe, it, expect } from 'vitest';
import { SQLAutocompleteParser, DatabaseSchema, SQLDataType, SuggestionType, ContextType } from '../index';

const testSchema: DatabaseSchema = {
  tables: {
    users: {
      name: 'users',
      columns: {
        id: { name: 'id', type: SQLDataType.INTEGER, primaryKey: true },
        name: { name: 'name', type: SQLDataType.VARCHAR, length: 255 },
        email: { name: 'email', type: SQLDataType.VARCHAR, length: 255 },
      },
    },
    orders: {
      name: 'orders',
      columns: {
        id: { name: 'id', type: SQLDataType.INTEGER, primaryKey: true },
        user_id: { name: 'user_id', type: SQLDataType.INTEGER },
        total: { name: 'total', type: SQLDataType.DECIMAL },
      },
    },
  },
};

describe('SQLAutocompleteParser', () => {
  it('should suggest keywords at statement start', () => {
    const parser = new SQLAutocompleteParser();
    const result = parser.getSuggestions('', 0);

    expect(result.context.type).toBe(ContextType.STATEMENT_START);
    expect(result.items.some(item => item.label === 'SELECT')).toBe(true);
    expect(result.items.some(item => item.label === 'INSERT')).toBe(true);
  });

  it('should suggest table names after FROM', () => {
    const parser = new SQLAutocompleteParser({ schema: testSchema });
    const result = parser.getSuggestions('SELECT * FROM ', 14);

    expect(result.context.type).toBe(ContextType.FROM_TABLE);
    expect(result.items.some(item => item.label === 'users')).toBe(true);
    expect(result.items.some(item => item.label === 'orders')).toBe(true);
  });

  it('should suggest columns in WHERE clause', () => {
    const parser = new SQLAutocompleteParser({ schema: testSchema });
    const result = parser.getSuggestions('SELECT * FROM users WHERE ', 26);

    expect(result.context.type).toBe(ContextType.WHERE_CONDITION);
    expect(result.context.availableTables).toContain('users');
    expect(result.items.some(item => item.label === 'id')).toBe(true);
    expect(result.items.some(item => item.label === 'name')).toBe(true);
    expect(result.items.some(item => item.label === 'email')).toBe(true);
  });

  it('should suggest columns and functions after SELECT', () => {
    const parser = new SQLAutocompleteParser({ schema: testSchema });
    const result = parser.getSuggestions('SELECT ', 7);

    expect(result.context.type).toBe(ContextType.SELECT_COLUMN);
    expect(result.items.some(item => item.label === '*')).toBe(true);
    expect(result.items.some(item => item.type === SuggestionType.FUNCTION)).toBe(true);
  });

  it('should update schema dynamically', () => {
    const parser = new SQLAutocompleteParser();
    parser.setSchema(testSchema);

    const result = parser.getSuggestions('SELECT * FROM ', 14);
    expect(result.items.some(item => item.label === 'users')).toBe(true);
  });
});
