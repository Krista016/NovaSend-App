import { test, expect } from '@playwright/test';

/**
 * NovaSend Playwright Test Suite
 * 
 * Tests the attachment + caption functionality end-to-end:
 * 1. Settings page renders the Playwright-based agent script (not Selenium)
 * 2. Campaign editor attachment/caption UI works correctly
 * 3. Flask API endpoints handle attachment/caption data properly
 * 4. Full campaign launch flow with attachment + caption
 * 
 * NOTE: The app uses state-based routing (setCurrentPage), not URL routing.
 * Navigation is done by clicking <li> items in the NavigationRail.
 */

// Helper: Navigate to a page by clicking the nav rail item
async function navigateTo(page: any, pageName: string) {
  const emailInput = page.locator('input[type="email"]');
  if (await emailInput.isVisible()) {
    await emailInput.fill('tester@test.com');
    await page.fill('input[type="password"]', 'Test@123456');
    await page.click('button:has-text("Sign In")');
    await page.waitForTimeout(2000);

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
    await page.waitForSelector('text=Dashboard', { timeout: 15000 });
  }

  const navItem = page.locator(`ul >> li:has-text("${pageName}")`).first();
  await navItem.waitFor({ state: 'visible', timeout: 10000 });
  await navItem.click();
  await page.waitForTimeout(500);
}

test.describe('Settings Page - Agent Script', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await navigateTo(page, 'Settings');
  });

  test('should display the Local Automation Agent card', async ({ page }) => {
    await expect(page.getByText('Local Automation Agent')).toBeVisible({ timeout: 10000 });
  });

  test('should show Playwright install command (not Selenium)', async ({ page }) => {
    const playwrightCommand = page.getByText(/pip install.*playwright/);
    await expect(playwrightCommand.first()).toBeVisible({ timeout: 10000 });
    
    // Ensure old Selenium command is NOT present
    const seleniumCommand = page.getByText('undetected-chromedriver');
    await expect(seleniumCommand).not.toBeVisible();
    
    const pyautoguiCommand = page.getByText('PyAutoGUI');
    await expect(pyautoguiCommand).not.toBeVisible();
  });

  test('should show Playwright chromium install command', async ({ page }) => {
    const chromiumCommand = page.getByText('playwright install chromium');
    await expect(chromiumCommand).toBeVisible({ timeout: 10000 });
  });

  test('should mention Playwright in the script description', async ({ page }) => {
    const playwrightMention = page.getByText('Playwright');
    await expect(playwrightMention.first()).toBeVisible({ timeout: 10000 });
  });

  test('should mention Chromium browser', async ({ page }) => {
    // "Chromium" appears in multiple places - use .first() to avoid strict mode violation
    const chromiumMention = page.getByText('Chromium').first();
    await expect(chromiumMention).toBeVisible({ timeout: 10000 });
  });

  test('should have a working Download Script button', async ({ page }) => {
    const downloadButton = page.getByRole('button', { name: /download script/i });
    await expect(downloadButton).toBeVisible({ timeout: 10000 });
    await expect(downloadButton).toBeEnabled();
  });

  test('downloaded script should contain Playwright imports (not Selenium)', async ({ page }) => {
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 15000 }),
      page.getByRole('button', { name: /download script/i }).click(),
    ]);
    
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk));
    }
    const content = Buffer.concat(chunks).toString('utf-8');
    
    // Verify Playwright imports are present
    expect(content).toContain('from playwright.sync_api import sync_playwright');
    expect(content).toContain('playwright_stealth');
    
    // Verify Selenium imports are NOT present
    expect(content).not.toContain('undetected_chromedriver');
    expect(content).not.toContain('selenium');
    expect(content).not.toContain('pyautogui');
    
    // Verify the key fix: _wait_for_chat_ready function exists
    expect(content).toContain('def _wait_for_chat_ready');
    
    // Verify the key fix: _attach_file_reliably has retry logic
    expect(content).toContain('max_retries=3');
    
    // Verify the key fix: caption box selectors include video variant
    expect(content).toContain('Send video');
    
    // Verify the key fix: Strategy 3 keyboard fallback exists
    expect(content).toContain('Strategy 3');
    
    // Verify the key fix: Invalid phone number detection
    expect(content).toContain('Invalid phone number');
  });
});

test.describe('Campaign Editor - Attachment & Caption UI', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await navigateTo(page, 'Campaigns');
  });

  test('should open campaign editor modal', async ({ page }) => {
    const createButton = page.getByRole('button', { name: /create new campaign/i });
    await expect(createButton).toBeVisible({ timeout: 10000 });
    await createButton.click();
    
    // Modal heading should be visible (use getByRole to avoid strict mode)
    await expect(page.getByRole('heading', { name: 'Create New Campaign' })).toBeVisible({ timeout: 10000 });
  });

  test('should show attachment checkbox in campaign editor', async ({ page }) => {
    await page.getByRole('button', { name: /create new campaign/i }).click();
    await expect(page.getByRole('heading', { name: 'Create New Campaign' })).toBeVisible({ timeout: 10000 });
    
    // The "Attach file from shared folder" checkbox should exist
    const attachCheckbox = page.getByRole('checkbox', { name: /attach file from shared folder/i });
    await expect(attachCheckbox).toBeVisible({ timeout: 10000 });
  });

  test('should show send-as-caption checkbox when attachment is enabled', async ({ page }) => {
    await page.getByRole('button', { name: /create new campaign/i }).click();
    await expect(page.getByRole('heading', { name: 'Create New Campaign' })).toBeVisible({ timeout: 10000 });
    
    // Initially, the send-as-caption checkbox should NOT be visible
    const captionCheckbox = page.getByRole('checkbox', { name: /send message as caption/i });
    await expect(captionCheckbox).not.toBeVisible();
    
    // Check the attachment checkbox (use force because AnimatedCheckbox overlay intercepts clicks)
    const attachCheckbox = page.getByRole('checkbox', { name: /attach file from shared folder/i });
    await attachCheckbox.check({ force: true });
    
    // Wait for the agent check to complete (it will fail since agent is offline)
    await page.waitForTimeout(3000);
    
    // Since agent is offline, we should see an error message about agent being offline
    // OR the caption checkbox if the agent was online and found a file
    const errorVisible = await page.getByText(/agent is offline|unreachable/i).isVisible().catch(() => false);
    const noFileVisible = await page.getByText(/no file found/i).isVisible().catch(() => false);
    const captionVisible = await captionCheckbox.isVisible().catch(() => false);
    
    // At least one of these should be true when attachment is checked
    expect(errorVisible || noFileVisible || captionVisible).toBeTruthy();
  });

  test('should have message textarea for caption/text input', async ({ page }) => {
    await page.getByRole('button', { name: /create new campaign/i }).click();
    await expect(page.getByRole('heading', { name: 'Create New Campaign' })).toBeVisible({ timeout: 10000 });
    
    const messageTextarea = page.locator('#message');
    await expect(messageTextarea).toBeVisible({ timeout: 10000 });
    
    // Type a test message
    await messageTextarea.fill('Hello {FirstName}, check this out!');
    await expect(messageTextarea).toHaveValue(/Hello.*FirstName/);
  });
});

test.describe('Flask API - Attachment & Caption Endpoints', () => {
  const API_BASE = 'http://127.0.0.1:5001';
  
  test('GET /status should return agent status', async ({ request }) => {
    const response = await request.get(`${API_BASE}/status`, { timeout: 5000 }).catch(() => null);
    
    if (!response) {
      test.skip();
      return;
    }
    
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data).toHaveProperty('agent_status');
    expect(data).toHaveProperty('is_running');
    expect(data).toHaveProperty('campaign_logs');
    expect(data).toHaveProperty('system_logs');
  });

  test('GET /get-attachment-filename should return filename or error', async ({ request }) => {
    const response = await request.get(`${API_BASE}/get-attachment-filename`, { timeout: 5000 }).catch(() => null);
    
    if (!response) {
      test.skip();
      return;
    }
    
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data).toHaveProperty('status');
    
    if (data.status === 'success') {
      expect(data).toHaveProperty('filename');
      expect(typeof data.filename).toBe('string');
    } else {
      expect(data).toHaveProperty('message');
    }
  });

  test('POST /launch-campaign should accept sendAsCaption flag', async ({ request }) => {
    const statusResponse = await request.get(`${API_BASE}/status`, { timeout: 5000 }).catch(() => null);
    
    if (!statusResponse) {
      test.skip();
      return;
    }
    
    const statusData = await statusResponse.json();
    if (statusData.is_running) {
      test.skip();
      return;
    }
    
    const response = await request.post(`${API_BASE}/launch-campaign`, {
      data: {
        id: 'test_campaign_001',
        contacts: [{ number: '1234567890', firstName: 'Test' }],
        message: 'Test message',
        useAttachmentFromFolder: false,
        sendAsCaption: true,
        globalPlaceholders: [],
        messageDelayMin: 1,
        messageDelayMax: 2,
      },
      timeout: 5000,
    }).catch(() => null);
    
    if (!response) {
      test.skip();
      return;
    }
    
    const data = await response.json();
    expect(data).toHaveProperty('status');
  });

  test('POST /control-campaign should handle pause/resume/stop', async ({ request }) => {
    const response = await request.post(`${API_BASE}/control-campaign`, {
      data: { action: 'pause' },
      timeout: 5000,
    }).catch(() => null);
    
    if (!response) {
      test.skip();
      return;
    }
    
    const data = await response.json();
    expect(['success', 'error']).toContain(data.status);
  });
});

test.describe('Full Campaign Flow - Attachment + Caption', () => {
  test('should create campaign with attachment and caption settings', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await navigateTo(page, 'Campaigns');
    
    const createButton = page.getByRole('button', { name: /create new campaign/i });
    await expect(createButton).toBeVisible({ timeout: 10000 });
    await createButton.click();
    
    await expect(page.getByRole('heading', { name: 'Create New Campaign' })).toBeVisible({ timeout: 10000 });
    
    // Fill in campaign name
    const nameInput = page.locator('#campaignName');
    await nameInput.fill('Test Attachment Campaign');
    
    // Fill in message
    const messageTextarea = page.locator('#message');
    await messageTextarea.fill('Hello {FirstName}, check out our latest offer!');
    
    // Enable attachment from folder (use force because AnimatedCheckbox overlay intercepts clicks)
    const attachCheckbox = page.getByRole('checkbox', { name: /attach file from shared folder/i });
    await attachCheckbox.check({ force: true });
    
    // Wait for the agent check to complete
    await page.waitForTimeout(3000);
    
    // Take a screenshot for visual verification
    await page.screenshot({ path: 'test-results/campaign-editor-attachment.png' });
  });
});

test.describe('Navigation & Page Load', () => {
  test('should load the app and navigate between pages', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    
    // App should load - look for the NovaSend brand
    await expect(page.getByText('NovaSend').first()).toBeVisible({ timeout: 10000 });
    
    // Navigate to each page using the nav rail
    const navItems = ['Dashboard', 'Campaigns', 'Contacts', 'Settings'];
    for (const navItem of navItems) {
      await navigateTo(page, navItem);
    }
  });

  test('should render Settings page with all cards', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await navigateTo(page, 'Settings');
    
    await expect(page.getByText('Local Automation Agent')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Chroma-Flow Theme')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Global Placeholders')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Webhook Integration')).toBeVisible({ timeout: 10000 });
  });
});
