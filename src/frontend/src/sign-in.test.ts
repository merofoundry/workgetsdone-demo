import { expect, it } from 'vitest';
import { safeReturnPath } from './sign-in';
it.each(['//evil.test', 'https://evil.test', '/\\evil.test', '/sign-in?returnTo=/', null])('rejects unsafe sign-in return target %s', value => expect(safeReturnPath(value)).toBe('/'));
it('keeps the intended project and filter', () => expect(safeReturnPath('/projects/example?kind=tasks')).toBe('/projects/example?kind=tasks'));
