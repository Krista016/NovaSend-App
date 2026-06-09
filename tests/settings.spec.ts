import { test, expect } from '@playwright/test';
import { execSync } from 'child_process';

function getDbSettings(email: string) {
  try {
    // Run a python command to query the database and output the settings_json
    const pythonCmd = `python -c "import sqlite3, json; conn=sqlite3.connect('novasend.db'); cursor=conn.cursor(); cursor.execute('SELECT settings_json FROM users WHERE email=\\'${email}\\''); row=cursor.fetchone(); conn.close(); print(row[0] if row else '')"`;
    const result = execSync(pythonCmd).toString().trim();
    return result ? JSON.parse(result) : null;
  } catch (error) {
    console.error("Error reading database settings:", error);
    return null;
  }
}

test('Verify settings page theme, palette, placeholders and database persistence', async ({ page }) => {
  // 1. Navigate and Login
  page.on('console', msg => console.log('BROWSER LOG:', msg.text()));
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

  // Navigate to Settings
  await page.click('li:has-text("Settings")');
  await page.waitForTimeout(1000);
  
  // Verify we are on Settings page
  await expect(page.locator('text=Chroma-Flow Theme')).toBeVisible();
  await expect(page.locator('text=Global Placeholders')).toBeVisible();
  console.log('✅ Settings page loaded');

  // Test Theme Changing (using the header theme toggle)
  const htmlElement = page.locator('html');
  const initialTheme = (await htmlElement.getAttribute('class'))?.includes('dark') ? 'dark' : 'light';
  console.log(`Initial theme: ${initialTheme}`);

  const themeToggleBtn = page.locator('header button').last();
  await themeToggleBtn.click();
  await page.waitForTimeout(1000);

  const toggledTheme = (await htmlElement.getAttribute('class'))?.includes('dark') ? 'dark' : 'light';
  console.log(`Toggled theme: ${toggledTheme}`);
  expect(toggledTheme).not.toBe(initialTheme);

  // Verify theme persisted in DB
  let dbSettings = getDbSettings('tester@test.com');
  console.log('DB settings after theme change:', dbSettings);
  expect(dbSettings).not.toBeNull();
  expect(dbSettings.theme).toBe(toggledTheme);
  console.log('✅ Theme persistence verified in database');

  // Test Gradient Palette Changing
  // Click on "Sunset" palette
  await page.click('text=Sunset');
  await page.waitForTimeout(1000);

  // Verify palette persisted in DB
  dbSettings = getDbSettings('tester@test.com');
  console.log('DB settings after palette change:', dbSettings);
  expect(dbSettings).not.toBeNull();
  expect(dbSettings.palette).toBe('sunset');
  console.log('✅ Gradient palette persistence verified in database');

  // Test Global Placeholders Editing
  const keyInput = page.locator('input[placeholder="your_key"]');
  const valueInput = page.locator('input[placeholder="Your Value"]');
  const addButton = page.locator('button:has-text("Add")');

  // Add a new placeholder
  const testKey = `test_key_${Date.now()}`;
  const testValue = `test_value_${Date.now()}`;
  await keyInput.fill(testKey);
  await valueInput.fill(testValue);
  await addButton.click();
  await page.waitForTimeout(1000);

  // Verify it appears in the list in UI
  await expect(page.locator(`text={{${testKey}}}`)).toBeVisible();
  console.log('✅ New placeholder visible in UI');

  // Verify placeholder persisted in DB
  dbSettings = getDbSettings('tester@test.com');
  console.log('DB settings after adding placeholder:', dbSettings);
  expect(dbSettings).not.toBeNull();
  const placeholders = dbSettings.global_placeholders || [];
  const found = placeholders.find((p: any) => p.key === testKey && p.value === testValue);
  expect(found).toBeDefined();
  console.log('✅ Placeholder persistence verified in database');

  // Test removing the placeholder - use a specific locator targeting the placeholder row
  const placeholderRow = page.locator('div.flex.items-center.space-x-2.p-2.rounded-lg', { hasText: `{{${testKey}}}` });
  const deleteBtn = placeholderRow.locator('button');
  await deleteBtn.click();
  await page.waitForTimeout(1000);

  // Verify placeholder is removed in DB
  dbSettings = getDbSettings('tester@test.com');
  const updatedPlaceholders = dbSettings?.global_placeholders || [];
  const foundAfterDelete = updatedPlaceholders.find((p: any) => p.key === testKey);
  expect(foundAfterDelete).toBeUndefined();
  console.log('✅ Placeholder deletion and persistence verified in database');
});
