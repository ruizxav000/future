// Builds dist-artifact/future.html: one self-contained page for an Artifact.
import { build } from 'vite';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const THREE = 'https://cdn.jsdelivr.net/npm/three@0.186.1/';
const FONTS =
  'https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=Inter:wght@200..600&family=Sora:wght@300..600&display=swap';

await build({ configFile: 'vite.artifact.config.js', logLevel: 'warn' });

const assets = join('dist-artifact', 'assets');
const files = readdirSync(assets);
const read = (ext) => readFileSync(join(assets, files.find((f) => f.endsWith(ext))), 'utf8');
const js = read('.js').replace(/<\/script/gi, '<\\/script');
const css = read('.css');

const source = readFileSync('index.html', 'utf8');
const markup = source
  .slice(source.indexOf('>', source.indexOf('<body')) + 1, source.indexOf('<script type="module"'))
  .trim();
const importMap = { imports: { three: `${THREE}build/three.module.js`, 'three/': THREE } };

const page = `<title>Twin Paradox</title>
<meta name="description" content="A first-person journey to a black hole, ray traced live in your browser." />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="stylesheet" href="${FONTS}" />
<style>
${css}
</style>
${markup}
<script>document.body.classList.add('state-intro');</script>
<script type="importmap">${JSON.stringify(importMap)}</script>
<script type="module">
${js}
</script>
`;

writeFileSync(join('dist-artifact', 'future.html'), page);
console.log(`dist-artifact/future.html  ${(page.length / 1024).toFixed(1)} kB`);
