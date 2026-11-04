import { photoPalette, paletteSurfaces, neutralPalette } from './photo-palette.js';

const field = document.createElement('div');
field.className = 'ea-home-color-field';
field.setAttribute('aria-hidden', 'true');
field.innerHTML = '<div class="ea-home-color-base"></div><div class="ea-home-color-primary"></div><div class="ea-home-color-secondary"></div><div class="ea-home-color-finish"></div>';
document.body.prepend(field);
const root = document.documentElement;
const cache = new Map();
let palette = neutralPalette, sequence = 0, active = location.pathname === '/', source = '';

function paint() {
  const colors = paletteSurfaces(palette, root.dataset.theme === 'dark');
  for (const name of ['base', 'primary', 'secondary']) field.querySelector(`.ea-home-color-${name}`).style.backgroundColor = `rgb(${colors[name].join(' ')})`;
  root.style.setProperty('--ea-home-canvas', `rgb(${colors.base.join(' ')})`);
}
async function extract(src) {
  if (cache.has(src)) return cache.get(src);
  const pending = (async () => {
    const image = new Image(); image.decoding = 'async'; image.src = src;
    await image.decode();
    const sample = document.createElement('canvas'); sample.width = 48; sample.height = 48;
    const context = sample.getContext('2d', { willReadFrequently: true });
    if (!context) return neutralPalette;
    context.drawImage(image, 0, 0, 48, 48);
    return photoPalette(context.getImageData(0, 0, 48, 48).data);
  })();
  cache.set(src, pending);
  if (cache.size > 24) cache.delete(cache.keys().next().value);
  try { return await pending; } catch { cache.delete(src); return neutralPalette; }
}
async function follow(src) {
  const token = ++sequence;
  const safe = typeof src === 'string' && /^\/(?!\/)/.test(src) && !/no-photo|placeholder/i.test(src) ? src : '';
  source = safe;
  let next;
  try { next = safe ? await extract(safe) : neutralPalette; } catch { next = neutralPalette; }
  if (token !== sequence) return;
  palette = next;
  field.dataset.photo = safe;
  paint();
}
function route(path) {
  active = path === '/';
  document.body.toggleAttribute('data-home-color', active);
  if (active) follow(window.__eaCurrentWork?.image || source || document.body.dataset.scene);
}
window.addEventListener('ea:work', event => { source = event.detail.image || ''; if (active) follow(source); });
window.addEventListener('ea:route', event => route(event.detail.path));
window.addEventListener('pageshow', () => route(location.pathname));
new MutationObserver(() => {
  // Theme text switches immediately; its background must switch with it.
  field.classList.add('is-theme-switch');
  paint();
  field.getBoundingClientRect();
  field.classList.remove('is-theme-switch');
}).observe(root, { attributes: true, attributeFilter: ['data-theme'] });
paint();
route(location.pathname);
