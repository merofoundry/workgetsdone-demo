import { expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SignIn } from './sign-in';

vi.mock('./api', () => ({ googleStartHref: async () => null, service: vi.fn() }));

it('credits merofoundry.com with a link on the sign-in page', () => {
  render(<QueryClientProvider client={new QueryClient()}><MemoryRouter initialEntries={['/sign-in']}><SignIn /></MemoryRouter></QueryClientProvider>);
  const link = screen.getByRole('link', { name: 'merofoundry.com' });
  expect(link).toHaveAttribute('href', 'https://merofoundry.com');
  expect(link.closest('p')).toHaveTextContent('Created by merofoundry.com');
});
