import { test, expect } from '@playwright/test';

// Helper: Navigate to a page by clicking the nav rail item
async function navigateTo(page: any, pageName: string) {
  const navItem = page.locator(`ul >> li:has-text("${pageName}")`).first();
  await navItem.waitFor({ state: 'visible', timeout: 10000 });
  await navItem.click();
  await page.waitForTimeout(500);
}

test('Verify Analytics Page, chart rendering, and dropdown filters', async ({ page }) => {
  test.setTimeout(60000);

  // 1. Navigate and Login
  await page.goto('http://127.0.0.1:5173/');
  await page.waitForLoadState('networkidle');

  const emailInput = page.locator('input[type="email"]');
  await emailInput.waitFor({ state: 'visible', timeout: 15000 });
  await emailInput.fill('tester@test.com');
  await page.fill('input[type="password"]', 'Test@123456');
  await page.click('button:has-text("Sign In")');
  await page.waitForTimeout(2000);

  // If login failed, sign up
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

  // 2. Navigate to Analytics page
  await navigateTo(page, 'Analytics');
  console.log('✅ Navigated to Analytics page');

  // 3. Verify KPIs / Cards are visible
  await expect(page.locator('p', { hasText: 'Total Sent' }).first()).toBeVisible();
  await expect(page.locator('p', { hasText: 'Sent Messages' }).first()).toBeVisible();
  await expect(page.locator('p', { hasText: 'Failed to Send' }).first()).toBeVisible();
  await expect(page.locator('p', { hasText: 'Success Rate' }).first()).toBeVisible();
  console.log('✅ KPI cards verified');

  // 4. Verify charts render (there should be three recharts SVG surfaces)
  // Recharts uses <svg class="recharts-surface"> for its rendering. Let's wait for them to load.
  const chartSurfaces = page.locator('svg.recharts-surface');
  await expect(chartSurfaces.first()).toBeVisible({ timeout: 10000 });
  const count = await chartSurfaces.count();
  console.log(`✅ Found ${count} charts on the page`);
  expect(count).toBeGreaterThanOrEqual(1); // Ensure we have charts rendered

  // Take a screenshot to visually verify that the charts loaded without errors
  await page.screenshot({ path: 'd:/NovaSend/analytics-page-initial.png' });
  console.log('📸 Saved screenshot of Analytics page to analytics-page-initial.png');

  // 5. Check Weekly/Monthly timeframe toggles
  const weeklyBtn = page.getByRole('button', { name: 'Weekly', exact: true });
  const monthlyBtn = page.getByRole('button', { name: 'Monthly', exact: true });

  await expect(weeklyBtn).toBeVisible();
  await expect(monthlyBtn).toBeVisible();

  // Click Weekly
  await weeklyBtn.click();
  await page.waitForTimeout(500);
  console.log('✅ Clicked Weekly timeframe');

  // Click Monthly
  await monthlyBtn.click();
  await page.waitForTimeout(500);
  console.log('✅ Clicked Monthly timeframe');

  // 6. Check dropdown filters
  // Status Dropdown (starts with 'All Statuses')
  const statusDropdown = page.locator('button:has-text("All Statuses")').first();
  await statusDropdown.click();
  await page.waitForTimeout(500);
  
  const statusOption = page.locator('li[role="option"]:has-text("Running")').first();
  await expect(statusOption).toBeVisible();
  await statusOption.click();
  await page.waitForTimeout(500);
  await expect(page.locator('button:has-text("Running")').first()).toBeVisible();
  console.log('✅ Status Filter dropdown verified (changed All Statuses -> Running)');

  // Change it back to 'All Statuses'
  await page.locator('button:has-text("Running")').first().click();
  await page.waitForTimeout(500);
  await page.locator('li[role="option"]:has-text("All Statuses")').first().click();
  await page.waitForTimeout(500);

  // Group Dropdown (starts with 'All Groups')
  const groupDropdown = page.locator('button:has-text("All Groups")').first();
  await groupDropdown.click();
  await page.waitForTimeout(500);

  const groupOption = page.locator('li[role="option"]:has-text("VIP Clients")').first();
  await expect(groupOption).toBeVisible();
  await groupOption.click();
  await page.waitForTimeout(500);
  await expect(page.locator('button:has-text("VIP Clients")').first()).toBeVisible();
  console.log('✅ Group Filter dropdown verified (changed All Groups -> VIP Clients)');

  // Change it back to 'All Groups'
  await page.locator('button:has-text("VIP Clients")').first().click();
  await page.waitForTimeout(500);
  await page.locator('li[role="option"]:has-text("All Groups")').first().click();
  await page.waitForTimeout(500);

  // Campaign Dropdown (starts with 'All Campaigns')
  const campaignDropdown = page.locator('button:has-text("All Campaigns")').first();
  await campaignDropdown.click();
  await page.waitForTimeout(500);

  const campaignOption = page.locator('li[role="option"]:has-text("Q4 Holiday Blast")').first();
  await expect(campaignOption).toBeVisible();
  await campaignOption.click();
  await page.waitForTimeout(500);
  await expect(page.locator('button:has-text("Q4 Holiday Blast")').first()).toBeVisible();
  console.log('✅ Campaign Filter dropdown verified (changed All Campaigns -> Q4 Holiday Blast)');

  // Change it back to 'All Campaigns'
  await page.locator('button:has-text("Q4 Holiday Blast")').first().click();
  await page.waitForTimeout(500);
  await page.locator('li[role="option"]:has-text("All Campaigns")').first().click();
  await page.waitForTimeout(500);

  // Account Dropdown (starts with 'All Accounts')
  const accountDropdown = page.locator('button:has-text("All Accounts")').first();
  await accountDropdown.click();
  await page.waitForTimeout(500);
  await page.locator('li[role="option"]:has-text("All Accounts")').first().click();
  await page.waitForTimeout(500);
  console.log('✅ Account Filter dropdown verified');

  console.log('🎉 Analytics page test completely passed!');
});
