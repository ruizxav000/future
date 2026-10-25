import { defineConfig } from 'vite';

// Single-file build for publishing as a claude.ai Artifact: Three.js stays
// external (loaded from a CDN through an import map) and local font packages
// are dropped in favour of Google Fonts. See scripts/build-artifact.mjs.
export default defineConfig({
  base: './',
  plugins: [
    {
      name: 'drop-local-fonts',
      enforce: 'pre',
      resolveId: (id) => (id.startsWith('@fontsource') ? '\0no-font' : null),
      load: (id) => (id === '\0no-font' ? '' : null),
    },
  ],
  build: {
    outDir: 'dist-artifact',
    target: 'es2022',
    modulePreload: false,
    cssCodeSplit: false,
    rollupOptions: {
      external: (id) => id === 'three' || id.startsWith('three/'),
      output: { inlineDynamicImports: true },
    },
  },
});
