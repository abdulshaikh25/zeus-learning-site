{
/* Zeus Learning — site engine: routing, transitions, smooth scroll and motion. */
const PAGES = window.ZL_PAGES || {}, TITLES = window.ZL_TITLES || {};
const G = window.gsap, ST = window.ScrollTrigger;
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const fine = matchMedia('(pointer: fine)').matches;
const motion = !!(G && ST) && !reduce;
if (motion) G.registerPlugin(ST);
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

const $ = (s, r = document) => r.querySelector(s);
const view = $('#view'), nav = $('.nav'), pill = $('.pill', nav), blob = $('.blob', pill);
const progress = $('.progress'), curtain = $('.curtain'), loader = $('.loader');
const menu = $('#menu'), menuBtn = $('.menu-btn', nav);
const mouse = { x: innerWidth * .6, y: innerHeight * .4 };

let lenis = null, ctx = null, route = null, busy = false, queued = null, pendingTarget = null;
let glList = [], marquees = [], cleanups = [], heroSet = null, heroCounters = [], lastY = 0, menuOpen = false;

/* ---------------- smooth scroll ---------------- */
if (!reduce && window.Lenis) {
  lenis = new window.Lenis({ lerp: 0.085, smoothWheel: true, wheelMultiplier: 0.95 });
  if (motion) { lenis.on('scroll', ST.update); G.ticker.add(t => lenis.raf(t * 1000)); G.ticker.lagSmoothing(0); }
  else { const raf = t => { lenis.raf(t); requestAnimationFrame(raf); }; requestAnimationFrame(raf); }
}
const curY = () => (lenis ? lenis.scroll : window.scrollY);
function scrollToEl(el, immediate) {
  if (!el) return;
  if (lenis) lenis.scrollTo(el, { offset: -84, immediate: !!immediate, duration: 1.6 });
  else el.scrollIntoView({ behavior: immediate || reduce ? 'auto' : 'smooth' });
}
function toTop() { if (lenis) lenis.scrollTo(0, { immediate: true, force: true }); window.scrollTo(0, 0); }

/* ---------------- scroll-linked chrome ---------------- */
function onScroll(e) {
  const y = curY();
  const max = document.documentElement.scrollHeight - innerHeight;
  progress.style.transform = `scaleX(${max > 0 ? Math.min(1, y / max) : 0})`;
  nav.classList.toggle('solid', y > 40);
  if (!menuOpen) nav.classList.toggle('hide', y > lastY + 2 && y > 320);
  if (y < lastY - 2) nav.classList.remove('hide');
  lastY = y;
  toneCheck();
  const v = e && typeof e.velocity === 'number' ? e.velocity : 0;
  marquees.forEach(m => m.push(v));
}
if (lenis) lenis.on('scroll', onScroll); else addEventListener('scroll', () => onScroll(), { passive: true });

function toneCheck() {
  const els = document.elementsFromPoint(innerWidth / 2, 46);
  for (const el of els) {
    if (el.closest('.nav,.cur,.curtain,.progress,.loader')) continue;
    const s = el.closest('[data-tone]');
    if (s) { if (nav.dataset.tone !== s.dataset.tone) nav.dataset.tone = s.dataset.tone; return; }
  }
}

/* ---------------- nav pill ---------------- */
function placeBlob(a) {
  if (!a || getComputedStyle(pill).display === 'none') { blob.style.opacity = 0; return; }
  blob.style.opacity = 1; blob.style.left = a.offsetLeft + 'px'; blob.style.width = a.offsetWidth + 'px';
}
function activeLink() { return pill.querySelector('a.on'); }
function setActive(r) {
  pill.querySelectorAll('a').forEach(a => {
    const hit = (a.dataset.r || '').split(' ').includes(r);
    a.classList.toggle('on', hit);
    if (hit) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  placeBlob(activeLink());
}
pill.querySelectorAll('a').forEach(a => a.addEventListener('pointerenter', () => placeBlob(a)));
pill.addEventListener('pointerleave', () => placeBlob(activeLink()));
addEventListener('resize', () => placeBlob(activeLink()));

/* ---------------- mobile menu ---------------- */
function openMenu() {
  menuOpen = true; menu.hidden = false; menuBtn.setAttribute('aria-expanded', 'true'); nav.classList.remove('hide');
  if (lenis) lenis.stop();
  if (motion) {
    G.fromTo(menu, { clipPath: 'circle(0% at 92% 3%)' }, { clipPath: 'circle(150% at 92% 3%)', duration: .9, ease: 'expo.inOut' });
    G.fromTo(menu.querySelectorAll('a.m, p'), { yPercent: 120, opacity: 0 }, { yPercent: 0, opacity: 1, stagger: .045, duration: .9, ease: 'expo.out', delay: .25 });
  }
  $('a.m', menu).focus({ preventScroll: true });
}
function closeMenu() {
  if (!menuOpen) return;
  menuOpen = false; menuBtn.setAttribute('aria-expanded', 'false');
  if (lenis) lenis.start();
  const done = () => { menu.hidden = true; };
  if (motion) G.to(menu, { clipPath: 'circle(0% at 92% 3%)', duration: .6, ease: 'expo.inOut', onComplete: done }); else done();
}
menuBtn.addEventListener('click', () => (menuOpen ? closeMenu() : openMenu()));
$('.close', menu).addEventListener('click', () => { closeMenu(); menuBtn.focus(); });
addEventListener('keydown', e => { if (e.key === 'Escape' && menuOpen) { closeMenu(); menuBtn.focus(); } });

/* ---------------- routing ---------------- */
const current = () => { const h = decodeURIComponent(location.hash.slice(1)); return PAGES[h] ? h : 'home'; };
addEventListener('hashchange', () => {
  const r = current();
  if (r !== route) go(r);
  else if (pendingTarget) { scrollToEl(document.getElementById(pendingTarget)); pendingTarget = null; }
});
document.addEventListener('click', e => {
  const a = e.target.closest && e.target.closest('a');
  if (!a) return;
  if (a.dataset.scrollto) {
    e.preventDefault();
    const el = document.getElementById(a.dataset.scrollto);
    if (a.dataset.scrollto === 'view') view.focus({ preventScroll: true });
    scrollToEl(el);
    return;
  }
  const href = a.getAttribute('href') || '';
  const r = href.slice(1);
  if (href.charAt(0) === '#' && PAGES[r]) {
    if (menuOpen) closeMenu();
    pendingTarget = a.dataset.target || null;
    if (r === route) {
      e.preventDefault();
      if (pendingTarget) { scrollToEl(document.getElementById(pendingTarget)); pendingTarget = null; }
      else if (lenis) lenis.scrollTo(0, { duration: 1.6 }); else window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
    }
  }
});

async function go(r, first) {
  if (busy) { queued = r; return; }
  busy = true;
  if (!first && motion) await cover(TITLES[r] || '');
  teardown();
  view.innerHTML = PAGES[r] || '<p style="padding:160px 24px;text-align:center">This page could not be loaded.</p>';
  route = r;
  document.title = r === 'home' ? 'Zeus Learning' : `${TITLES[r]} — Zeus Learning`;
  const page = $('.page', view);
  document.body.style.background = (page && page.dataset.bg) || '#0B0A26';
  setActive(r); nav.classList.remove('hide');
  toTop();
  setup(page);
  toneCheck();
  if (first) { await preload(); await loaderOut(); }
  else if (motion) await uncover();
  intro();
  if (!first) view.focus({ preventScroll: true });
  if (pendingTarget) { const el = document.getElementById(pendingTarget); pendingTarget = null; setTimeout(() => scrollToEl(el), motion ? 700 : 0); }
  busy = false;
  if (queued && queued !== route) { const q = queued; queued = null; go(q); } else queued = null;
}

/* ---------------- curtain & loader ---------------- */
function cover(label) {
  return new Promise(res => {
    const cs = curtain.querySelectorAll('.c'), lbl = $('.lbl span', curtain), tiles = curtain.querySelectorAll('.tiles i');
    lbl.textContent = label;
    G.set(curtain, { visibility: 'visible' });
    G.set(cs, { y: 0, yPercent: 101 }); G.set(lbl, { y: 0, yPercent: 115 }); G.set(tiles, { scale: 0, rotate: -90 });
    const tl = G.timeline({ onComplete: res });
    setTimeout(() => { if (tl.progress() < 1) tl.progress(1); res(); }, 1900);
    tl.to(cs, { yPercent: 0, duration: .6, ease: 'power4.inOut', stagger: .08 })
      .to(tiles, { scale: 1, rotate: 0, duration: .5, ease: 'back.out(2.2)', stagger: .06 }, .5)
      .to(lbl, { yPercent: 0, duration: .7, ease: 'expo.out' }, .55);
  });
}
function uncover() {
  return new Promise(res => {
    const cs = [...curtain.querySelectorAll('.c')].reverse(), lbl = $('.lbl span', curtain), tiles = curtain.querySelectorAll('.tiles i');
    const tl = G.timeline({ onComplete: () => G.set(curtain, { visibility: 'hidden' }) });
    setTimeout(() => { if (tl.progress() < 1) tl.progress(1); res(); }, 2000);
    tl.to(lbl, { yPercent: -115, duration: .5, ease: 'power3.in' }, .05)
      .to(tiles, { scale: 0, rotate: 90, duration: .4, ease: 'power3.in', stagger: .04 }, .05)
      .to(cs, { yPercent: -101, duration: .9, ease: 'expo.inOut', stagger: .07 }, .3)
      .call(res, null, .75);
  });
}
function loaderIn() {
  if (!motion) return;
  G.from(loader.querySelectorAll('.big i'), { scale: 0, rotate: -120, duration: .9, ease: 'back.out(2)', stagger: .12 });
  G.to(loader.querySelectorAll('.big i'), { y: -10, duration: .6, ease: 'sine.inOut', stagger: { each: .12, repeat: -1, yoyo: true }, delay: 1 });
  G.from(loader.querySelectorAll('.word, .pct'), { opacity: 0, y: 14, duration: .9, delay: .45, ease: 'expo.out' });
}
function preload() {
  return new Promise(res => {
    const imgs = [...view.querySelectorAll('section img')].slice(0, 10);
    const pct = $('.pct', loader), shown = { v: 0 };
    let done = 0, finished = false;
    const total = imgs.length + 1;
    const finish = () => { if (!finished) { finished = true; setTimeout(res, 380); } };
    const tick = () => {
      const target = Math.round((done / total) * 100);
      if (G) G.to(shown, { v: target, duration: .45, overwrite: true, onUpdate: () => { pct.textContent = String(Math.round(shown.v)).padStart(3, '0'); } });
      else pct.textContent = String(target).padStart(3, '0');
      if (done >= total) finish();
    };
    const one = () => { done++; tick(); };
    imgs.forEach(im => { if (im.complete) one(); else { im.addEventListener('load', one, { once: true }); im.addEventListener('error', one, { once: true }); } });
    (document.fonts ? document.fonts.ready : Promise.resolve()).then(one, one);
    setTimeout(finish, 3800);
  });
}
function loaderOut() {
  if (!motion) { loader.remove(); return Promise.resolve(); }
  return new Promise(res => {
    G.killTweensOf(loader.querySelectorAll('.big i'));
    setTimeout(() => { loader.remove(); res(); }, 2400);
    G.timeline({ onComplete: () => { loader.remove(); res(); } })
      .to(loader.querySelectorAll('.big i'), { scale: 0, rotate: 90, duration: .5, ease: 'power3.in', stagger: .05 })
      .to(loader.querySelectorAll('.word, .pct'), { opacity: 0, y: -12, duration: .35 }, '<')
      .to(loader, { yPercent: -100, duration: 1.05, ease: 'expo.inOut' }, '-=.1')
      .call(res, null, '-=.6');
  });
}

/* ---------------- helpers ---------------- */
const pickTop = list => { const set = new Set(list); return list.filter(el => { for (let p = el.parentElement; p; p = p.parentElement) if (set.has(p)) return false; return true; }); };
const inMarquee = el => !!el.closest('.zmarq,.zup,.zdown');
const isPill = im => im.style.display === 'inline-block';
const clipOK = w => !!w && w.tagName === 'DIV' && !w.classList.contains('zlift') && getComputedStyle(w).overflow === 'hidden';
const covers = im => im.style.position === 'absolute' && (im.style.inset === '0px' || im.style.inset === '0');

function splitWords(root) {
  if (root.dataset.split === 'done') return [...root.querySelectorAll('.wi')];
  root.dataset.split = 'done';
  const out = [];
  const walk = (node, grad) => {
    [...node.childNodes].forEach(n => {
      if (n.nodeType === 3) {
        if (!n.textContent.trim()) return;
        const frag = document.createDocumentFragment();
        n.textContent.split(/(\s+)/).forEach(part => {
          if (!part) return;
          if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(' ')); return; }
          const w = document.createElement('span'); w.className = 'w';
          const i = document.createElement('span'); i.className = 'wi'; i.textContent = part;
          if (grad) { i.style.backgroundImage = grad; i.style.webkitBackgroundClip = 'text'; i.style.backgroundClip = 'text'; i.style.color = 'transparent'; }
          w.appendChild(i); frag.appendChild(w); out.push(i);
        });
        n.replaceWith(frag);
      } else if (n.nodeType === 1 && n.namespaceURI === 'http://www.w3.org/1999/xhtml' && !/^(IMG|BR|CANVAS)$/.test(n.tagName)) {
        let g = grad;
        const cs = getComputedStyle(n);
        if ((cs.webkitBackgroundClip === 'text' || cs.backgroundClip === 'text') && cs.backgroundImage !== 'none') {
          g = cs.backgroundImage; n.style.background = 'none'; n.style.color = 'inherit';
        }
        walk(n, g);
      }
    });
  };
  walk(root, null);
  return out;
}

/* ---------------- page setup ---------------- */
function teardown() {
  if (ctx) { ctx.revert(); ctx = null; }
  glList.forEach(g => g.destroy()); glList = [];
  cleanups.forEach(f => f()); cleanups = [];
  marquees = []; heroSet = null; heroCounters = [];
}

function setup(page) {
  if (!page) return;
  initGL(page);
  initDemos(page);
  initForms(page);
  if (!motion) return;
  const hero = page.querySelector('section');
  ctx = G.context(() => {
    hscroll(page);
    scrubs(page);
    heroSet = buildHero(hero);
    heroScroll(hero);
    headings(page, hero);
    reveals(page, hero);
    images(page, hero);
    parallax(page);
    counters(page, hero);
    marqueesInit(page);
  }, view);
  refreshOnLoad();
}

function buildHero(hero) {
  if (!hero) return null;
  const h1 = hero.querySelector('h1');
  const words = h1 ? splitWords(h1) : [];
  const bg = [...hero.children].filter(el => el.tagName === 'IMG' || el.tagName === 'CANVAS');
  bg.forEach(el => { el.dataset.op = el.style.opacity || '1'; });
  const bits = pickTop([...hero.querySelectorAll('p, a.zbtn, nav a, .zfloat, form, figure, h2, svg.zspin, .zdrift')]
    .filter(el => !(h1 && h1.contains(el)) && !inMarquee(el) && !bg.includes(el)));
  const photos = [...hero.querySelectorAll('img')].map(im => im.parentElement).filter(w => w !== hero && clipOK(w));
  bits.forEach(b => b.classList.add('mv'));
  if (words.length) G.set(words, { yPercent: 135, rotate: 4 });
  if (bits.length) G.set(bits, { opacity: 0, '--ry': '38px' });
  if (photos.length) G.set(photos, { clipPath: 'inset(100% 0% 0% 0%)' });
  if (bg.length) G.set(bg, { opacity: 0 });
  return { words, bits, photos, bg };
}

function intro() {
  if (!motion || !heroSet || !ctx) return;
  const { words, bits, photos, bg } = heroSet;
  ctx.add(() => {
    const tl = G.timeline({ defaults: { ease: 'expo.out' } });
    if (bg.length) tl.to(bg, { opacity: (i, el) => +el.dataset.op, duration: 1.6, ease: 'power2.out' }, 0);
    if (words.length) tl.to(words, { yPercent: 0, rotate: 0, duration: 1.4, stagger: .065 }, .05);
    if (photos.length) tl.to(photos, { clipPath: 'inset(0% 0% 0% 0%)', duration: 1.6, ease: 'expo.inOut', stagger: .13 }, .05);
    if (bits.length) tl.to(bits, { opacity: 1, '--ry': '0px', duration: 1.2, stagger: Math.min(.055, .7 / bits.length) }, .35);
    heroCounters.forEach(run => tl.call(run, null, .7));
    setTimeout(() => { if (tl.progress() < 1) tl.progress(1); }, 4200);
  });
}

function heroScroll(hero) {
  if (!hero) return;
  const box = [...hero.children].find(el => el.tagName === 'DIV' && el.style.maxWidth);
  if (!box) return;
  box.classList.add('mv');
  G.to(box, { '--py': '-140px', opacity: .15, ease: 'none', scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: true } });
}

function headings(page, hero) {
  page.querySelectorAll('h2, h1').forEach(h => {
    if (hero && hero.contains(h)) return;
    const w = splitWords(h);
    if (w.length) G.from(w, { yPercent: 135, rotate: 4, duration: 1.25, ease: 'expo.out', stagger: .05, scrollTrigger: { trigger: h, start: 'top 88%' } });
  });
}

function reveals(page, hero) {
  const cand = [...page.querySelectorAll('p, h3, li, figure, form, blockquote, address, .zlift, .ztile, a.zbtn, .f-chips, [data-hscroll] > *')]
    .filter(el => !(hero && hero.contains(el)) && !el.closest('h1, h2, [data-scrub]') && !el.matches('[data-scrub]') && !inMarquee(el));
  const list = pickTop(cand);
  list.forEach(el => el.classList.add('mv'));
  G.set(list, { opacity: 0, '--ry': '48px' });
  if (!list.length) return;
  ST.batch(list, {
    start: 'top 94%', once: true, interval: .08, batchMax: 10,
    onEnter: b => G.to(b, { opacity: 1, '--ry': '0px', duration: 1.05, ease: 'expo.out', stagger: Math.min(.07, .45 / b.length), overwrite: true })
  });
}

function images(page, hero) {
  page.querySelectorAll('img').forEach(im => {
    if ((hero && hero.contains(im)) || inMarquee(im) || isPill(im)) return;
    const w = im.parentElement;
    if (!clipOK(w)) return;
    const st = { trigger: w, start: 'top 90%' };
    G.fromTo(w, { clipPath: 'inset(100% 0% 0% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: 1.6, ease: 'expo.inOut', scrollTrigger: st });
    if (!im.classList.contains('zkb') && !im.classList.contains('zimg')) G.from(im, { scale: 1.32, duration: 2, ease: 'expo.out', scrollTrigger: { ...st } });
  });
}

function parallax(page) {
  page.querySelectorAll('img').forEach(im => {
    if (inMarquee(im) || isPill(im)) return;
    const deco = im.getAttribute('alt') === '';
    const fullBleed = !deco && im.parentElement.tagName === 'SECTION' && im.style.position === 'absolute';
    if (!deco && !fullBleed) return;
    const sec = im.closest('section, footer') || im.parentElement;
    const amt = deco ? 80 : 60;
    if (covers(im) || fullBleed) im.style.scale = '1.14';
    im.classList.add('mv');
    G.fromTo(im, { '--py': `-${amt}px` }, { '--py': `${amt}px`, ease: 'none', scrollTrigger: { trigger: sec, start: 'top bottom', end: 'bottom top', scrub: true } });
  });
  page.querySelectorAll('canvas.gl-aurora').forEach(c => {
    c.classList.add('mv'); c.style.scale = '1.14';
    G.fromTo(c, { '--py': '0px' }, { '--py': '140px', ease: 'none', scrollTrigger: { trigger: c.parentElement, start: 'top top', end: 'bottom top', scrub: true } });
  });
}

function scrubs(page) {
  page.querySelectorAll('[data-scrub]').forEach(el => {
    const words = splitWords(el);
    if (!words.length) return;
    const sec = el.closest('section');
    const pin = el.dataset.scrub === 'pin' && innerWidth > 700;
    G.set(words, { opacity: .12 });
    G.to(words, {
      opacity: 1, stagger: .1, ease: 'none',
      scrollTrigger: pin
        ? { trigger: sec, start: () => (sec.offsetHeight > innerHeight ? 'bottom bottom' : 'top top'), end: '+=130%', pin: true, scrub: .6, invalidateOnRefresh: true }
        : { trigger: el, start: 'top 80%', end: 'bottom 42%', scrub: .6 }
    });
  });
}

function hscroll(page) {
  const track = page.querySelector('[data-hscroll]');
  if (!track || innerWidth < 1000) return;
  const sec = track.closest('section');
  const box = track.parentElement; box.style.paddingTop = '100px'; box.style.paddingBottom = '100px';
  track.style.flexWrap = 'nowrap';
  [...track.children].forEach(c => {
    const big = (c.style.flex || '').trim().charAt(0) === '2';
    c.style.flex = `0 0 ${big ? 660 : 410}px`; c.style.minHeight = '450px';
  });
  const dist = () => Math.max(0, track.scrollWidth - track.parentElement.clientWidth + 48);
  const tw = G.to(track, {
    x: () => -dist(), ease: 'none',
    scrollTrigger: { trigger: sec, start: () => (sec.offsetHeight > innerHeight ? 'bottom bottom' : 'top top'), end: () => '+=' + dist(), pin: true, scrub: 1, invalidateOnRefresh: true, anticipatePin: 1 }
  });
  // cards lean into the motion
  [...track.children].forEach((c, i) => {
    G.fromTo(c, { '--py': `${(i % 2 ? 40 : -20)}px` }, { '--py': `${(i % 2 ? -20 : 40)}px`, ease: 'none', scrollTrigger: { trigger: c, containerAnimation: tw, start: 'left right', end: 'right left', scrub: true } });
    c.classList.add('mv');
  });
}

function counters(page, hero) {
  page.querySelectorAll('p').forEach(p => {
    const m = p.textContent.trim().match(/^(\d{1,4})(\+?)$/);
    if (!m) return;
    const n = +m[1], suf = m[2], o = { v: 0 };
    p.textContent = '0' + suf;
    const run = () => G.to(o, { v: n, duration: 2.2, ease: 'power3.out', onUpdate: () => { p.textContent = Math.round(o.v) + suf; } });
    if (hero && hero.contains(p)) heroCounters.push(run);
    else ST.create({ trigger: p, start: 'top 92%', once: true, onEnter: run });
  });
}

function marqueesInit(page) {
  page.querySelectorAll('.zmarq').forEach(m => {
    m.style.animation = 'none';
    let half = m.scrollWidth / 2, x = 0, boost = 0, dir = 1;
    const base = m.querySelector('img') ? .55 : .75;
    const setX = G.quickSetter(m, 'x', 'px');
    const skew = G.quickTo(m, 'skewX', { duration: .6, ease: 'power3' });
    let idle = 0;
    const tick = () => {
      boost *= .93;
      x -= (base + boost) * dir;
      if (x <= -half) x += half; if (x > 0) x -= half;
      setX(x);
    };
    const onR = () => { half = m.scrollWidth / 2; };
    G.ticker.add(tick); addEventListener('resize', onR);
    cleanups.push(() => { G.ticker.remove(tick); removeEventListener('resize', onR); });
    marquees.push({
      push(v) {
        if (Math.abs(v) < .05) return;
        dir = v < 0 ? -1 : 1;
        boost = Math.min(Math.abs(v) * .55, 16);
        skew(G.utils.clamp(-9, 9, -v * .9));
        clearTimeout(idle); idle = setTimeout(() => skew(0), 140);
      }
    });
  });
}

function refreshOnLoad() {
  let t;
  const r = () => { clearTimeout(t); t = setTimeout(() => ST.refresh(), 160); };
  view.querySelectorAll('img').forEach(im => { if (!im.complete) im.addEventListener('load', r, { once: true }); });
  if (document.fonts) document.fonts.ready.then(r);
}

/* ---------------- demos filter & forms ---------------- */
function initDemos(page) {
  const chips = page.querySelectorAll('.f-chip');
  if (!chips.length) return;
  const cards = [...page.querySelectorAll('.demo-card')];
  chips.forEach(ch => ch.addEventListener('click', () => {
    const f = ch.dataset.f, show = c => f === 'All' || c.dataset.group === f;
    chips.forEach(c => c.setAttribute('aria-pressed', String(c === ch)));
    const apply = () => cards.forEach(c => { c.style.display = show(c) ? 'flex' : 'none'; });
    if (!motion) { apply(); return; }
    G.to(cards, { opacity: 0, '--ry': '24px', duration: .28, ease: 'power2.in', overwrite: true, onComplete: () => {
      apply();
      G.fromTo(cards.filter(show), { opacity: 0, '--ry': '40px' }, { opacity: 1, '--ry': '0px', duration: .8, stagger: .07, ease: 'expo.out' });
      ST.refresh();
    } });
  }));
}
function initForms(page) {
  page.querySelectorAll('form.js-form').forEach(f => f.addEventListener('submit', e => {
    e.preventDefault();
    if (!f.reportValidity()) return;
    const ok = f.parentElement.querySelector('.form-ok');
    if (ok) {
      f.style.display = 'none'; ok.hidden = false;
      if (motion) G.from(ok.querySelectorAll('[role=status] > *'), { opacity: 0, y: 26, stagger: .08, duration: .9, ease: 'expo.out' });
      const back = ok.querySelector('[data-reset]');
      if (back) back.addEventListener('click', () => { ok.hidden = true; f.style.display = ''; f.reset(); }, { once: true });
    } else {
      let n = f.querySelector('.form-note');
      if (!n) { n = document.createElement('p'); n.className = 'form-note'; n.setAttribute('role', 'status'); f.appendChild(n); }
      n.textContent = f.dataset.note || 'Thanks.';
    }
  }));
}

/* ---------------- WebGL aurora ---------------- */
const VERT = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';
const FRAG = `precision mediump float;uniform vec2 r;uniform float t;uniform vec2 m;
float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float n(vec2 p){vec2 i=floor(p),f=fract(p);vec2 u=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1.,0.)),u.x),mix(h(i+vec2(0.,1.)),h(i+vec2(1.,1.)),u.x),u.y);}
float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<5;i++){v+=a*n(p);p=p*2.03+vec2(1.7,9.2);a*=.5;}return v;}
void main(){vec2 uv=gl_FragCoord.xy/r;vec2 p=uv;p.x*=r.x/r.y;float tt=t*.055;
vec2 mm=m;mm.x*=r.x/r.y;p+=(p-mm)*.06*exp(-dot(p-mm,p-mm)*2.);
vec2 q=vec2(fbm(p*1.3+tt),fbm(p*1.3-tt+3.1));
vec2 w=vec2(fbm(p*1.15+q*1.7+vec2(1.7,9.2)+tt*1.4),fbm(p*1.15+q*1.7+vec2(8.3,2.8)-tt));
float f=fbm(p*1.05+w*1.9);
vec3 night=vec3(.043,.039,.149),blue=vec3(.24,.36,1.),vio=vec3(.54,.25,.99),rose=vec3(.91,.31,.54),peach=vec3(1.,.72,.56);
vec3 c=mix(night,blue,smoothstep(.28,.78,f));
c=mix(c,vio,smoothstep(.42,.92,w.x)*.85);
c=mix(c,rose,smoothstep(.5,.95,w.y*f*1.7)*.75);
c=mix(c,peach,smoothstep(.78,1.02,f+uv.x*.18)*.6);
float md=length((uv-m)*vec2(r.x/r.y,1.));c+=mix(vio,rose,.4)*.32*exp(-md*md*7.);
c*=.5+.5*smoothstep(1.25,.15,length(uv-vec2(.68,.5)));
c+=(h(gl_FragCoord.xy+fract(t))-.5)*.045;
gl_FragColor=vec4(c,1.);}`;
addEventListener('pointermove', e => { mouse.x = e.clientX; mouse.y = e.clientY; }, { passive: true });

function initGL(page) {
  page.querySelectorAll('img[src$="aurora_loop.webp"]').forEach(im => {
    if (isPill(im) || im.parentElement.tagName !== 'SECTION') return;
    const g = makeAurora(im);
    if (g) glList.push(g);
  });
}
function makeAurora(img) {
  const c = document.createElement('canvas');
  c.className = 'gl-aurora'; c.setAttribute('aria-hidden', 'true');
  c.setAttribute('style', img.getAttribute('style') || '');
  const gl = c.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'low-power' });
  if (!gl) return null;
  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null; };
  const vs = sh(gl.VERTEX_SHADER, VERT), fs = sh(gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) return null;
  const pr = gl.createProgram(); gl.attachShader(pr, vs); gl.attachShader(pr, fs); gl.linkProgram(pr);
  if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) return null;
  gl.useProgram(pr);
  const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(pr, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const uR = gl.getUniformLocation(pr, 'r'), uT = gl.getUniformLocation(pr, 't'), uM = gl.getUniformLocation(pr, 'm');
  img.replaceWith(c);
  const sm = { x: .65, y: .5 };
  let raf = 0, on = true, start = performance.now() - 20000;
  const size = () => { const s = Math.min(.55, 900 / Math.max(1, c.clientWidth)); c.width = Math.max(2, Math.round(c.clientWidth * s)); c.height = Math.max(2, Math.round(c.clientHeight * s)); gl.viewport(0, 0, c.width, c.height); };
  const frame = now => {
    const b = c.getBoundingClientRect();
    const tx = (mouse.x - b.left) / Math.max(1, b.width), ty = 1 - (mouse.y - b.top) / Math.max(1, b.height);
    sm.x += (tx - sm.x) * .04; sm.y += (ty - sm.y) * .04;
    gl.uniform2f(uR, c.width, c.height); gl.uniform1f(uT, (now - start) / 1000); gl.uniform2f(uM, sm.x, sm.y);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (on && !reduce) raf = requestAnimationFrame(frame);
  };
  const ro = new ResizeObserver(() => { size(); if (reduce) frame(performance.now()); }); ro.observe(c);
  const io = new IntersectionObserver(([en]) => { on = en.isIntersecting; cancelAnimationFrame(raf); if (on) raf = requestAnimationFrame(frame); }); io.observe(c);
  return { destroy() { cancelAnimationFrame(raf); on = false; ro.disconnect(); io.disconnect(); const ext = gl.getExtension('WEBGL_lose_context'); if (ext) ext.loseContext(); } };
}

/* ---------------- cursor, magnetic, tilt ---------------- */
if (fine && motion) {
  document.documentElement.classList.add('has-cursor');
  const ring = $('.cur.ring'), dot = $('.cur.dot');
  const rx = G.quickTo(ring, 'x', { duration: .55, ease: 'power3' }), ry = G.quickTo(ring, 'y', { duration: .55, ease: 'power3' });
  const dx = G.quickTo(dot, 'x', { duration: .1 }), dy = G.quickTo(dot, 'y', { duration: .1 });
  let magEl = null, tiltEl = null;
  addEventListener('pointermove', e => {
    ring.classList.remove('off'); dot.classList.remove('off');
    rx(e.clientX); ry(e.clientY); dx(e.clientX); dy(e.clientY);
    const t = e.target.closest ? e.target : null;
    const field = t && t.closest('input, textarea');
    const hot = t && t.closest('a, button, label, .zlift');
    ring.classList.toggle('text', !!field);
    ring.classList.toggle('big', !field && !!hot);
    // magnetic buttons
    const mg = t && t.closest('.zbtn, .mag, .f-chip, .menu-btn');
    if (mg !== magEl) {
      if (magEl) G.to(magEl, { '--mx': '0px', '--my': '0px', duration: .9, ease: 'elastic.out(1, .4)' });
      magEl = mg; if (mg) mg.classList.add('mag');
    }
    if (mg) { const r = mg.getBoundingClientRect(); G.to(mg, { '--mx': (e.clientX - r.left - r.width / 2) * .28 + 'px', '--my': (e.clientY - r.top - r.height / 2) * .34 + 'px', duration: .5, ease: 'power3.out' }); }
    // 3D tilt
    const tl = t && t.closest('.zlift');
    if (tl !== tiltEl) { if (tiltEl) { tiltEl.style.setProperty('--tx', '0deg'); tiltEl.style.setProperty('--ty', '0deg'); } tiltEl = tl; }
    if (tl) { const r = tl.getBoundingClientRect(); tl.style.setProperty('--ty', ((e.clientX - r.left) / r.width - .5) * 7 + 'deg'); tl.style.setProperty('--tx', (.5 - (e.clientY - r.top) / r.height) * 7 + 'deg'); }
  }, { passive: true });
  document.addEventListener('pointerleave', () => { ring.classList.add('off'); dot.classList.add('off'); });
  addEventListener('pointerdown', () => G.to(ring, { scale: .8, duration: .15, yoyo: true, repeat: 1 }));
}

/* ---------------- start ---------------- */
if (!Object.keys(PAGES).length) { view.innerHTML = '<p style="padding:160px 24px;text-align:center">The site content failed to load.</p>'; loader.remove(); }
else { loaderIn(); go(current(), true); }
if (document.fonts) document.fonts.ready.then(() => placeBlob(activeLink()));
}
