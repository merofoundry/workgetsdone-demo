import { describe, expect, it } from 'vitest';
import { FILTERS, filterInput, isCustomised, isFiltered } from './filters';
const id = '10000000-0000-4000-8000-000000000001';
const q = (s: string) => new URLSearchParams(s);
describe('filterInput', () => {
  it('turns allow-listed URL parameters into service input', () => {
    expect(filterInput('tasks', q(`billable=1&from=2026-01-01&to=2026-02-01&projectId=${id}&sort=due`))).toEqual({ billable: true, from: '2026-01-01', to: '2026-02-01', projectId: id, sort: 'due' });
    expect(filterInput('projects', q('status=ON_SCHEDULE&sort=name'))).toEqual({ status: 'ON_SCHEDULE', sort: 'name' });
    expect(filterInput('notes', q('parentKind=task'))).toEqual({ parentKind: 'task' });
    expect(filterInput('contacts', q(`companyId=${id}&sort=firstName`))).toEqual({ companyId: id, sort: 'firstName' });
  });
  it('drops unknown, malformed and foreign parameters and the default sort', () => {
    expect(filterInput('tasks', q('foo=1&status=STARTED&billable=yes&from=tomorrow&projectId=nope&sort=secret'))).toEqual({});
    expect(filterInput('companies', q('billable=1&sort=name'))).toEqual({});
    expect(filterInput('projects', q('sort=activity'))).toEqual({});
  });
  it('treats a sort alone as customised but not filtered', () => {
    expect(isFiltered({ sort: 'title' })).toBe(false); expect(isCustomised({ sort: 'title' })).toBe(true); expect(isFiltered({ billable: true })).toBe(true); expect(isCustomised({})).toBe(false);
  });
  it('offers no assignee or owner filter in the interface', () => {
    for (const specs of Object.values(FILTERS)) expect(specs.some(spec => spec.key === 'assigneeId' || spec.key === 'ownerId')).toBe(false);
  });
});
