import { test, expect } from '@playwright/test';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

// Helper to query the SQLite database
function queryDb(sql: string, params: any[] = []): any[] {
  const result = execSync('python tests/db_helper.py', {
    env: {
      ...process.env,
      SQL_QUERY: sql,
      SQL_PARAMS: JSON.stringify(params),
    }
  }).toString().trim();
  return JSON.parse(result || '[]');
}

// Helper to run an update on SQLite database
function runDbUpdate(sql: string, params: any[] = []): void {
  execSync('python tests/db_helper.py', {
    env: {
      ...process.env,
      SQL_QUERY: sql,
      SQL_PARAMS: JSON.stringify(params),
    }
  });
}

test.describe('Contacts Page E2E Tests', () => {
  const userEmail = 'tester@test.com';

  test.beforeEach(async () => {
    // Clean up database for tester@test.com before each test run
    runDbUpdate('DELETE FROM contacts WHERE user_id = (SELECT id FROM users WHERE email = ?)', [userEmail]);
    runDbUpdate('DELETE FROM groups WHERE user_id = (SELECT id FROM users WHERE email = ?)', [userEmail]);
  });

  test.afterAll(async () => {
    // Clean up database after all tests run
    runDbUpdate('DELETE FROM contacts WHERE user_id = (SELECT id FROM users WHERE email = ?)', [userEmail]);
    runDbUpdate('DELETE FROM groups WHERE user_id = (SELECT id FROM users WHERE email = ?)', [userEmail]);
  });

  test('Verify Contact & Group CRUD operations and Bulk Import', async ({ page }) => {
    // 1. Navigate and Login
    await page.goto('http://127.0.0.1:5173/');
    await page.waitForLoadState('networkidle');

    const emailInput = page.locator('input[type="email"]');
    await emailInput.waitFor({ state: 'visible', timeout: 15000 });
    await emailInput.fill(userEmail);
    await page.fill('input[type="password"]', 'Test@123456');
    await page.click('button:has-text("Sign In")');

    // Wait for Dashboard to load
    await page.waitForSelector('text=Dashboard', { timeout: 15000 });
    console.log('✅ Logged in successfully');

    // 2. Navigate to Contacts page
    await page.click('li:has-text("Contacts")');
    await page.waitForSelector('h2:has-text("Contacts")', { timeout: 15000 });
    console.log('✅ Navigated to Contacts page');

    // 3. Group Creation
    await page.click('button:has-text("Manage Groups")');
    await page.waitForSelector('h2:has-text("Manage Contact Groups")', { timeout: 5000 });

    const groupName = 'Test Group A';
    await page.fill('input[placeholder="New group name..."]', groupName);
    await page.click('input[placeholder="New group name..."] ~ button');

    // Verify group shows up in the modal list
    await expect(page.locator(`div.bg-white:has(h2:has-text("Manage Contact Groups")) span:has-text("${groupName}")`)).toBeVisible();

    // Verify group exists in database
    const dbGroups = queryDb('SELECT name FROM groups WHERE user_id = (SELECT id FROM users WHERE email = ?)', [userEmail]);
    expect(dbGroups.some(g => g.name === groupName)).toBe(true);
    console.log('✅ Group created successfully and synchronized with backend');

    // Close the group management modal
    await page.click('div.bg-white:has(h2:has-text("Manage Contact Groups")) button:has-text("Done")');
    await page.waitForSelector('h2:has-text("Manage Contact Groups")', { state: 'hidden' });

    // 4. Contact Creation
    await page.click('button:has-text("Add Contact")');
    await page.waitForSelector('h2:has-text("Add New Contact")', { timeout: 5000 });

    const phoneNumber = '+12025550144';
    await page.fill('input#number', phoneNumber);
    await page.selectOption('select#status', 'Active');
    await page.fill('input#firstName', 'John');
    await page.fill('input#lastName', 'Doe');
    
    // Check the box for the group we created
    await page.click(`label:has-text("${groupName}") input[type="checkbox"]`);

    // Save Contact
    await page.click('button:has-text("Save Contact")');
    await page.waitForSelector('h2:has-text("Add New Contact")', { state: 'hidden' });

    // Verify contact is in the table
    const contactRow = page.locator('tr', { hasText: phoneNumber });
    await expect(contactRow).toBeVisible();
    await expect(contactRow.locator('td').nth(1)).toHaveText(phoneNumber);
    await expect(contactRow.locator('td').nth(2)).toHaveText('John');
    await expect(contactRow.locator('td').nth(3)).toHaveText('Doe');
    await expect(contactRow.locator('td').nth(4)).toHaveText(groupName);

    // Verify contact exists in backend database
    const dbContacts = queryDb('SELECT number, first_name, last_name, status, groups_json FROM contacts WHERE user_id = (SELECT id FROM users WHERE email = ?)', [userEmail]);
    expect(dbContacts.length).toBe(1);
    expect(dbContacts[0].number).toBe(phoneNumber);
    expect(dbContacts[0].first_name).toBe('John');
    expect(dbContacts[0].last_name).toBe('Doe');
    expect(dbContacts[0].status).toBe('Active');
    expect(JSON.parse(dbContacts[0].groups_json)).toContain(groupName);
    console.log('✅ Contact created successfully and synchronized with backend');

    // 5. Contact Editing
    await contactRow.locator('button:has-text("Edit")').click();
    await page.waitForSelector('h2:has-text("Edit Contact")', { timeout: 5000 });

    await page.fill('input#firstName', 'Johnny');
    await page.selectOption('select#status', 'Subscribed');

    // Save Contact
    await page.click('button:has-text("Save Contact")');
    await page.waitForSelector('h2:has-text("Edit Contact")', { state: 'hidden' });

    // Verify table shows updated values
    await expect(contactRow.locator('td').nth(2)).toHaveText('Johnny');
    await expect(contactRow.locator('td').nth(5)).toHaveText('Subscribed');

    // Verify database shows updated values
    const dbContactsUpdated = queryDb('SELECT first_name, status FROM contacts WHERE user_id = (SELECT id FROM users WHERE email = ?)', [userEmail]);
    expect(dbContactsUpdated.length).toBe(1);
    expect(dbContactsUpdated[0].first_name).toBe('Johnny');
    expect(dbContactsUpdated[0].status).toBe('Subscribed');
    console.log('✅ Contact edited successfully and synchronized with backend');

    // 6. Bulk CSV Import
    // Write a temporary CSV file
    const tempCsvPath = path.join(process.cwd(), 'tests', 'temp-contacts.csv');
    const csvContent = `number,firstName,lastName\n+919999999991,Alice,Smith\n+919999999992,Bob,Jones\n+919999999993,Charlie,Brown\n`;
    fs.writeFileSync(tempCsvPath, csvContent, 'utf-8');

    try {
      await page.click('button:has-text("Import")');
      await page.waitForSelector('h2:has-text("Import Contacts")', { timeout: 5000 });

      // Upload file
      await page.setInputFiles('input#file-upload', tempCsvPath);

      // Verify we skipped to PREVIEW step and show correct new contact counts
      await page.waitForSelector('h3:has-text("3 contacts found.")', { timeout: 5000 });
      await expect(page.locator('text=New: 3')).toBeVisible();

      // Click Import
      await page.click('button:has-text("Import 3 New Contacts")');
      await page.waitForSelector('h2:has-text("Import Contacts")', { state: 'hidden' });

      // Verify imported contacts show in the table
      await expect(page.locator('tr', { hasText: '+919999999991' })).toBeVisible();
      await expect(page.locator('tr', { hasText: '+919999999992' })).toBeVisible();
      await expect(page.locator('tr', { hasText: '+919999999993' })).toBeVisible();

      // Verify imported contacts exist in backend database
      const dbContactsBulk = queryDb('SELECT number, first_name, last_name FROM contacts WHERE user_id = (SELECT id FROM users WHERE email = ?) AND number LIKE "+91%"', [userEmail]);
      expect(dbContactsBulk.length).toBe(3);
      const numbers = dbContactsBulk.map(c => c.number);
      expect(numbers).toContain('+919999999991');
      expect(numbers).toContain('+919999999992');
      expect(numbers).toContain('+919999999993');
      console.log('✅ Bulk CSV Import completed successfully and synchronized with backend');

    } finally {
      // Clean up temporary CSV file
      if (fs.existsSync(tempCsvPath)) {
        fs.unlinkSync(tempCsvPath);
      }
    }

    // 7. Contact Deletion
    const johnRow = page.locator('tr', { hasText: phoneNumber });
    await johnRow.locator('button:has-text("Delete")').click();
    await page.waitForSelector('h2:has-text("Delete Contact")', { timeout: 5000 });
    
    // Confirm Delete
    await page.click('button:has-text("Yes, Delete")');
    await page.waitForSelector('h2:has-text("Delete Contact")', { state: 'hidden' });

    // Verify removed from table
    await expect(johnRow).toBeHidden();

    // Verify deleted in backend database
    const dbContactsAfterDelete = queryDb('SELECT number FROM contacts WHERE user_id = (SELECT id FROM users WHERE email = ?) AND number = ?', [userEmail, phoneNumber]);
    expect(dbContactsAfterDelete.length).toBe(0);
    console.log('✅ Contact deleted successfully and synchronized with backend');

    // 8. Group Deletion
    await page.click('button:has-text("Manage Groups")');
    await page.waitForSelector('h2:has-text("Manage Contact Groups")', { timeout: 5000 });

    // Setup dialog listener for window.confirm
    page.once('dialog', async dialog => {
      expect(dialog.message()).toContain('Are you sure? Deleting a group will not delete the contacts within it.');
      await dialog.accept();
    });

    // Locate Group Row and click delete (trash icon)
    const targetGroupRow = page.locator('div.bg-white:has(h2:has-text("Manage Contact Groups"))')
      .locator('div.flex.items-center.justify-between', { hasText: groupName });
    await targetGroupRow.locator('button').click();

    // Verify group is removed from the modal list
    await expect(page.locator(`div.bg-white:has(h2:has-text("Manage Contact Groups")) span:has-text("${groupName}")`)).toBeHidden();

    // Verify group deleted in database
    const dbGroupsAfterDelete = queryDb('SELECT name FROM groups WHERE user_id = (SELECT id FROM users WHERE email = ?)', [userEmail]);
    expect(dbGroupsAfterDelete.some(g => g.name === groupName)).toBe(false);
    console.log('✅ Group deleted successfully and synchronized with backend');

    // Close Modal
    await page.click('div.bg-white:has(h2:has-text("Manage Contact Groups")) button:has-text("Done")');
    await page.waitForSelector('h2:has-text("Manage Contact Groups")', { state: 'hidden' });
  });
});
