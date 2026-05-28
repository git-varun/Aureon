import { test } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const DIR = '/tmp/aureon_fixed';
if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });

test('asset detail - RELIANCE (hook fix)', async ({ page }) => {
    await page.goto('/assets/RELIANCE');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(DIR, '01_asset_detail_fixed.png'), fullPage: true });
});

test('settings - no double toast', async ({ page }) => {
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(DIR, '02_settings_fixed.png'), fullPage: true });
});

test('mobile dashboard - sidebar hidden', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(DIR, '03_mobile_fixed.png'), fullPage: true });
});

test('terminal overview - no chart data placeholder', async ({ page }) => {
    await page.goto('/terminal');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(DIR, '04_terminal_overview.png'), fullPage: true });
});
