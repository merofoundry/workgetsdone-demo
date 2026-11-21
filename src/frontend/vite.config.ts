import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import svgr from 'vite-plugin-svgr';
export default defineConfig(() => ({
  plugins: [react(), tailwindcss(), svgr({ svgrOptions: { icon: true, exportType: 'named', namedExport: 'ReactComponent' } })], base: '/',
  test: { environment: 'jsdom', setupFiles: ['./src/test-setup.ts'], include: ['src/**/*.test.{ts,tsx}', 'services/**/*.test.ts'] },
}));
