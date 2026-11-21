import { expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SignIn } from './sign-in';

vi.mock('./api', () => ({ googleStartHref: async () => null, service: vi.fn() }));

it('links the public source repository below the demo logins', () => {
  render(<QueryClientProvider client={new QueryClient()}><MemoryRouter initialEntries={['/sign-in']}><SignIn /></MemoryRouter></QueryClientProvider>);
  const link = screen.getByRole('link', { name: 'github.com/merofoundry/workgetsdone-demo' });
  expect(link).toHaveAttribute('href', 'https://github.com/merofoundry/workgetsdone-demo');
  expect(link.closest('p')).toHaveTextContent('Source code is available at github.com/merofoundry/workgetsdone-demo');
  expect(link.closest('section')).toHaveAccessibleName('Try the demo');
});
