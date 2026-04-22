import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
import { resolve } from 'path';

export default defineConfig({
  plugins: [
    dts({
      insertTypesEntry: true,
      rollupTypes: true,
    }),
  ],
  build: {
    lib: {
      entry: {
        index: resolve(__dirname, 'src/index.ts'),
        ui: resolve(__dirname, 'src/ui/index.ts'),
      },
      name: 'SQLAutocompleteParser',
      formats: ['es', 'cjs', 'umd'],
      fileName: (format, entryName) => {
        if (format === 'es') return `${entryName}.js`;
        if (format === 'cjs') return `${entryName}.cjs`;
        return `${entryName}.${format}.js`;
      },
    },
    rollupOptions: {
      external: ['lit'],
      output: {
        globals: {
          lit: 'Lit',
        },
      },
    },
    sourcemap: true,
    minify: 'esbuild',
    target: 'es2018',
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
  test: {
    globals: true,
    environment: 'jsdom',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        '**/*.spec.ts',
        '**/*.test.ts',
      ],
    },
  },
});
