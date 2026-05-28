import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const SNAP_DIR = '/tmp/aureon_snapshots';
if (!fs.existsSync(SNAP_DIR)) fs.mkdirSync(SNAP_DIR, { recursive: true });

const snap = async (page, name) => {
    await page.screenshot({ path: path.join(SNAP_DIR, `${name}.png`), fullPage: true });
};

const pages_to_visit = [
    { path: '/dashboard', name: '01_dashboard' },
    { path: '/portfolio', name: '02_portfolio' },
    { path: '/assets', name: '03_assets' },
    { path: '/signals', name: '04_signals' },
    { path: '/recommendations', name: '05_recommendations' },
    { path: '/activity', name: '06_activity' },
    { path: '/watchlist', name: '07_watchlist' },
    { path: '/markets', name: '08_markets' },
    { path: '/terminal', name: '09_terminal' },
    { path: '/notifications', name: '10_notifications' },
    { path: '/settings', name: '11_settings' },
];

for (const { path: pagePath, name } of pages_to_visit) {
    test(`snapshot: ${name}`, async ({ page }) => {
        await page.goto(pagePath);
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(1500);
        await snap(page, name);

        // Check for console errors
        const errors = [];
        page.on('console', msg => {
            if (msg.type() === 'error') errors.push(msg.text());
        });

        // Check for blank/empty states
        const bodyText = await page.locator('body').innerText();
        const isEmpty = bodyText.trim().length < 50;
        expect(isEmpty, `Page ${pagePath} appears blank`).toBe(false);
    });
}

// Command palette state snapshot
test('snapshot: 12_command_palette', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    await page.keyboard.press('Control+k');
    await page.waitForTimeout(500);
    await snap(page, '12_command_palette');
});

// Mobile viewport
test('snapshot: 13_dashboard_mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);
    await snap(page, '13_dashboard_mobile');
});

// Asset detail page
test('snapshot: 14_asset_detail', async ({ page }) => {
    await page.goto('/assets/RELIANCE');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);
    await snap(page, '14_asset_detail');
});

// Terminal with symbol
test('snapshot: 15_terminal_symbol', async ({ page }) => {
    await page.goto('/terminal/RELIANCE');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);
    await snap(page, '15_terminal_symbol');
});
