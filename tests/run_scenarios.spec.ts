import { test, expect, Page } from '@playwright/test';

/**
 * Helper: click inside a modal without being blocked by the backdrop overlay.
 * All modals in this app use a `fixed inset-0` backdrop div with onClick={onClose}.
 * Playwright's actionability check sees the backdrop as intercepting pointer events.
 * Using `{ force: true }` bypasses the check safely since we know the inner content
 * stops event propagation via e.stopPropagation().
 */

test('Run all three scenarios', async ({ page }) => {
  // Increase timeout for this test since sending takes time
  test.setTimeout(300000); // 5 minutes

  const textOnlyCampaignName = `TextOnly E2E ${Date.now()}`;
  const attachmentSeparateCampaignName = `Attachment Separate E2E ${Date.now()}`;
  const attachmentCaptionCampaignName = `Attachment Caption E2E ${Date.now()}`;

  // ─── 1. Navigate and Login ─────────────────────────────────────────
  await page.goto('http://127.0.0.1:5173/');
  await page.waitForLoadState('networkidle');

  // Try to log in
  const emailInput = page.locator('input[type="email"]');
  await emailInput.waitFor({ state: 'visible', timeout: 15000 });
  await emailInput.fill('tester@test.com');
  await page.fill('input[type="password"]', 'Test@123456');
  await page.click('button:has-text("Sign In")');
  await page.waitForTimeout(2000);

  // If login failed, sign up
  const invalidLogin = page.locator('text=Invalid email or password');
  if (await invalidLogin.isVisible()) {
    await page.click('text=Create one');
    await page.waitForTimeout(1000);
    await page.fill('input[placeholder="Full Name"]', 'Tester');
    // Re-fill email and password on signup form
    await page.locator('input[type="email"]').fill('tester@test.com');
    await page.locator('input[type="password"]').fill('Test@123456');
    await page.click('button:has-text("Create Account")');
    await page.waitForTimeout(2000);
  }

  // Wait for main dashboard
  await page.waitForSelector('text=Dashboard', { timeout: 15000 });
  console.log('✅ Logged in successfully');

  // ─── 2. Setup Contacts & Groups ─────────────────────────────────────
  console.log('Step 2a: Clicking Contacts nav...');
  await page.click('li:has-text("Contacts")');
  console.log('Step 2b: Clicked. Waiting for Add Contact... ');
  await page.waitForTimeout(2000);
  
  // Take screenshot to diagnose
  await page.screenshot({ path: 'd:/NovaSend/debug-contacts-page.png' });
  console.log('Step 2c: Screenshot taken. Checking Add Contact visibility...');
  
  const addContactVisible = await page.locator('button:has-text("Add Contact")').isVisible();
  console.log(`Step 2d: Add Contact visible = ${addContactVisible}`);

  // Open Manage Groups modal
  console.log('Step 2e: Clicking Manage Groups...');
  await page.click('button:has-text("Manage Groups")');
  console.log('Step 2f: Clicked. Waiting for modal...');
  await page.waitForSelector('text=Manage Contact Groups', { timeout: 5000 });
  await page.waitForTimeout(500); // Let animation finish
  console.log('Step 2g: Modal opened.');

  // Check if TestGroup exists already
  const groupExists = await page.locator('span:has-text("TestGroup")').isVisible();
  console.log(`Step 2h: TestGroup exists = ${groupExists}`);
  if (!groupExists) {
    await page.locator('input[placeholder="New group name..."]').fill('TestGroup');
    await page.getByRole('button', { name: 'Add', exact: true }).click({ force: true });
    await page.waitForTimeout(500);
    console.log('  ✅ Created TestGroup');
  } else {
    console.log('  ℹ️ TestGroup already exists');
  }

  // Close the Manage Groups modal
  console.log('Step 2i: Closing modal...');
  const doneBtn = page.locator('button:has-text("Done")');
  await doneBtn.click({ force: true });
  await page.waitForTimeout(500);
  console.log('Step 2j: Modal closed.');

  // Delete existing contact if present (to start clean)
  const contactExists = await page.locator('td:has-text("+918470805616")').isVisible();
  console.log(`Step 2k: Contact exists = ${contactExists}`);
  if (contactExists) {
    const contactRow = page.locator('tr', { hasText: '+918470805616' });
    await contactRow.locator('button:has-text("Delete")').click();
    await page.waitForTimeout(500);
    await page.locator('button:has-text("Yes, Delete")').click({ force: true });
    await page.waitForTimeout(1000);
    console.log('  🗑️ Deleted existing contact');
  }

  // Add Contact
  await page.click('button:has-text("Add Contact")');
  await page.waitForTimeout(500);

  // Fill contact form inside the modal
  await page.locator('input#number').fill('+918470805616');
  await page.locator('input#firstName').fill('Test');
  await page.locator('input#lastName').fill('User');

  // Select TestGroup checkbox - use force since it's inside a modal
  const groupLabel = page.locator('label:has-text("TestGroup")');
  await groupLabel.click({ force: true });
  await page.waitForTimeout(300);

  // Save Contact
  await page.locator('button:has-text("Save Contact")').click({ force: true });
  await page.waitForTimeout(1500);
  console.log('✅ Contact +918470805616 added to TestGroup');

  // ─── 3. Check Account Connection ─────────────────────────────────────
  await page.click('li:has-text("Accounts")');
  await page.waitForTimeout(2000);

  // Check if we have a connected account
  const connectedBadge = page.locator('span:has-text("Connected")');
  const isConnected = await connectedBadge.isVisible();

  if (!isConnected) {
    // Check if we need to add an account first
    const hasAccount = await page.locator('h3').first().isVisible();
    if (!hasAccount) {
      await page.click('button:has-text("Add New Account")');
      await page.waitForTimeout(500);
      await page.locator('input#accountName').fill('TestAccount');
      await page.locator('button:has-text("Add Account")').click({ force: true });
      await page.waitForTimeout(1500);
    }

    // Connect via QR
    await page.click('button:has-text("Connect via QR")');
    console.log('⏳ Waiting for QR code scan... (120s timeout)');
    await page.waitForSelector('text=Connection Successful!', { timeout: 120000 });
    console.log('✅ WhatsApp account connected');
  } else {
    console.log('✅ WhatsApp account already connected');
  }

  // ─── 4. Scenario 1: Text-Only Campaign ─────────────────────────────
  console.log('\n🚀 Starting Scenario 1: Text-Only Campaign');
  await page.click('li:has-text("Campaigns")');
  await page.waitForSelector('text=Campaign Management', { timeout: 10000 });

  // Create Campaign
  await page.click('button:has-text("Create New Campaign")');
  await page.waitForTimeout(1000);

  // Fill campaign form
  await page.locator('input#campaignName').fill(textOnlyCampaignName);

  // Select target group - the group checkboxes are inside the Campaign Editor modal
  const campaignGroupLabel = page.locator('label:has-text("TestGroup")');
  await campaignGroupLabel.click({ force: true });
  await page.waitForTimeout(300);

  // Fill message
  await page.locator('textarea#message').fill('Hi, Good night');
  await page.waitForTimeout(300);

  // Save Campaign
  await page.locator('button:has-text("Save Campaign")').click({ force: true });
  await page.waitForTimeout(2000);
  console.log(`  ✅ Campaign "${textOnlyCampaignName}" created`);

  // Launch - find the campaign row and click Launch
  let campaignRow = page.locator('tr', { hasText: textOnlyCampaignName }).first();
  await campaignRow.locator('button:has-text("Launch")').click({ force: true });
  await page.waitForTimeout(2000);
  console.log('  🚀 Campaign launched, waiting for completion...');

  // Switch to History to monitor completion
  await page.locator('button:has-text("History")').click();
  await page.waitForTimeout(1000);

  // Wait for completion
  await expect(
    page.locator('tr', { hasText: textOnlyCampaignName }).first().locator('span:has-text("Completed")')
  ).toBeVisible({ timeout: 120000 });
  console.log('✅ Scenario 1 PASSED: Text-Only campaign completed successfully!\n');

  // ─── 5. Scenario 2: Text + Separate Attachment ─────────────────────
  console.log('🚀 Starting Scenario 2: Text + Separate Attachment');

  // Switch back to Current view
  await page.locator('button:has-text("Current")').click();
  await page.waitForTimeout(500);

  // Create new Campaign
  await page.click('button:has-text("Create New Campaign")');
  await page.waitForTimeout(1000);

  await page.locator('input#campaignName').fill(attachmentSeparateCampaignName);

  // Select target group
  await page.locator('label:has-text("TestGroup")').click({ force: true });
  await page.waitForTimeout(300);

  // Fill message
  await page.locator('textarea#message').fill('Hi, Good night');
  await page.waitForTimeout(300);

  // Enable "Attach file from shared folder"
  const attachCheckbox = page.locator('#useAttachmentFromFolder');
  await attachCheckbox.click({ force: true });
  await page.waitForTimeout(2000); // Wait for attachment check to complete

  // Ensure sendAsCaption is UNCHECKED (attachment sent separately)
  const captionCheckbox = page.locator('#sendAsCaption');
  const isCaptionChecked = await captionCheckbox.isChecked();
  if (isCaptionChecked) {
    await captionCheckbox.click({ force: true });
    await page.waitForTimeout(300);
  }

  // Save
  await page.locator('button:has-text("Save Campaign")').click({ force: true });
  await page.waitForTimeout(2000);
  console.log(`  ✅ Campaign "${attachmentSeparateCampaignName}" created`);

  // Launch
  campaignRow = page.locator('tr', { hasText: attachmentSeparateCampaignName }).first();
  await campaignRow.locator('button:has-text("Launch")').click({ force: true });
  await page.waitForTimeout(2000);
  console.log('  🚀 Campaign launched, waiting for completion...');

  // Monitor in History
  await page.locator('button:has-text("History")').click();
  await page.waitForTimeout(1000);

  await expect(
    page.locator('tr', { hasText: attachmentSeparateCampaignName }).first().locator('span:has-text("Completed")')
  ).toBeVisible({ timeout: 120000 });
  console.log('✅ Scenario 2 PASSED: Text + Separate Attachment campaign completed!\n');

  // ─── 6. Scenario 3: Text + Attachment as Caption ───────────────────
  console.log('🚀 Starting Scenario 3: Text + Attachment as Caption');

  // Switch back to Current view
  await page.locator('button:has-text("Current")').click();
  await page.waitForTimeout(500);

  // Create new Campaign
  await page.click('button:has-text("Create New Campaign")');
  await page.waitForTimeout(1000);

  await page.locator('input#campaignName').fill(attachmentCaptionCampaignName);

  // Select target group
  await page.locator('label:has-text("TestGroup")').click({ force: true });
  await page.waitForTimeout(300);

  // Fill message
  await page.locator('textarea#message').fill('Hi, Good night');
  await page.waitForTimeout(300);

  // Enable attachment
  await page.locator('#useAttachmentFromFolder').click({ force: true });
  await page.waitForTimeout(2000); // Wait for attachment check

  // Ensure sendAsCaption IS CHECKED
  const captionCheckbox2 = page.locator('#sendAsCaption');
  const isCaptionChecked2 = await captionCheckbox2.isChecked();
  if (!isCaptionChecked2) {
    await captionCheckbox2.click({ force: true });
    await page.waitForTimeout(300);
  }

  // Save
  await page.locator('button:has-text("Save Campaign")').click({ force: true });
  await page.waitForTimeout(2000);
  console.log(`  ✅ Campaign "${attachmentCaptionCampaignName}" created`);

  // Launch
  campaignRow = page.locator('tr', { hasText: attachmentCaptionCampaignName }).first();
  await campaignRow.locator('button:has-text("Launch")').click({ force: true });
  await page.waitForTimeout(2000);
  console.log('  🚀 Campaign launched, waiting for completion...');

  // Monitor in History
  await page.locator('button:has-text("History")').click();
  await page.waitForTimeout(1000);

  await expect(
    page.locator('tr', { hasText: attachmentCaptionCampaignName }).first().locator('span:has-text("Completed")')
  ).toBeVisible({ timeout: 120000 });
  console.log('✅ Scenario 3 PASSED: Text + Attachment as Caption campaign completed!\n');

  console.log('═══════════════════════════════════════════');
  console.log('  🎉 ALL 3 SCENARIOS PASSED SUCCESSFULLY!');
  console.log('═══════════════════════════════════════════');

});
