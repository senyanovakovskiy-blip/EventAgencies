// Animate only a decoded photograph, once per mounted home reel.
// The user can interrupt it at any time; it never gates navigation.
export function createHomeEntrance(slides) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let used = false, disposed = false, active = false;
  let animation, observer, image, load, error;
  let decoded = false, inView = false;

  function unwatch() {
    observer?.disconnect();
    observer = null;
    if (image) {
      image.removeEventListener('load', load);
      image.removeEventListener('error', error);
    }
  }
  function finish() {
    active = false;
    unwatch();
    animation?.cancel();
    animation = null;
    slides.style.removeProperty('opacity');
    slides.style.removeProperty('transform');
    slides.style.removeProperty('will-change');
    if (used) slides.dataset.entrance = 'ready';
  }
  function show() {
    if (!active || !decoded || !inView || disposed) return;
    if (reduced.matches || !slides.animate) { finish(); return; }
    active = false;
    unwatch();
    slides.dataset.entrance = 'revealing';
    slides.style.removeProperty('opacity');
    const mobile = matchMedia('(max-width: 900px)').matches;
    slides.style.willChange = 'opacity, transform';
    animation = slides.animate([
      {opacity: 0, transform: `translateY(${mobile ? 8 : 16}px) scale(.985)`},
      {opacity: 1, transform: 'translateY(0) scale(1)'}
    ], {duration: mobile ? 650 : 900, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'both'});
    animation.finished.then(finish, () => {});
  }
  function reveal(img) {
    if (used || disposed) return;
    used = true;
    image = img;
    if (reduced.matches) { finish(); return; }
    active = true;
    slides.dataset.entrance = 'loading';
    slides.style.opacity = '0';
    load = async () => {
      const expected = image.getAttribute('src');
      try { await image.decode(); } catch { /* load/error remains authoritative */ }
      if (!active || disposed) return;
      if (expected !== image.getAttribute('src')) return;
      if (!image.naturalWidth) { if (image.complete) error(); return; }
      await window.__eaIntroDone;
      if (!active || disposed) return;
      decoded = true;
      slides.dataset.entrance = 'waiting';
      show();
    };
    error = () => {
      if (!active) return;
      image.closest('.ws-slide')?.setAttribute('data-photo-error', '');
      finish();
    };
    image.addEventListener('load', load);
    image.addEventListener('error', error);
    const frame = slides.closest('.ws') || slides;
    const rect = frame.getBoundingClientRect();
    inView = rect.top < innerHeight * .92 && rect.bottom > 0;
    if (!inView && 'IntersectionObserver' in window) {
      observer = new IntersectionObserver(entries => {
        if (entries.some(entry => entry.isIntersecting)) {
          inView = true;
          show();
        }
      }, {threshold: .12});
      observer.observe(frame);
    } else inView = true;
    // decode() also works for an in-flight request and avoids a cached-image flash.
    load();
  }
  const onReduced = () => { if (reduced.matches) finish(); };
  reduced.addEventListener('change', onReduced);
  return {reveal, finish, destroy() { disposed = true; finish(); reduced.removeEventListener('change', onReduced); }};
}
