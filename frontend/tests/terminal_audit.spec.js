import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const AUDIT_DIR = '/tmp/aureon_terminal_chrome_audit';
if (!fs.existsSync(AUDIT_DIR)) fs.mkdirSync(AUDIT_DIR, { recursive: true });

const snap = async (page, name) => {
    await page.screenshot({ path: path.join(AUDIT_DIR, `${name}.png`), fullPage: true });
};

test.use({ storageState: 'tests/.auth/user.json' });

test('Terminal Screen - Live Chrome Audit', async ({ page }) => {
    // 1. Go to Terminal page
    await page.goto('/terminal');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    await expect(page.locator('text=Look up an asset').first()).toBeVisible({ timeout: 10_000 });
    await snap(page, '01_terminal_empty_state');

    // 2. Click search input and type TCS
    const searchInput = page.locator('input[placeholder="Search symbol or company name…"]').first();
    await expect(searchInput).toBeVisible();
    await searchInput.click();
    await searchInput.fill('TCS');
    await page.waitForTimeout(1200); // Wait for debounce and suggest results
    await snap(page, '02_search_dropdown_suggest');

    // 3. Select TCS from suggestions list
    // Look for TCS in the dropdown button grid
    const suggestionBtn = page.locator('button:has-text("TCS")').first();
    if (await suggestionBtn.isVisible()) {
        await suggestionBtn.click();
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(1500);
    } else {
        // Fallback directly to TCS url
        await page.goto('/terminal/TCS');
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(1500);
    }
    await snap(page, '03_tcs_overview_tab');

    // 4. Verify quick stats are present on Overview
    await expect(page.locator('text=Quick stats')).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('text=Prev close').first()).toBeVisible();

    // 5. Navigate to Chart Tab
    const chartTab = page.locator('button:has-text("chart")').first();
    if (await chartTab.isVisible()) {
        await chartTab.click();
        await page.waitForTimeout(2000); // Wait for TradingView/lightweight-charts to render
        await snap(page, '04_tcs_chart_tab');

        // Toggle DMA overlay if visible
        const dmaBtn = page.locator('button:has-text("50/200 DMA")').first();
        if (await dmaBtn.isVisible()) {
            await dmaBtn.click();
            await page.waitForTimeout(800);
            await snap(page, '05_tcs_chart_with_dma');
        }
    }

    // 6. Navigate to Technical Tab
    const techTab = page.locator('button:has-text("technical")').first();
    if (await techTab.isVisible()) {
        await techTab.click();
        await page.waitForTimeout(1000);
        await snap(page, '06_tcs_technical_initial');

        // Click "Generate signal" if empty signal state is shown
        const genBtn = page.locator('button:has-text("Generate signal")').first();
        if (await genBtn.isVisible()) {
            await genBtn.click();
            await page.waitForTimeout(2500); // wait for TA-engine simulation
            await snap(page, '07_tcs_technical_generated');
        }
    }

    // 7. Navigate to Fundamentals Tab
    const fundTab = page.locator('button:has-text("fundamentals")').first();
    if (await fundTab.isVisible()) {
        await fundTab.click();
        await page.waitForTimeout(1000);
        await snap(page, '08_tcs_fundamentals_initial');

        // Click "Refresh" button on fundamentals
        const refreshBtn = page.locator('button:has-text("Refresh")').first();
        if (await refreshBtn.isVisible()) {
            await refreshBtn.click();
            await page.waitForTimeout(2000); // Wait for API update
            await snap(page, '09_tcs_fundamentals_refreshed');
        }
    }

    // 8. Navigate to AI take Tab
    const aiTab = page.locator('button:has-text("AI take")').first();
    if (await aiTab.isVisible()) {
        await aiTab.click();
        await page.waitForTimeout(1000);
        await snap(page, '10_tcs_ai_take_initial');

        // Click "Run AI analysis" if empty
        const runBtn = page.locator('button:has-text("Run AI analysis"), button:has-text("Re-run analysis")').first();
        if (await runBtn.isVisible()) {
            await runBtn.click();
            await page.waitForTimeout(3500); // Wait for mock or live AI completion
            await snap(page, '11_tcs_ai_take_completed');
        }
    }
});
