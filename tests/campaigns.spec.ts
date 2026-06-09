import { test, expect } from '@playwright/test';

// Helper: Navigate to a page by clicking the nav rail item
async function navigateTo(page: any, pageName: string) {
  const navItem = page.locator(`ul >> li:has-text("${pageName}")`).first();
  await navItem.waitFor({ state: 'visible', timeout: 10000 });
  await navItem.click();
  await page.waitForTimeout(500);
}

test('Verify Campaign creation, template selection, pacing settings, and backend persistence', async ({ page }) => {
  test.setTimeout(120000); // 2 minutes

  const campaignName = `Campaign E2E ${Date.now()}`;

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

  // 2. Ensure an account is created and selected
  await navigateTo(page, 'Accounts');
  await page.waitForTimeout(1000);

  // Check if we have any account card/list
  // If "No Account" or similar is visible, or if we need to add an account
  const addAccountBtnVisible = await page.locator('button:has-text("Add New Account")').isVisible();
  if (addAccountBtnVisible) {
    console.log('Creating a test account...');
    await page.click('button:has-text("Add New Account")');
    await page.waitForTimeout(500);
    await page.locator('input#accountName').fill('TestAccount');
    await page.locator('form button:has-text("Add Account")').click({ force: true });
    await page.waitForTimeout(1500);
    console.log('✅ Created TestAccount');
  } else {
    console.log('ℹ️ Account already exists');
  }

  // 3. Navigate to Campaigns and create new campaign
  await navigateTo(page, 'Campaigns');
  await page.waitForSelector('text=Campaign Management', { timeout: 15000 });

  await page.click('button:has-text("Create New Campaign")');
  await page.waitForTimeout(1000);

  // 4. Test Template Selection (do this FIRST, before setting name, since template loads its own name)
  console.log('Testing template selection...');
  // Click the template dropdown (top right of the editor modal)
  const templateDropdown = page.locator('div.w-64 >> button').first();
  await templateDropdown.click();
  await page.waitForTimeout(300);

  // Select "Welcome Message"
  await page.locator('li[role="option"]:has-text("Welcome Message")').click();
  await page.waitForTimeout(500);

  // Verify template text filled the message textarea
  const messageVal = await page.locator('textarea#message').inputValue();
  console.log('Loaded message template:', messageVal);
  expect(messageVal).toContain('Welcome to {{business_name}}');
  console.log('✅ Template selection verified');

  // NOW fill campaign name (after template loaded its default name)
  await page.locator('input#campaignName').fill(campaignName);

  // 5. Select Target Group (General)
  console.log('Selecting target group...');
  const groupLabel = page.locator('label:has-text("General")');
  await groupLabel.click({ force: true });
  await page.waitForTimeout(300);

  // 6. Test Delivery Pacing Settings
  console.log('Configuring delivery pacing...');
  // Expand pacing section
  await page.locator('button:has-text("Delivery Pacing")').click();
  await page.waitForTimeout(300);

  const staggerInput = page.locator('label:has-text("Stagger delivery over") + input');
  await staggerInput.fill('2');

  const limitInput = page.locator('label:has-text("Limit to") + input');
  await limitInput.fill('150');

  // Check Warm-up mode
  await page.locator('#warmUpMode').click({ force: true });
  await page.waitForTimeout(300);

  // Save the campaign
  await page.locator('button:has-text("Save Campaign")').click({ force: true });
  await page.waitForTimeout(2000);
  console.log(`✅ Campaign "${campaignName}" created and saved`);

  // 7. Verify backend persistence by reloading
  console.log('Reloading page to verify backend persistence...');
  await page.reload();
  await page.waitForLoadState('networkidle');
  await page.waitForSelector('text=Dashboard', { timeout: 15000 });

  await navigateTo(page, 'Campaigns');
  await page.waitForSelector('text=Campaign Management', { timeout: 15000 });

  // Locate the campaign row and click edit
  const campaignRow = page.locator('tr', { hasText: campaignName }).first();
  await expect(campaignRow).toBeVisible();
  
  await campaignRow.locator('button[title="Edit"]').click({ force: true });
  await page.waitForTimeout(1000);

  // Verify all fields are loaded correctly
  const loadedName = await page.locator('input#campaignName').inputValue();
  expect(loadedName).toBe(campaignName);

  const loadedMessage = await page.locator('textarea#message').inputValue();
  expect(loadedMessage).toContain('Welcome to {{business_name}}');

  // Expand pacing section to verify values
  await page.locator('button:has-text("Delivery Pacing")').click();
  await page.waitForTimeout(300);

  const loadedStagger = await staggerInput.inputValue();
  expect(loadedStagger).toBe('2');

  const loadedLimit = await limitInput.inputValue();
  expect(loadedLimit).toBe('150');

  const isWarmUpChecked = await page.locator('#warmUpMode').isChecked();
  expect(isWarmUpChecked).toBe(true);

  // Verify General group checkbox is checked
  const isGroupChecked = await page.locator('label:has-text("General") input[type="checkbox"]').isChecked();
  expect(isGroupChecked).toBe(true);

  console.log('✅ Saved configuration verified successfully in Campaign Editor!');

  // Close editor
  await page.locator('button:has-text("Cancel")').click({ force: true });
  await page.waitForTimeout(500);
  
  console.log('🎉 Campaigns Page Test completely PASSED!');
});
