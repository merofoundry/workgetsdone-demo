import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { RecordForm } from './forms';
const client = new QueryClient();
const wrap = (node: ReactElement) => <QueryClientProvider client={client}>{node}</QueryClientProvider>;

describe('RecordForm', () => {
  it('submits trimmed values, keeps them on a 422 and shows the conflict message on a 409', () => {
    const onSubmit = vi.fn(); const onReload = vi.fn();
    const { rerender } = render(wrap(<RecordForm kind="company" initial={{ name: 'Northwind' }} onSubmit={onSubmit} onReload={onReload} busy={false} formId="f" />));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: '  Northwind  ' } });
    fireEvent.change(screen.getByLabelText('City'), { target: { value: ' Austin ' } });
    fireEvent.submit(document.getElementById('f')!);
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ name: 'Northwind', city: 'Austin' });
    rerender(wrap(<RecordForm kind="company" initial={{ name: 'Northwind' }} onSubmit={onSubmit} onReload={onReload} busy={false} formId="f" error={{ status: 422, message: 'Some fields are missing or invalid.', fields: ['phone1'] }} />));
    expect(screen.getByText('Check this value').closest('label')).toHaveTextContent('Phone');
    expect((screen.getByLabelText('Name') as HTMLInputElement).value.trim()).toBe('Northwind');
    expect((screen.getByLabelText(/^City/) as HTMLInputElement).value.trim()).toBe('Austin');
    rerender(wrap(<RecordForm kind="company" initial={{ name: 'Northwind' }} onSubmit={onSubmit} onReload={onReload} busy={false} formId="f" error={{ status: 409, message: 'Someone else changed this record. Reload and try again.' }} />));
    expect(screen.getByText('Someone else changed this record. Reload and try again.')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Reload' }));
    expect(onReload).toHaveBeenCalled();
  });
  it('requires the required fields and sends booleans and nulls for empty values', () => {
    const onSubmit = vi.fn();
    render(wrap(<RecordForm kind="task" initial={{ title: 'Call back' }} onSubmit={onSubmit} busy={false} formId="t" />));
    fireEvent.submit(document.getElementById('t')!);
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ title: 'Call back', billable: false, startAt: null, body: null });
  });
});
