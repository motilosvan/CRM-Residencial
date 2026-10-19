import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['node_modules/**', 'js/**', 'css/**', 'dist/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['apps/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    // Regla 2 de AGENTS.md: el dominio es puro (sin BD, sin driver, sin servidor).
    files: ['apps/api/src/domain/**/*.ts'],
    ignores: ['apps/api/src/domain/**/*.test.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: ['../db/*', '../modules/*', '../demo/*', 'mssql', 'fastify', 'node:*'] },
      ],
    },
  },
  {
    // Regla 3: SQL siempre parametrizado. Una plantilla con ${...} pasada a .query()/.batch() en código
    // de producción es sospechosa (en pruebas se permite para preparar datos).
    files: ['apps/api/src/**/*.ts'],
    ignores: ['apps/api/src/**/*.test.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          // Se permiten constantes de módulo en MAYÚSCULAS (fragmentos SQL fijos, p. ej. BANDEJA).
          selector: "CallExpression[callee.property.name=/^(query|batch)$/] > TemplateLiteral[expressions.length>0] > :expression:not(Identifier[name=/^[A-Z][A-Z0-9_]*$/])",
          message: 'SQL con interpolación: use request.input(...) (regla 3 de AGENTS.md).',
        },
      ],
    },
  },
);
