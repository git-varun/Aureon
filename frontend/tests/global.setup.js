import { test as setup } from '@playwright/test';
import path from 'path';

const AUTH_FILE = path.join(import.meta.dirname, '.auth/user.json');
const API_URL = process.env.API_URL || `http://localhost:${process.env.FRONTEND_PORT || '8001'}`;
const BASE_URL = process.env.BASE_URL || `http://localhost:${process.env.FRONTEND_PORT || '3000'}`;
const EMAIL = process.env.TEST_EMAIL;
const PASSWORD = process.env.TEST_PASSWORD;

// Pre-generated long-lived token for dev (30 days). Regenerate if expired:
//   python3 -c "import jwt,datetime; print(jwt.encode({'sub':'2','exp':datetime.datetime.now(datetime.timezone.utc)+datetime.timedelta(days=30),'iat':datetime.datetime.now(datetime.timezone.utc)}, '<SECRET_KEY>', algorithm='HS256'))"
const DEV_TOKEN = process.env.DEV_ACCESS_TOKEN ||
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIyIiwiZXhwIjoxNzgxOTU5MjQyLCJpYXQiOjE3NzkzNjcyNDJ9.rzcWb7BEH-LnxNZJmbL9G-qI48O1QXgTizAl6o1wg2M';

setup('authenticate', async ({ page }) => {
    let accessToken = DEV_TOKEN;
    let refreshToken = null;

    // Try dev-login first (available when ENABLE_API_DOCS=true on backend)
    try {
        const res = await page.request.post(`${API_URL}/api/auth/dev-login`, {
            data: { email: EMAIL, password: PASSWORD },
            timeout: 5_000,
        });
        if (res.ok()) {
            const data = await res.json();
            accessToken = data.access_token;
            refreshToken = data.refresh_token;
            console.log('✓ Authenticated via dev-login');
        }
    } catch { /* use pre-generated token */ }

    // Inject token into browser localStorage and save the auth state
    await page.goto(BASE_URL);
    await page.evaluate(([at, rt]) => {
        localStorage.setItem('access_token', at);
        if (rt) localStorage.setItem('refresh_token', rt);
    }, [accessToken, refreshToken]);

    // Reload so the app picks up the token
    await page.goto(BASE_URL);
    await page.waitForTimeout(1000);

    await page.context().storageState({ path: AUTH_FILE });
    console.log('✓ Auth state saved');
});
