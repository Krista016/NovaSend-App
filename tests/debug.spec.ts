import { test, expect } from '@playwright/test';

test('Debug: Navigate and check contacts', async ({ page }) => {
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

  // Check if login failed
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
  console.log('✅ Step 1: Logged in, Dashboard visible');

  // Take screenshot before clicking Contacts
  await page.screenshot({ path: 'd:/NovaSend/debug-step1-dashboard.png' });
  console.log('📸 Screenshot: debug-step1-dashboard.png');

  // 2. Click on Contacts navigation
  console.log('Clicking Contacts nav...');
  const contactsNav = page.locator('li', { hasText: 'Contacts' });
  const count = await contactsNav.count();
  console.log(`Found ${count} "li" elements with text "Contacts"`);
  
  if (count > 0) {
    // Get bounding box to verify it's visible
    const box = await contactsNav.first().boundingBox();
    console.log(`Contacts nav bounding box: ${JSON.stringify(box)}`);
    await contactsNav.first().click();
  } else {
    // Fallback: try other selectors
    console.log('Trying alternative selectors...');
    const allLi = page.locator('li');
    const liCount = await allLi.count();
    console.log(`Total li elements: ${liCount}`);
    for (let i = 0; i < liCount; i++) {
      const text = await allLi.nth(i).textContent();
      console.log(`  li[${i}]: "${text}"`);
    }
  }
  
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'd:/NovaSend/debug-step2-contacts.png' });
  console.log('📸 Screenshot: debug-step2-contacts.png');

  // Check what's on the page
  const addContactBtn = page.locator('button:has-text("Add Contact")');
  const addContactVisible = await addContactBtn.isVisible();
  console.log(`"Add Contact" button visible: ${addContactVisible}`);

  const manageGroupsBtn = page.locator('button:has-text("Manage Groups")');
  const manageGroupsVisible = await manageGroupsBtn.isVisible();
  console.log(`"Manage Groups" button visible: ${manageGroupsVisible}`);

  console.log('✅ Debug test complete');
});
