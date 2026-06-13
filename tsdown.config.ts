import { defineConfig } from 'tsdown';

export default defineConfig({
	platform: 'browser',
	format: 'esm',
	dts: true,
	sourcemap: true,
	clean: true,
	exports: true,
	publint: true,
	attw: { profile: 'esm-only' }
});
