import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
    plugins: [react()],
    test: {
        environment: 'node',
        globals: true,
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
