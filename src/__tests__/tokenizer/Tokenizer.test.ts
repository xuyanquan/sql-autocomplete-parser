import { describe, it, expect } from 'vitest';
import { Tokenizer } from '../tokenizer';
import { TokenType } from '../types';

describe('Tokenizer', () => {
  it('should tokenize simple SELECT statement', () => {
    const tokenizer = new Tokenizer('SELECT * FROM users');
    const tokens = tokenizer.tokenize();

    expect(tokens).toHaveLength(5); // SELECT, *, FROM, users, EOF
    expect(tokens[0].type).toBe(TokenType.KEYWORD);
    expect(tokens[0].keyword).toBe('SELECT');
    expect(tokens[1].value).toBe('*');
    expect(tokens[2].keyword).toBe('FROM');
    expect(tokens[3].type).toBe(TokenType.IDENTIFIER);
    expect(tokens[3].value).toBe('users');
  });

  it('should recognize keywords case-insensitively', () => {
    const tokenizer = new Tokenizer('select from where');
    const tokens = tokenizer.tokenize();

    expect(tokens[0].type).toBe(TokenType.KEYWORD);
    expect(tokens[0].keyword).toBe('SELECT');
    expect(tokens[1].keyword).toBe('FROM');
    expect(tokens[2].keyword).toBe('WHERE');
  });

  it('should tokenize string literals', () => {
    const tokenizer = new Tokenizer("SELECT * FROM users WHERE name = 'John'");
    const tokens = tokenizer.tokenize();

    const stringToken = tokens.find(t => t.type === TokenType.STRING_LITERAL);
    expect(stringToken).toBeDefined();
    expect(stringToken?.value).toBe('John');
  });

  it('should tokenize numbers', () => {
    const tokenizer = new Tokenizer('SELECT * FROM users WHERE age > 25');
    const tokens = tokenizer.tokenize();

    const numberToken = tokens.find(t => t.type === TokenType.NUMBER_LITERAL);
    expect(numberToken).toBeDefined();
    expect(numberToken?.value).toBe('25');
  });

  it('should track token positions', () => {
    const tokenizer = new Tokenizer('SELECT *');
    const tokens = tokenizer.tokenize();

    expect(tokens[0].range.start.offset).toBe(0);
    expect(tokens[1].range.start.offset).toBe(7);
  });
});
