// A decoded photograph connects the two layouts while React keeps owning routes.
let active = false, replayHistory = false, returnSlug = null, homePosition = null;
export const isProjectTransitioning = () => active;
export function skipHomeEntrance(slug) {
  if (returnSlug !== slug) return false;
  returnSlug = null;
  return true;
}
export function deferProjectHistory() {
  if (!active) return false;
  replayHistory = true;
  return true;
}
export function homePhoto() {
  const reel = document.querySelector('.ea-photo-reel');
  const slide = reel?.querySelectorAll('.ws-slide')[Number(reel.dataset.photoIndex || 0)];
  return slide?.querySelector('.ea-photo-preview') || slide?.querySelector('img');
}
export function rememberHomePosition() {
  homePosition = {top: scrollY, width: innerWidth, mobile: innerWidth <= 900};
}
export function restoreHomePosition() {
  if (innerWidth > 900) { window.scrollTo(0, 0); return; }
  if (homePosition?.mobile && Math.abs(homePosition.width - innerWidth) < 40) {
    window.scrollTo(0, homePosition.top);
  } else {
    const reel = document.querySelector('.ea-photo-reel');
    if (reel) window.scrollTo(0, Math.max(0, scrollY + reel.getBoundingClientRect().top - innerHeight * .18));
  }
}
function fittedRect(image) {
  if (!image) return null;
  const rect = image.getBoundingClientRect();
  const width = image.naturalWidth || Number(image.getAttribute('width'));
  const height = image.naturalHeight || Number(image.getAttribute('height'));
  if (!rect.width || !rect.height || !width || !height) return null;
  const ratio = width / height;
  const w = Math.min(rect.width, rect.height * ratio), h = w / ratio;
  return {x: rect.left + (rect.width - w) / 2, y: rect.top + (rect.height - h) / 2, width: w, height: h};
}
function inView(rect) { return rect && rect.y < innerHeight && rect.y + rect.height > 0 && rect.x < innerWidth && rect.x + rect.width > 0; }
const nextFrame = () => new Promise(resolve => requestAnimationFrame(resolve));
function copyPhoto(image) {
  const width = image?.naturalWidth || (image?.tagName === 'CANVAS' && image.width);
  const height = image?.naturalHeight || (image?.tagName === 'CANVAS' && image.height);
  if (!width || !height) return null;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.drawImage(image, 0, 0);
  canvas.setAttribute('aria-hidden', 'true');
  return canvas;
}

// A slow or failed high-resolution request keeps the already decoded preview.
// It is attached to the image's own frame, so it follows normal page scrolling.
function keepPreview(image, source) {
  if (!image || (image.complete && image.naturalWidth)) return;
  const preview = copyPhoto(source);
  if (!preview) return;
  preview.className = 'ea-photo-preview';
  preview.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:contain;pointer-events:none;z-index:1';
  image.parentElement.append(preview);
  const release = async () => {
    try { await image.decode(); } catch { return; }
    if (!image.naturalWidth) return;
    image.removeEventListener('load', release);
    if (preview.isConnected && preview.animate && !matchMedia('(prefers-reduced-motion:reduce)').matches)
      await preview.animate([{opacity: 1}, {opacity: 0}], {duration: 140}).finished.catch(() => {});
    preview.remove();
  };
  image.addEventListener('load', release);
  if (image.complete && image.naturalWidth) release();
}

export async function transitionProject({root, source, destination, commit, afterLayout, returningSlug}) {
  if (active) return;
  active = true;
  if (returningSlug) returnSlug = returningSlug;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const from = source?.naturalWidth || source?.tagName === 'CANVAS' ? fittedRect(source) : null;
  const shared = inView(from) && !reduced.matches;
  let photo, animations = [], committed = false, interrupted = false;
  const viewport = {width: innerWidth, height: innerHeight};
  const originalOpacity = root.style.opacity;
  const animate = (node, frames, duration) => {
    const animation = node.animate(frames, {duration, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'both'});
    animations.push(animation);
    return animation.finished.catch(() => {});
  };
  const stop = () => animations.forEach(animation => animation.cancel());
  const interrupt = () => { interrupted = true; stop(); };
  // The retained layout also emits resize events after images load.
  const onResize = () => { if (innerWidth !== viewport.width || innerHeight !== viewport.height) interrupt(); };
  const onReduced = () => { if (reduced.matches) interrupt(); };
  const onVisibility = () => { if (document.hidden) interrupt(); };
  window.addEventListener('resize', onResize);
  reduced.addEventListener('change', onReduced);
  document.addEventListener('visibilitychange', onVisibility);
  try {
    if (shared) {
      // Copy decoded pixels, so even disabled/evicted caches cannot delay the route.
      photo = copyPhoto(source);
      if (photo) {
        photo.className = 'ea-project-flight';
        photo.style.cssText = `position:fixed;left:${from.x}px;top:${from.y}px;width:${from.width}px;height:${from.height}px;object-fit:contain;transform-origin:0 0;pointer-events:none;z-index:10000;will-change:transform`;
        document.body.append(photo);
      }
    }
    document.documentElement.classList.add('ea-project-transition');
    if (photo) document.documentElement.classList.add('ea-project-shared');
    if (!reduced.matches && !interrupted && root.animate) await animate(root, [{opacity: 1}, {opacity: 0}], 120);
    root.style.opacity = '0';
    animations.forEach(animation => animation.cancel());
    animations = [];
    commit();
    committed = true;
    // Let React effects mount the reel and reserve the full caption height.
    await nextFrame();
    document.querySelector('.ea-photo-reel')?.dispatchEvent(new Event('ea:prepare-return'));
    afterLayout?.();
    await nextFrame();
    afterLayout?.();
    const target = destination();
    const to = fittedRect(target);
    keepPreview(target, source);
    root.style.opacity = originalOpacity;
    const duration = innerWidth <= 900 ? 500 : 650;
    if (!reduced.matches && !interrupted && root.animate) {
      const reveal = animate(root, [{opacity: 0}, {opacity: 1}], 280);
      if (photo && inView(to)) {
        await Promise.all([reveal, animate(photo, [
          {transform: 'translate(0,0) scale(1,1)'},
          {transform: `translate(${to.x - from.x}px,${to.y - from.y}px) scale(${to.width / from.width},${to.height / from.height})`}
        ], duration)]);
      } else {
        photo?.remove();
        photo = null;
        document.documentElement.classList.remove('ea-project-shared');
        await reveal;
      }
    }
  } catch (error) {
    // Navigation must still finish if animation or image decoding is unavailable.
    if (!committed) { commit(); committed = true; }
    afterLayout?.();
    console.warn('Photo transition skipped', error);
  } finally {
    stop();
    photo?.remove();
    root.style.opacity = originalOpacity;
    document.documentElement.classList.remove('ea-project-transition', 'ea-project-shared');
    window.removeEventListener('resize', onResize);
    reduced.removeEventListener('change', onReduced);
    document.removeEventListener('visibilitychange', onVisibility);
    active = false;
    // Use the newest React listener and the latest browser URL after unlocking.
    if (replayHistory) { replayHistory = false; setTimeout(() => window.dispatchEvent(new PopStateEvent('popstate')), 0); }
  }
}
