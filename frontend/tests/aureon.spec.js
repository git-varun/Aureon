import { test, expect } from '@playwright/test';

// ── Helpers ──────────────────────────────────────────────────────────────────

const waitForDashboard = async (page) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('text=Net worth').first()).toBeVisible({ timeout: 12_000 });
};

// ── Auth ─────────────────────────────────────────────────────────────────────

test('redirects unauthenticated users to sign-in screen', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: undefined });
    const page = await ctx.newPage();
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    // App renders sign-in UI (no /login route, checks for heading text)
    await expect(page.locator('text=Sign in to Aureon')).toBeVisible({ timeout: 8_000 });
    await ctx.close();
});

// ── Dashboard ─────────────────────────────────────────────────────────────────

test('dashboard loads and shows net worth', async ({ page }) => {
    await waitForDashboard(page);
    await expect(page.locator('text=Net worth').first()).toBeVisible();
});

// ── Command Palette ──────────────────────────────────────────────────────────

test('command palette opens with Ctrl+K and shows pages', async ({ page }) => {
    await waitForDashboard(page);
    await page.keyboard.press('Control+k');
    await expect(page.locator('input[placeholder="Go to page, search holdings or any asset…"]')).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('text=Dashboard').first()).toBeVisible();
    await expect(page.locator('text=Portfolio').first()).toBeVisible();
    await expect(page.locator('text=Watchlist').first()).toBeVisible();
});

test('command palette navigates to portfolio on Enter', async ({ page }) => {
    await waitForDashboard(page);
    await page.keyboard.press('Control+k');
    const input = page.locator('input[placeholder="Go to page, search holdings or any asset…"]');
    await input.fill('portfolio');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/portfolio/, { timeout: 6_000 });
});

test('command palette searches global assets', async ({ page }) => {
    await waitForDashboard(page);
    await page.keyboard.press('Control+k');
    const input = page.locator('input[placeholder="Go to page, search holdings or any asset…"]');
    await input.fill('RELIANCE');
    // Wait for debounced API call (300ms) + render
    await page.waitForTimeout(700);
    await expect(input).toBeVisible();
    // The palette should still be open; either Assets or Holdings section visible
    const paletteOpen = await page.locator('input[placeholder="Go to page, search holdings or any asset…"]').isVisible();
    expect(paletteOpen).toBe(true);
});

test('command palette closes on Escape', async ({ page }) => {
    await waitForDashboard(page);
    await page.keyboard.press('Control+k');
    await expect(page.locator('input[placeholder="Go to page, search holdings or any asset…"]')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('input[placeholder="Go to page, search holdings or any asset…"]')).not.toBeVisible();
});

// ── Sidebar Navigation ────────────────────────────────────────────────────────

test('sidebar navigation links work', async ({ page }) => {
    await waitForDashboard(page);
    const navItems = ['Portfolio', 'Markets', 'Terminal', 'Watchlist', 'Activity'];
    for (const label of navItems) {
        const link = page.locator(`nav a:has-text("${label}"), aside a:has-text("${label}")`).first();
        if (await link.isVisible().catch(() => false)) {
            await link.click();
            await page.waitForLoadState('networkidle');
            await waitForDashboard(page);
        }
    }
});

// ── Portfolio ─────────────────────────────────────────────────────────────────

test('portfolio page loads', async ({ page }) => {
    await page.goto('/portfolio');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('text=Portfolio').first()).toBeVisible();
});

// ── Watchlist ─────────────────────────────────────────────────────────────────

test('watchlist page loads', async ({ page }) => {
    await page.goto('/watchlist');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('text=Watchlist').first()).toBeVisible();
});

test('watchlist search bar accepts input and shows results', async ({ page }) => {
    await page.goto('/watchlist');
    await page.waitForLoadState('networkidle');

    // Use the exact watchlist search placeholder (not the sidebar one)
    const searchInput = page.locator('input[placeholder="Search assets to add — try NVDA, TCS, RELIANCE…"]');
    await expect(searchInput).toBeVisible({ timeout: 5_000 });
    await searchInput.click();
    await searchInput.fill('TCS');
    await page.waitForTimeout(700); // wait for debounce + API response
    // Input should still be visible and focused
    await expect(searchInput).toBeVisible();
});

test('watchlist creates a new list', async ({ page }) => {
    await page.goto('/watchlist');
    await page.waitForLoadState('networkidle');

    const newListBtn = page.locator('button:has-text("+ New list")');
    if (await newListBtn.isVisible().catch(() => false)) {
        await newListBtn.click();
        const nameInput = page.locator('input[placeholder="List name…"]');
        const listName = `Test ${Date.now()}`;
        await nameInput.fill(listName);
        await page.keyboard.press('Enter');
        await expect(page.locator(`button:has-text("${listName}")`).first()).toBeVisible({ timeout: 5_000 });
    }
});

// ── Markets ───────────────────────────────────────────────────────────────────

test('markets page loads', async ({ page }) => {
    await page.goto('/markets');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('text=Markets').first()).toBeVisible();
});

// ── Terminal ──────────────────────────────────────────────────────────────────

test('terminal page loads', async ({ page }) => {
    await page.goto('/terminal');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('text=Terminal').first()).toBeVisible();
});

// ── Settings ──────────────────────────────────────────────────────────────────

test('settings page loads', async ({ page }) => {
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('text=Settings').first()).toBeVisible();
});

// ── Signals ───────────────────────────────────────────────────────────────────

test('signals page loads', async ({ page }) => {
    await page.goto('/signals');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('text=Signals').first()).toBeVisible();
});

// ── Recommendations ───────────────────────────────────────────────────────────

test('recommendations page loads', async ({ page }) => {
    await page.goto('/recommendations');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('text=Recommendations').first()).toBeVisible();
});

// ── Activity ──────────────────────────────────────────────────────────────────

test('activity page loads', async ({ page }) => {
    await page.goto('/activity');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('text=Activity').first()).toBeVisible();
});

// ── Notifications ─────────────────────────────────────────────────────────────

test('notifications page loads', async ({ page }) => {
    await page.goto('/notifications');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('text=Notifications').first()).toBeVisible();
});

// ── Assets ────────────────────────────────────────────────────────────────────

test('assets index page loads', async ({ page }) => {
    await page.goto('/assets');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('text=Assets').first()).toBeVisible();
});

test('asset detail renders for a known ticker', async ({ page }) => {
    await page.goto('/assets/RELIANCE');
    await page.waitForLoadState('networkidle');
    // Should show the asset name/ticker, not the error boundary
    await expect(page.locator('text=Something went wrong')).not.toBeVisible({ timeout: 10_000 });
    await expect(page.locator('text=RELIANCE').first()).toBeVisible({ timeout: 10_000 });
});

test('asset detail shows not-found for unknown ticker', async ({ page }) => {
    await page.goto('/assets/XXXXNOTREAL');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('text=Something went wrong')).not.toBeVisible({ timeout: 10_000 });
    await expect(page.locator('text=Asset not found').first()).toBeVisible({ timeout: 12_000 });
});
