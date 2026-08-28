import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      'server-only': new URL('./tests/fixtures/server-only.ts', import.meta.url).pathname,
    },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'server',
          environment: 'node',
          include: ['tests/unit/server/**/*.test.ts', 'tests/integration/server/**/*.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'client',
          environment: 'jsdom',
          include: ['tests/**/*.test.{ts,tsx}'],
          exclude: ['**/server/**'],
          setupFiles: './tests/setup.ts',
        },
      },
    ],
  },
})
