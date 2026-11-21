import type { Page } from '@playwright/test';
import { fixtures, registry, timeline } from '../fixtures/data';
export async function mock(page: Page, overrides: Record<string, unknown> = {}) {
  await page.clock.install({ time: new Date('2026-10-08T16:00:00Z') });
  await page.route('**/services.json', route => route.fulfill({ json: registry }));
  await page.route('**/api/v1/services/*/inbound', async route => {
    const id = new URL(route.request().url()).pathname.split('/').at(-2);
    const name = Object.keys(registry.services).find(name => registry.services[name] === id)!;
    if (overrides[name] === 'error') return route.fulfill({ status: 503, json: { error: { message: 'Temporary failure.' } } });
    const input = route.request().postDataJSON();
    let data = overrides[name] ?? fixtures[name] ?? { ok: true };
    if (name === 'projects.timeline' && input?.cursor) data = { entries: [{ ...timeline.entries[0], id: '60000000-0000-4000-8000-000000000001', title: 'Earlier timeline entry' }], nextCursor: null, remaining: 0 };
    await route.fulfill({ json: { data } });
  });
}
