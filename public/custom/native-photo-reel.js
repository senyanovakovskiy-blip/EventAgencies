import {createHomeEntrance} from './home-entrance.js';
import {skipHomeEntrance} from './project-transition.js';

// Integration only. Wheel, touch, inertia, snapping and layout stay in the
// retained template controller; there is no second scrolling implementation.
export function connectNativePhotoReel(frame, handlers, createNative, {projects, initialSlug}) {
  const slides = frame.querySelector('.ws-slides');
  const pictures = [...slides.querySelectorAll('.ws-slide img')];
  const entrance = createHomeEntrance(slides);
  const small = matchMedia('(max-width:600px)');
  let current = Math.max(0, projects.findIndex(project => project.slug === initialSlug));
  let started = false, disposed = false, layoutFrame = 0, controller;
  const wrap = index => (index % pictures.length + pictures.length) % pictures.length;
  frame.classList.add('ea-photo-reel', 'ea-native-photo-reel');
  frame.dataset.photoIndex = String(current);
  pictures.forEach(image => { image.decoding = 'async'; });

  function warm() {
    for (const delta of [0, -1, 1, -2, 2]) {
      if (Math.abs(delta) > 1 && navigator.connection?.saveData) continue;
      const image = pictures[wrap(current + delta)];
      const src = (small.matches && image.dataset.srcMobile) || image.dataset.srcDesktop;
      if (image.getAttribute('src') !== src) image.src = src;
      image.decode().catch(() => {});
    }
  }
  function publishScene(index) {
    const picture = pictures[index];
    if (!picture) return;
    const image = (small.matches && picture.dataset.srcMobile) || picture.dataset.srcDesktop || picture.getAttribute('src') || '';
    window.dispatchEvent(new CustomEvent('ea:work', {detail:{slug:projects[index]?.slug || '', image}}));
  }
  function focus(slug) {
    const index = projects.findIndex(project => project.slug === slug);
    if (index >= 0) {
      current = index;
      frame.dataset.photoIndex = String(index);
      warm();
      publishScene(index);
    }
    handlers.current.onFocus?.(slug);
  }
  controller = createNative(frame, {get current() {
    return {...handlers.current, onFocus: focus};
  }});

  function measureCaption(immediate = false) {
    cancelAnimationFrame(layoutFrame);
    const measure = () => {
      if (disposed) return;
      const label = frame.parentElement?.querySelector('.ea-work-caption');
      if (!label?.clientWidth) return;
      const clone = label.cloneNode(true);
      clone.setAttribute('aria-hidden', 'true');
      clone.style.cssText = `position:fixed;left:-10000px;top:0;right:auto;bottom:auto;width:${label.getBoundingClientRect().width}px;min-height:0;visibility:hidden;pointer-events:none;transform:none;box-sizing:border-box`;
      frame.closest('.home').append(clone);
      let height = 0;
      for (const project of projects) {
        clone.querySelector('h2').textContent = project.reelTitle || project.title;
        clone.querySelector('.ea-work-caption-copy>p').textContent = project.category;
        clone.querySelector('.ea-work-caption-copy>a').textContent = 'Команда — ' + project.agencyName + ' ↗';
        height = Math.max(height, clone.getBoundingClientRect().height);
      }
      clone.remove();
      label.style.minHeight = Math.ceil(height) + 'px';
      document.documentElement.style.setProperty('--ea-caption-height', Math.ceil(label.getBoundingClientRect().height) + 'px');
      controller.resize();
    };
    if (immediate) measure(); else layoutFrame = requestAnimationFrame(measure);
  }
  const prepareReturn = () => { measureCaption(true); controller.resize(); };
  const resize = new ResizeObserver(() => { controller.resize(); measureCaption(); });
  resize.observe(frame);
  document.fonts?.ready.then(() => { if (!disposed) measureCaption(); });
  frame.addEventListener('ea:prepare-return', prepareReturn);
  const interruptEntrance = () => entrance.finish();
  frame.addEventListener('wheel', interruptEntrance, {passive:true});
  frame.addEventListener('pointerdown', interruptEntrance, {passive:true});
  warm();
  return {
    step(direction) { entrance.finish(); controller.step(direction); },
    open() { entrance.finish(); controller.open(); },
    setActive(active, ready) {
      controller.setActive(active, ready);
      if (!active) entrance.finish();
      else if (!started && ready) {
        started = true;
        measureCaption(true);
        warm();
        publishScene(current);
        if (skipHomeEntrance(projects[current].slug)) entrance.finish();
        else entrance.reveal(pictures[current]);
      }
    },
    enterAt(slug) { entrance.finish(); return controller.enterAt(slug); },
    destroy() {
      disposed = true;
      cancelAnimationFrame(layoutFrame);
      resize.disconnect();
      entrance.destroy();
      frame.removeEventListener('ea:prepare-return', prepareReturn);
      frame.removeEventListener('wheel', interruptEntrance);
      frame.removeEventListener('pointerdown', interruptEntrance);
      controller.destroy();
    }
  };
}
