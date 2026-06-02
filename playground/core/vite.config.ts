import { defineConfig } from 'vite';

export default defineConfig({
	resolve: {
		alias: {
			'spav-js': new URL('../../src/core/index.ts', import.meta.url).pathname
		}
	}
});
