/** Public demo accounts shown on the sign-in page. Publishing them is safe because the stage demo restores its baseline every hour (docs/runbooks/demo-reset.md). */
export const demoAccounts = [
  { name: 'Bob', email: 'bob@workgetsdone.test', password: 'Wgd-Bob-2026!Test' },
  { name: 'Jane', email: 'jane@workgetsdone.test', password: 'Wgd-Jane-2026!Test' },
] as const;
export type DemoAccount = (typeof demoAccounts)[number];
