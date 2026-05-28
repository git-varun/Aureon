import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const FLOW_DIR = '/tmp/aureon_data_flows';
if (!fs.existsSync(FLOW_DIR)) fs.mkdirSync(FLOW_DIR, { recursive: true });

const snap = async (page, name) => {
    await page.screenshot({ path: path.join(FLOW_DIR, `${name}.png`), fullPage: true });
};

const waitForDashboard = async (page) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('text=Net worth').first()).toBeVisible({ timeout: 12_000 });
};

// ── Flow 1: Command Palette & Page Navigation ──────────────────────────────
test('Flow 1: Command Palette Navigation', async ({ page }) => {
    await waitForDashboard(page);
    await snap(page, '01_dashboard_home');

    // Open command palette
    await page.keyboard.press('Control+k');
    const input = page.locator('input[placeholder="Go to page, search holdings or any asset…"]');
    await expect(input).toBeVisible({ timeout: 5_000 });
    await snap(page, '02_command_palette_open');

    // Type and navigate to Markets
    await input.fill('markets');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/markets/, { timeout: 6_000 });
    await page.waitForLoadState('networkidle');
    await snap(page, '03_markets_navigated');
});

// ── Flow 2: Recommendation Lifecycle (Evaluate -> Confirm/Apply -> Undo) ─────
test('Flow 2: Recommendation Lifecycle', async ({ page }) => {
    await waitForDashboard(page);

    // Navigate to Recommendations page
    await page.goto('/recommendations');
    await page.waitForLoadState('networkidle');
    await snap(page, '04_recs_initial');

    // Locate the first Evaluate button
    const evalBtn = page.locator('button:has-text("Evaluate →")').first();
    if (await evalBtn.isVisible()) {
        await evalBtn.click();
        await page.waitForTimeout(600); // Wait for transition
        await snap(page, '05_rec_evaluating');

        // Locate confirm button
        const confirmBtn = page.locator('button:has-text("Confirm")').first();
        if (await confirmBtn.isVisible()) {
            await confirmBtn.click();
            await page.waitForTimeout(800); // Wait for apply transaction
            await snap(page, '06_rec_applied');

            // Locate Undo button in OutcomeFeedbackCard
            const undoBtn = page.locator('button:has-text("Undo")').first();
            if (await undoBtn.isVisible()) {
                await undoBtn.click();
                await page.waitForTimeout(800); // Wait for undo action
                await snap(page, '07_rec_undone');
                // Verify the evaluate button is back
                await expect(evalBtn).toBeVisible();
            }
        }
    }
});

// ── Flow 3: Watchlist Management Flow ───────────────────────────────────────
test('Flow 3: Watchlist Workflow', async ({ page }) => {
    await page.goto('/watchlist');
    await page.waitForLoadState('networkidle');
    await snap(page, '08_watchlist_initial');

    // Create a new list
    const newListBtn = page.locator('button:has-text("+ New list")');
    if (await newListBtn.isVisible()) {
        await newListBtn.click();
        const nameInput = page.locator('input[placeholder="List name…"]');
        const listName = `Flow Test List`;
        await nameInput.fill(listName);
        await page.keyboard.press('Enter');
        await page.waitForTimeout(600);
        await snap(page, '09_watchlist_list_created');

        // Add a symbol to the newly created list
        const searchInput = page.locator('input[placeholder="Search assets to add — try NVDA, TCS, RELIANCE…"]');
        await expect(searchInput).toBeVisible();
        await searchInput.click();
        await searchInput.fill('RELIANCE');
        await page.waitForTimeout(1000); // Debounce + API lookup
        await snap(page, '10_watchlist_search_results');

        // Click first item in search result dropdown if exists
        const firstResult = page.locator('div[style*="cursor: pointer"], button:has-text("RELIANCE")').first();
        if (await firstResult.isVisible()) {
            await firstResult.click();
            await page.waitForTimeout(1000); // wait for addition
            await snap(page, '11_watchlist_symbol_added');
        }
    }
});

// ── Flow 4: Thematic Baskets & AI Integration ──────────────────────────────
test('Flow 4: Themes & AI Analysis', async ({ page }) => {
    await page.goto('/markets');
    await page.waitForLoadState('networkidle');

    // Click on a theme detail card if visible
    const firstThemeLink = page.locator('div:has-text("Green Energy"), div:has-text("Digital India"), a[href*="themes"]').first();
    if (await firstThemeLink.isVisible()) {
        await firstThemeLink.click();
    } else {
        // Fallback: go directly to a known theme detail
        await page.goto('/markets/themes/green_energy');
    }
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    await snap(page, '12_theme_detail_overview');

    // Click Technical tab
    const techTab = page.locator('button:has-text("Technical")').first();
    if (await techTab.isVisible()) {
        await techTab.click();
        await page.waitForTimeout(500);
        await snap(page, '13_theme_technical_tab');

        // Generate theme signal
        const genBtn = page.locator('button:has-text("Generate Theme Signal")').first();
        if (await genBtn.isVisible()) {
            await genBtn.click();
            await page.waitForTimeout(2500); // Simulation/API delay
            await snap(page, '14_theme_technical_generated');
        }
    }

    // Click AI Chat tab
    const aiTab = page.locator('button:has-text("AI Chat")').first();
    if (await aiTab.isVisible()) {
        await aiTab.click();
        await page.waitForTimeout(500);
        await snap(page, '15_theme_ai_chat_tab');

        // Fill question and ask
        const qInput = page.locator('input[placeholder*="Ask Aureon about this theme"], textarea[placeholder*="Ask"]').first();
        if (await qInput.isVisible()) {
            await qInput.fill('Which constituent has the best risk/reward ratio?');
            const askBtn = page.locator('button:has-text("Send"), button:has-text("Ask")').first();
            if (await askBtn.isVisible()) {
                await askBtn.click();
                await page.waitForTimeout(3000); // AI service delay
                await snap(page, '16_theme_ai_chat_response');
            }
        }
    }
});

// ── Flow 5: Interactive Terminal AI Ask ─────────────────────────────────────
test('Flow 5: Interactive Terminal AI Ask', async ({ page }) => {
    await page.goto('/terminal/RELIANCE');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    await snap(page, '17_terminal_initial');

    // Go to AI tab
    const aiTab = page.locator('button:has-text("AI Take"), button:has-text("AI")').last();
    if (await aiTab.isVisible()) {
        await aiTab.click();
        await page.waitForTimeout(1000);
        await snap(page, '18_terminal_ai_tab');

        // Find input box and ask question
        const askInput = page.locator('input[placeholder*="Ask a question"], input[placeholder*="Ask Aureon"]').first();
        if (await askInput.isVisible()) {
            await askInput.fill('Why is RSI high?');
            const askBtn = page.locator('button:has-text("Ask")').first();
            if (await askBtn.isVisible()) {
                await askBtn.click();
                await page.waitForTimeout(3000); // AI service delay
                await snap(page, '19_terminal_ai_asked');
            }
        }
    }
});
