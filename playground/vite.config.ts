import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
	plugins: [tailwindcss()],
	resolve: {
		alias: {
			'spav-js': new URL('../src/index.ts', import.meta.url).pathname
		}
	}
});
