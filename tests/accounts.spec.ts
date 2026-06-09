import { test, expect } from '@playwright/test';

test('Verify Accounts Tab: Modal Creation, Polling, and Diagnostics Telemetry', async ({ page }) => {
  test.setTimeout(60000);

  // Variable to control simulated connection status
  let isConnected = false;
  let isCreated = false;

  // Log all intercepted or outgoing API requests for debugging
  page.on('request', req => {
    const url = req.url();
    if (url.includes('/api/') || url.includes(':5001/') || url.includes('/connect')) {
      console.log(`[Request Log] ${req.method()} ${url}`);
    }
  });

  // Mock local agent status check to fail immediately so we fallback to backend QR generation
  await page.route(/.*:5001\/status/, async (route) => {
    await route.abort('failed');
  });

  // Mock GET and POST /api/accounts
  await page.route(/\/api\/accounts$/, async (route) => {
    const method = route.request().method();
    if (method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'success',
          accounts: isCreated ? [
            {
              id: '12345',
              name: 'Test Playwright Account',
              whatsapp_number: '',
              status: isConnected ? 'Connected' : 'Disconnected',
              successful_sends: 42,
              failed_sends: 3,
              retry_count: 1,
              browser_crashes: 0,
              session_resets: 2
            }
          ] : []
        })
      });
    } else if (method === 'POST') {
      isCreated = true;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'success',
          account: {
            id: '12345',
            name: 'Test Playwright Account',
            whatsapp_number: '',
            status: 'Disconnected'
          }
        })
      });
    } else {
      await route.continue();
    }
  });

  // Mock GET /api/accounts/12345/diagnostics
  await page.route(/\/api\/accounts\/12345\/diagnostics/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        status: 'success',
        diagnostics: {
          successful_sends: 42,
          failed_sends: 3,
          retry_count: 1,
          browser_crashes: 0,
          session_resets: 2
        }
      })
    });
  });

  // Mock GET /api/status (polling)
  await page.route(/\/api\/status/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        status: 'success',
        agent_status: isConnected ? 'Online' : 'Offline',
        connected_accounts: isConnected ? 1 : 0,
        total_accounts: 1,
        running_campaigns: 0,
        is_running: false,
        is_paused: false,
        campaign_id: null,
        sent_count: 0,
        failed_count: 0,
        system_logs: [],
        campaign_logs: [],
        is_connected: isConnected,
        account_id: isConnected ? '12345' : null
      })
    });
  });

  // Mock POST **/connect
  await page.route(/\/api\/accounts\/12345\/connect|.*\/connect/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'success' })
    });
  });

  // Mock GET **/status inside QR display
  await page.route(/\/api\/accounts\/12345\/status/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        account_status: isConnected ? 'Connected' : 'Disconnected',
        is_connected: isConnected
      })
    });
  });

  // Mock GET **/qr to return a dummy image/png to avoid pending requests
  await page.route(/\/api\/accounts\/12345\/qr/, async (route) => {
    // Return a 1x1 transparent PNG
    const dummyPng = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
      'base64'
    );
    await route.fulfill({
      status: 200,
      contentType: 'image/png',
      body: dummyPng
    });
  });

  // 2. Navigate and Login
  page.on('console', msg => console.log(`[Browser Console] ${msg.type()}: ${msg.text()}`));
  page.on('pageerror', err => console.error(`[Browser PageError] ${err.stack || err.message}`));

  await page.goto('http://127.0.0.1:5173/');
  await page.waitForLoadState('networkidle');

  const emailInput = page.locator('input[type="email"]');
  await emailInput.waitFor({ state: 'visible', timeout: 15000 });
  await emailInput.fill('tester@test.com');
  await page.fill('input[type="password"]', 'Test@123456');
  await page.click('button:has-text("Sign In")');
  await page.waitForTimeout(2000);

  // Check if login failed (need to sign up)
  const invalidLogin = page.locator('text=Invalid email or password');
  if (await invalidLogin.isVisible()) {
    console.log('Login failed - signing up');
    await page.click('text=Create one');
    await page.waitForTimeout(1000);
    await page.fill('input[placeholder="Full Name"]', 'Tester');
    await page.locator('input[type="email"]').fill('tester@test.com');
    await page.locator('input[type="password"]').fill('Test@123456');
    await page.click('button:has-text("Create Account")');
    await page.waitForTimeout(2000);
  }

  // Wait for main dashboard
  await page.waitForSelector('text=Dashboard', { timeout: 15000 });
  console.log('✅ Logged in successfully');

  // 3. Navigate to the Accounts Page
  console.log('Navigating to Accounts page...');
  const accountsNav = page.locator('li', { hasText: 'Accounts' });
  await accountsNav.first().click();
  await page.waitForSelector('text=Manage Accounts', { timeout: 15000 });
  console.log('✅ Arrived at Accounts page');

  // 4. Test Account Modal Creation
  console.log('Opening Add Account modal...');
  await page.click('button:has-text("Add New Account")');
  
  const modalHeader = page.locator('h2:has-text("Add New Account")');
  await expect(modalHeader).toBeVisible();
  
  console.log('Filling account name and submitting...');
  await page.fill('input#accountName', 'Test Playwright Account');
  await page.click('button[type="submit"]:has-text("Add Account")');

  // Verify modal is closed and new account card is displayed
  await expect(modalHeader).not.toBeVisible();
  const accountCardTitle = page.locator('h3:has-text("Test Playwright Account")');
  await expect(accountCardTitle).toBeVisible();
  console.log('✅ Account modal creation completed and account card displayed');

  // 5. Verify Account Diagnostics Telemetry Display
  console.log('Verifying telemetry diagnostics...');
  
  // We mocked:
  // - successful_sends: 42
  // - failed_sends: 3
  // - browser_crashes: 0
  // - session_resets: 2
  
  // Find diagnostics section in the card
  const card = page.locator('div.rounded-xl', { has: accountCardTitle });
  
  // Check successful sends (Sent)
  const sentMetric = card.locator('div.rounded-lg', { hasText: 'Sent' }).locator('div.text-sm');
  await expect(sentMetric).toHaveText('42', { timeout: 15000 });
  
  // Check failed sends (Failed)
  const failedMetric = card.locator('div.rounded-lg', { hasText: 'Failed' }).locator('div.text-sm');
  await expect(failedMetric).toHaveText('3');
  
  // Check resets (Resets)
  const resetsMetric = card.locator('div.rounded-lg', { hasText: 'Resets' }).locator('div.text-sm');
  await expect(resetsMetric).toHaveText('2');
  
  // Check crashes (Crashes)
  const crashesMetric = card.locator('div.rounded-lg', { hasText: 'Crashes' }).locator('div.text-sm');
  await expect(crashesMetric).toHaveText('0');
  
  console.log('✅ Telemetry diagnostics verified successfully');

  // 6. Check the account connection status polling
  // Verify status is initially Disconnected
  const statusBadge = card.locator('span', { hasText: /Connected|Disconnected/ });
  await expect(statusBadge).toHaveText('Disconnected');
  console.log('✅ Initial state is Disconnected');

  // Click Connect via QR
  console.log('Clicking Connect via QR...');
  await page.click('button:has-text("Connect via QR")');
  
  // Verify QR display modal is shown
  const qrModalTitle = page.locator('h3:has-text("Scan with WhatsApp")');
  await expect(qrModalTitle).toBeVisible();
  console.log('✅ QR Display Modal opened');

  // Toggle status to connected to simulate the polling detecting connection
  console.log('Simulating QR scan and successful connection...');
  isConnected = true;

  // The QR Display Modal should auto-close upon successful connection check
  await expect(qrModalTitle).not.toBeVisible({ timeout: 15000 });
  console.log('✅ QR Display Modal closed upon connection success');

  // Verify the badge updates to Connected on the account card
  await expect(statusBadge).toHaveText('Connected', { timeout: 10000 });
  console.log('✅ Connection status polling verified and badge updated to Connected');

  console.log('🎉 Accounts page test spec completely passed!');
});
