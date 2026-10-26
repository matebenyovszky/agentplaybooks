import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
    test: {
        environment: 'node',
        globals: true,
        include: ['tests/**/*.{test,spec}.{js,ts,tsx}', 'src/**/*.{test,spec}.{js,ts,tsx}'],
        exclude: ['tests/e2e/**', 'node_modules/**'],
        setupFiles: ['./tests/setup.ts'],
        alias: {
            '@': path.resolve(process.cwd(), './src'),
        },
        env: {
            NEXT_PUBLIC_SUPABASE_URL: 'https://mock.supabase.co',
            NEXT_PUBLIC_SUPABASE_ANON_KEY: 'mock-anon-key',
            SUPABASE_SERVICE_ROLE_KEY: 'mock-service-role-key',
        },
    },
});
