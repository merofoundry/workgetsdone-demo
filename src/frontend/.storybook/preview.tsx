import React, { useEffect, useState } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { UIProvider } from '../src/ui-context';
import { fixtures, registry } from '../fixtures/data';
import '../src/styles.css';
function Provider({ children, state, target }: { children: React.ReactNode; state?: string; target?: string }) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }));
  useEffect(() => {
    const previous = window.fetch;
    window.fetch = async (input, options) => {
      const path = String(input);
      if (path === '/_app/services.json') return new Response(JSON.stringify(registry), { status: 200 });
      const id = path.split('/').at(-2);
      const name = Object.keys(registry.services).find(name => registry.services[name] === id)!;
      if (name === target && state === 'loading') return new Promise(() => {});
      if (name === target && state === 'error') return new Response('{}', { status: 503 });
      let data = fixtures[name] || { ok: true };
      if (state === 'empty' && name === target) {
        if (name === 'dashboard.agenda') data = { windowStart: '2026-10-04', windowEnd: '2026-10-17', items: [], overdue: [] };
        else if (name === 'dashboard.rollup') data = { projects: [], total: 0 };
        else if (name === 'projects.timeline') data = { entries: [], nextCursor: null, remaining: 0 };
      }
      return new Response(JSON.stringify({ data }), { status: 200 });
    };
    client.clear();
    return () => { window.fetch = previous; client.clear(); };
  }, [client, state, target]);
  return <QueryClientProvider client={client}><MemoryRouter><UIProvider><div className="page">{children}</div></UIProvider></MemoryRouter></QueryClientProvider>;
}
export default { decorators: [(Story: React.ComponentType, context: { parameters: { state?: string; target?: string } }) => <Provider state={context.parameters.state} target={context.parameters.target}><Story /></Provider>] };
