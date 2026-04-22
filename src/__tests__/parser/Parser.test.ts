import { describe, it, expect } from 'vitest';
import { Parser } from '../parser';
import { Tokenizer } from '../tokenizer';

describe('Parser', () => {
  describe('SELECT statement parsing', () => {
    it('should parse simple SELECT with FROM', () => {
      const tokenizer = new Tokenizer('SELECT id FROM users');
      const tokens = tokenizer.tokenize();
      const parser = new Parser(tokens);
      const ast = parser.parse();

      expect(ast).not.toBeNull();
      expect(ast?.type).toBe('SelectStatement');
      expect((ast as any).selectClause).toBeDefined();
      expect((ast as any).fromClause).toBeDefined();
    });

    it('should parse SELECT with WHERE clause', () => {
      const tokenizer = new Tokenizer('SELECT * FROM users WHERE age > 18');
      const tokens = tokenizer.tokenize();
      const parser = new Parser(tokens);
      const ast = parser.parse();

      expect(ast).not.toBeNull();
      expect((ast as any).whereClause).toBeDefined();
    });

    it('should parse SELECT with JOIN', () => {
      const tokenizer = new Tokenizer('SELECT * FROM users u JOIN orders o ON u.id = o.user_id');
      const tokens = tokenizer.tokenize();
      const parser = new Parser(tokens);
      const ast = parser.parse();

      expect(ast).not.toBeNull();
      expect((ast as any).fromClause.joins).toBeDefined();
      expect((ast as any).fromClause.joins.length).toBeGreaterThan(0);
    });

    it('should parse SELECT with table aliases', () => {
      const tokenizer = new Tokenizer('SELECT u.id FROM users u');
      const tokens = tokenizer.tokenize();
      const parser = new Parser(tokens);
      const ast = parser.parse();

      expect(ast).not.toBeNull();
      const tables = (ast as any).fromClause.tables;
      expect(tables[0].alias).toBe('u');
    });

    it('should parse SELECT with GROUP BY', () => {
      const tokenizer = new Tokenizer('SELECT COUNT(*) FROM users GROUP BY age');
      const tokens = tokenizer.tokenize();
      const parser = new Parser(tokens);
      const ast = parser.parse();

      expect(ast).not.toBeNull();
      expect((ast as any).groupByClause).toBeDefined();
    });

    it('should parse SELECT with ORDER BY', () => {
      const tokenizer = new Tokenizer('SELECT * FROM users ORDER BY name ASC');
      const tokens = tokenizer.tokenize();
      const parser = new Parser(tokens);
      const ast = parser.parse();

      expect(ast).not.toBeNull();
      expect((ast as any).orderByClause).toBeDefined();
    });

    it('should parse SELECT with LIMIT', () => {
      const tokenizer = new Tokenizer('SELECT * FROM users LIMIT 10');
      const tokens = tokenizer.tokenize();
      const parser = new Parser(tokens);
      const ast = parser.parse();

      expect(ast).not.toBeNull();
      expect((ast as any).limitClause).toBeDefined();
      expect((ast as any).limitClause.limit).toBe(10);
    });

    it('should parse incomplete SELECT statement', () => {
      const tokenizer = new Tokenizer('SELECT * FROM');
      const tokens = tokenizer.tokenize();
      const parser = new Parser(tokens);
      const ast = parser.parse();

      expect(ast).not.toBeNull();
      expect(ast?.incomplete).toBe(true);
    });
  });

  describe('Token position finding', () => {
    it('should find token at specific position', () => {
      const tokenizer = new Tokenizer('SELECT * FROM users');
      const tokens = tokenizer.tokenize();
      const parser = new Parser(tokens);
      
      const token = parser.findTokenAtPosition(7); // Position of *
      expect(token).not.toBeNull();
      expect(token?.value).toBe('*');
    });
  });
});
