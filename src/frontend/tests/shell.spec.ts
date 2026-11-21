import { test, expect } from '@playwright/test';
import { adminProfile, fixtures } from '../fixtures/data';
import { mock } from './helpers';

const sections: [string, string][] = [['Overview', '/'], ['Companies', '/companies'], ['Contacts', '/contacts'], ['Projects', '/projects'], ['Tasks', '/tasks'], ['Calls', '/calls'], ['Notes', '/notes']];
const nav = (page: import('@playwright/test').Page) => page.getByRole('navigation', { name: 'Main' });

test('the sidebar lists the seven sections and none is a dead link', async ({ page }) => {
  await mock(page); await page.goto('/');
  for (const [label] of sections) await expect(nav(page).getByRole('link', { name: label, exact: true })).toBeVisible();
  await expect(nav(page).getByRole('link')).toHaveCount(sections.length);
  for (const [label, path] of sections) {
    await nav(page).getByRole('link', { name: label, exact: true }).click();
    await expect(page).toHaveURL(path === '/' ? /\/$/ : new RegExp(`${path}$`));
    await expect(page.locator('.page-header h1').first()).toBeVisible();
    await expect(page.getByText('could not be found')).toHaveCount(0);
    await expect(nav(page).getByRole('link', { name: label, exact: true })).toHaveAttribute('aria-current', 'page');
  }
});

test('the skip link and the palette trigger survive the new layout', async ({ page }) => {
  await mock(page); await page.goto('/');
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeAttached();
  await page.keyboard.press('Control+k');
  await expect(page.getByRole('dialog', { name: 'Jump to a record or action' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: /^Jump to a record or action/ }).click();
  await expect(page.getByRole('combobox')).toBeFocused();
});

test('on a 375 px screen the sidebar is closed, the hamburger opens it and the backdrop closes it', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await mock(page); await page.goto('/');
  await expect(nav(page).getByRole('link', { name: 'Tasks', exact: true })).toBeHidden();
  const hamburger = page.getByRole('button', { name: 'Toggle sidebar' });
  await hamburger.click();
  await expect(nav(page).getByRole('link', { name: 'Tasks', exact: true })).toBeVisible();
  await expect(page.getByTestId('sidebar-backdrop')).toBeVisible();
  await page.getByTestId('sidebar-backdrop').click({ position: { x: 350, y: 400 } });
  await expect(nav(page).getByRole('link', { name: 'Tasks', exact: true })).toBeHidden();
  await expect(page.getByTestId('sidebar-backdrop')).toHaveCount(0);
  await hamburger.click();
  await nav(page).getByRole('link', { name: 'Tasks', exact: true }).click();
  await expect(page).toHaveURL(/\/tasks$/);
  await expect(nav(page).getByRole('link', { name: 'Tasks', exact: true })).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
});

test('on desktop the hamburger collapses the sidebar to icons and the labels stay readable to assistive technology', async ({ page }) => {
  await mock(page); await page.goto('/');
  const aside = page.locator('aside', { has: nav(page) });
  const wide = (await aside.boundingBox())!.width;
  await page.getByRole('button', { name: 'Toggle sidebar' }).click();
  await page.mouse.move(900, 400);
  await expect.poll(async () => (await aside.boundingBox())!.width).toBeLessThan(wide - 100);
  await expect(nav(page).getByRole('link', { name: 'Companies', exact: true })).toBeAttached();
});

for (const isAdmin of [false, true]) {
  test(`the account menu offers Change password and Sign out${isAdmin ? ' and Users' : ' but not Users'}`, async ({ page }) => {
    await mock(page, { 'account.read': isAdmin ? adminProfile : { ...(fixtures['account.read'] as object), isAdmin: false } });
    await page.goto('/');
    await page.getByRole('button', { name: /^Account:/ }).click();
    const menu = page.locator('#account-menu');
    await expect(menu.getByRole('link', { name: 'Change password' })).toBeVisible();
    await expect(menu.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
    await expect(menu.getByRole('link', { name: 'Users' })).toHaveCount(isAdmin ? 1 : 0);
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await page.getByRole('button', { name: /^Account:/ }).click();
    await menu.getByRole('link', { name: 'Change password' }).click();
    await expect(page).toHaveURL(/\/account$/);
    await expect(menu).toHaveCount(0);
  });
}

test('the dark-mode toggle flips html.dark and the choice survives a reload', async ({ page }) => {
  await mock(page); await page.goto('/');
  const html = page.locator('html');
  await expect(html).not.toHaveClass(/dark/);
  await page.getByRole('button', { name: 'Toggle dark mode' }).click();
  await expect(html).toHaveClass(/dark/);
  await page.reload();
  await expect(html).toHaveClass(/dark/);
  await expect(page.getByRole('button', { name: 'Toggle dark mode' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Toggle dark mode' }).click();
  await expect(html).not.toHaveClass(/dark/);
  await page.reload();
  await expect(html).not.toHaveClass(/dark/);
});

test('a blocked localStorage never breaks the app: the toggle still works for the page view', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } }); });
  await mock(page); await page.goto('/');
  await page.getByRole('button', { name: 'Toggle dark mode' }).click();
  await expect(page.locator('html')).toHaveClass(/dark/);
  expect(errors).toEqual([]);
});

test('mobile sidebar: aria-expanded tracks it, focus moves in, Escape closes and returns focus to the toggle', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await mock(page); await page.goto('/');
  const hamburger = page.getByRole('button', { name: 'Toggle sidebar' });
  await expect(hamburger).toHaveAttribute('aria-controls', 'app-sidebar');
  await expect(hamburger).toHaveAttribute('aria-expanded', 'false');
  await hamburger.click();
  await expect(hamburger).toHaveAttribute('aria-expanded', 'true');
  await expect(nav(page).getByRole('link', { name: 'Overview', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(nav(page).getByRole('link', { name: 'Tasks', exact: true })).toBeHidden();
  await expect(hamburger).toBeFocused();
  await expect(hamburger).toHaveAttribute('aria-expanded', 'false');
});

test('Escape in the account menu returns focus to its toggle', async ({ page }) => {
  await mock(page); await page.goto('/');
  const toggle = page.getByRole('button', { name: /^Account:/ });
  await toggle.click();
  await page.getByRole('link', { name: 'Change password' }).focus();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('link', { name: 'Change password' })).toHaveCount(0);
  await expect(toggle).toBeFocused();
});
