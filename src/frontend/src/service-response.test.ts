import { describe, expect, it } from 'vitest';
import { handler } from '../services/respond';
const input = { name: 'dashboard.stats', expected: [{ key: 'openTasks', count: true }] };
describe('service dataset response boundary', () => {
  it('refuses a missing dataset rather than inventing a zero total', () => {
    expect(handler({ record: { valid: true }, input }).resultStatus).toBe(503);
  });
  it('keeps an exact aggregate count instead of a bounded row count', () => {
    const result = handler({ record: { valid: true, openTasksRows: [{ n: 2500 }] }, input });
    expect(result.resultStatus).toBe(200);
    expect(result.result.data.openTasks).toBe(2500);
  });
  it('accepts a captured empty dataset', () => {
    const result = handler({ record: { valid: true, projectsRows: [], normalized: { limit: 6 } }, input: { name: 'dashboard.rollup', expected: [{ key: 'projects', count: false }] } });
    expect(result.resultStatus).toBe(200);
    expect(result.result.data).toEqual({ projects: [], total: 0 });
  });
  it('refuses bounded results with an overflow sentinel', () => {
    const result = handler({ record: { valid: true, projectsRows: Array.from({ length: 1001 }, (_, i) => ({ key: i })) }, input: { name: 'dashboard.rollup', expected: [{ key: 'projects', count: false }] } });
    expect(result.resultStatus).toBe(503);
  });
  it('keeps the normalized validation failure', () => {
    expect(handler({ record: { valid: false, resultStatus: 422, result: { error: { message: 'Invalid project.' } } }, input })).toEqual({ resultStatus: 422, result: { error: { message: 'Invalid project.' } } });
  });
});

describe('collection service responses', () => {
  const tasks = Array.from({ length: 30 }, (_, i) => ({ key: String(i).padStart(2, '0'), name: `Task ${i}`, completed: i === 0 }));
  const record = { valid: true, tasksRows: tasks, taskWritableRows: [{ key: '01' }], normalized: { cursor: 0, query: '', includeClosed: false } };
  const expected = [{ key: 'tasks', count: false }, { key: 'taskWritable', count: false }];
  it('filters before pagination and keeps permission flags', () => {
    const result = handler({ record, input: { name: 'tasks.list', expected } }).result.data;
    expect(result.total).toBe(29); expect(result.items).toHaveLength(25); expect(result.nextCursor).toBe('25');
    expect(result.items.find((row: any) => row.id === '01').canWrite).toBe(true); expect(result.items.find((row: any) => row.id === '02').canWrite).toBe(false);
  });
  it('searches before pagination and supports the final page', () => {
    const result = handler({ record: { ...record, normalized: { cursor: 25, query: '', includeClosed: true } }, input: { name: 'tasks.list', expected } }).result.data;
    expect(result.items).toHaveLength(5); expect(result.nextCursor).toBeNull();
    const search = handler({ record: { ...record, normalized: { cursor: 0, query: 'task 29' } }, input: { name: 'tasks.list', expected } }).result.data;
    expect(search.total).toBe(1); expect(search.items[0].title).toBe('Task 29');
  });
  it('masks an identifier absent from the visible dataset', () => {
    const result = handler({ record: { ...record, normalized: { id: 'private' } }, input: { name: 'tasks.read', expected } });
    expect(result.resultStatus).toBe(404); expect(result.result.data).toBeUndefined();
  });
});
