import { defineConfig, devices } from '@playwright/test';
import { config } from 'dotenv';
import path from 'path';

config({ path: path.resolve(import.meta.dirname, '../.env.test') });

export default defineConfig({
    testDir: './tests',
    timeout: 30_000,
    expect: { timeout: 8_000 },
    fullyParallel: false,
    retries: 1,
    reporter: [['list'], ['html', { open: 'never' }]],

    use: {
        baseURL: process.env.BASE_URL || `http://localhost:${process.env.FRONTEND_PORT || '3000'}`,
        channel: 'chrome',
        headless: false,
        viewport: { width: 1440, height: 900 },
        screenshot: 'only-on-failure',
        video: 'off',
        trace: 'retain-on-failure',
        launchOptions: {
            executablePath: '/usr/bin/google-chrome',
        },
    },

    projects: [
        {
            name: 'setup',
            testMatch: '**/global.setup.js',
            // Long timeout to allow manual OTP entry; no retries (resending OTP is wasteful)
            timeout: 300_000,
            retries: 0,
        },
        {
            name: 'aureon',
            dependencies: ['setup'],
            use: {
                ...devices['Desktop Chrome'],
                storageState: 'tests/.auth/user.json',
            },
        },
    ],
});
