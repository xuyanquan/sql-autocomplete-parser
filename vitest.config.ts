import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/__tests__/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: [
        'node_modules/',
        'dist/',
        'src/__tests__/',
        '**/*.spec.ts',
        '**/*.test.ts',
        'src/types/',
      ],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 85,
        statements: 90,
      },
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@/tokenizer': resolve(__dirname, './src/tokenizer'),
      '@/parser': resolve(__dirname, './src/parser'),
      '@/analyzer': resolve(__dirname, './src/analyzer'),
      '@/engine': resolve(__dirname, './src/engine'),
      '@/schema': resolve(__dirname, './src/schema'),
      '@/validator': resolve(__dirname, './src/validator'),
      '@/ui': resolve(__dirname, './src/ui'),
      '@/types': resolve(__dirname, './src/types'),
      '@/utils': resolve(__dirname, './src/utils'),
    },
  },
});
