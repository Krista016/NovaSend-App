import { test, expect } from '@playwright/test';

test('Verify Utilities page tools and validators', async ({ page }) => {
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

  // 2. Navigate to Utilities Page
  const utilitiesNav = page.locator('li:has-text("Utilities")');
  await utilitiesNav.click();
  await page.waitForTimeout(1000);

  // Verify we are on Utilities page
  await expect(page.locator('text=Phone Number Format Converter')).toBeVisible();
  console.log('✅ Navigated to Utilities page successfully');

  // 3. Test Phone Number Format Converter
  const converterCard = page.locator('div.rounded-xl', { has: page.locator('h3', { hasText: 'Phone Number Format Converter' }) }).first();
  const converterInput = converterCard.locator('textarea').first();
  const converterOutput = converterCard.locator('textarea').last();
  
  // Set conversion setting to append country code
  const appendCountrySelect = converterCard.locator('select').last();
  await appendCountrySelect.selectOption('yes');

  await converterInput.fill(' (123) 456-7890 ');
  await converterCard.locator('button:has-text("Convert Numbers")').click();
  await page.waitForTimeout(500);

  const convertedText = await converterOutput.inputValue();
  expect(convertedText.trim()).toBe('+11234567890');
  console.log('✅ Phone Number Converter verified successfully');

  // 4. Test Phone Number Replicator
  const replicatorCard = page.locator('div.rounded-xl', { has: page.locator('h3', { hasText: 'Phone Number Replicator' }) }).first();
  const replicatorInput = replicatorCard.locator('textarea').first();
  const replicatorOutput = replicatorCard.locator('textarea').last();
  const replicatorCountInput = replicatorCard.locator('input[type="number"]');

  await replicatorCountInput.fill('3');
  await replicatorInput.fill('+11234567890');
  await page.waitForTimeout(500); // Wait for useMemo debouncing/re-render

  const replicatedText = await replicatorOutput.inputValue();
  expect(replicatedText.trim()).toBe('+11234567890\n+11234567890\n+11234567890');
  console.log('✅ Phone Number Replicator verified successfully');

  // 5. Test Spintax Validator
  const spintaxCard = page.locator('div.rounded-xl', { has: page.locator('h3', { hasText: 'Spintax Validator' }) }).first();
  const spintaxInput = spintaxCard.locator('textarea').first();
  
  // Enter valid spintax
  await spintaxInput.fill('{Hi|Hello} world!');
  await page.waitForTimeout(500);

  // Assert validation diagnostics show Valid and Combinations: 2
  await expect(spintaxCard.getByText('Valid', { exact: true })).toBeVisible();
  await expect(spintaxCard.locator('span:has-text("Unique Combinations:") + span')).toHaveText('2');
  
  // Spin random preview
  await spintaxCard.locator('button:has-text("Random Spin")').click();
  await page.waitForTimeout(500);
  const spinPreview = spintaxCard.locator('label:has-text("Randomized Output Preview") + div');
  const spinPreviewText = await spinPreview.textContent();
  expect(['Hi world!', 'Hello world!']).toContain(spinPreviewText?.trim());

  // Show variations
  await spintaxCard.locator('button:has-text("Show Variations")').click();
  await page.waitForTimeout(500);
  await expect(spintaxCard.locator('text=#1:')).toBeVisible();
  await expect(spintaxCard.locator('text=#2:')).toBeVisible();

  // Enter invalid spintax
  await spintaxInput.fill('{Hi|Hello');
  await page.waitForTimeout(500);
  await expect(spintaxCard.getByText('Error', { exact: true })).toBeVisible();
  await expect(spintaxCard.getByText('Found unclosed opening brace "{"')).toBeVisible();
  console.log('✅ Spintax Validator verified successfully');

  // 6. Test Personalization Tag Validator
  const personalizationCard = page.locator('div.rounded-xl', { has: page.locator('h3', { hasText: 'Personalization Tag Validator' }) }).first();
  const personalizationInput = personalizationCard.locator('textarea').first();
  const renderedPreview = personalizationCard.locator('label:has-text("Rendered Preview") + div');

  // Input message template with personalization tags (only contact fields, no global placeholder dependency)
  await personalizationInput.fill('Hi {FirstName} {LastName}, welcome!');
  await page.waitForTimeout(500);

  // Check default render - {FirstName} and {LastName} resolve to John and Doe
  let previewText = await renderedPreview.textContent();
  expect(previewText?.trim()).toContain('Hi John Doe, welcome!');

  // Change contact details in inputs
  const firstNameInput = personalizationCard.locator('label:has-text("First Name") + input');
  const lastNameInput = personalizationCard.locator('label:has-text("Last Name") + input');
  await firstNameInput.fill('Alice');
  await lastNameInput.fill('Smith');
  await page.waitForTimeout(500);

  previewText = await renderedPreview.textContent();
  expect(previewText?.trim()).toContain('Hi Alice Smith, welcome!');

  // Assert tag status table shows tags are valid
  await expect(personalizationCard.locator('td:has-text("{FirstName}")')).toBeVisible();
  await expect(personalizationCard.locator('td:has-text("{LastName}")')).toBeVisible();
  
  // Enter invalid/unsupported tag
  await personalizationInput.fill('Hello {Email}');
  await page.waitForTimeout(500);
  await expect(personalizationCard.locator('span:has-text("Error")')).toBeVisible();
  await expect(personalizationCard.locator('text=is not a recognized contact field')).toBeVisible();
  console.log('✅ Personalization Tag Validator verified successfully');

  console.log('🎉 All Utilities page tests successfully completed!');
});
