import { test, expect } from '@playwright/test';

test('Verify Dashboard, dark/light mode, and account selector', async ({ page }) => {
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
  console.log('✅ Dashboard visible');

  // Verify dashboard stats elements are visible
  await expect(page.locator('text=Total Messages Sent')).toBeVisible();
  await expect(page.locator('text=Overall Success Rate')).toBeVisible();
  await expect(page.locator('text=Campaigns Launched')).toBeVisible();
  await expect(page.locator('p:has-text("Contacts")').first()).toBeVisible();
  console.log('✅ Stats cards verified');

  // Verify recent campaigns table is visible
  await expect(page.locator('text=Recent Campaigns')).toBeVisible();
  console.log('✅ Recent Campaigns table verified');

  // Verify quick actions are visible
  await expect(page.locator('button:has-text("Create New Campaign")')).toBeVisible();
  await expect(page.locator('button:has-text("Add New Contacts")')).toBeVisible();
  await expect(page.locator('button:has-text("Add New Account")')).toBeVisible();
  console.log('✅ Quick Actions verified');

  // Verify dark mode default state
  const htmlElement = page.locator('html');
  await expect(htmlElement).toHaveClass(/dark/);
  console.log('✅ Default theme is dark mode');
  
  // Take screenshot in dark mode
  await page.screenshot({ path: 'd:/NovaSend/dashboard-darkmode.png' });
  console.log('📸 Dark mode screenshot saved as dashboard-darkmode.png');

  // Click theme toggle button to switch to light mode
  // The theme toggle is the sun/moon button in the header (inside Header, rightmost)
  // Let's select button that contains MoonIcon or SunIcon
  const themeToggleBtn = page.locator('header button').last();
  await themeToggleBtn.click();
  await page.waitForTimeout(500);

  // Verify light mode
  await expect(htmlElement).not.toHaveClass(/dark/);
  console.log('✅ Switched to light mode successfully');

  // Take screenshot in light mode
  await page.screenshot({ path: 'd:/NovaSend/dashboard-lightmode.png' });
  console.log('📸 Light mode screenshot saved as dashboard-lightmode.png');

  // Switch back to dark mode
  await themeToggleBtn.click();
  await page.waitForTimeout(500);
  await expect(htmlElement).toHaveClass(/dark/);
  console.log('✅ Switched back to dark mode successfully');

  // Verify account selector dropdown
  // The account selector is a button in the header that has the account name (or No Account)
  // Let's click it to open the dropdown list
  const accountSelectorBtn = page.locator('header button').nth(1);
  await accountSelectorBtn.click();
  await page.waitForTimeout(500);

  // Check if dropdown contains "Add New Account"
  await expect(page.locator('text=Add New Account')).toBeVisible();
  console.log('✅ Account selector dropdown working and shows Add New Account option');

  // Close dropdown by clicking header area
  await page.click('header');
  await page.waitForTimeout(500);
  
  console.log('🎉 Dashboard page test completely passed!');
});
