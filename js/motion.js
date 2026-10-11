// ============================================================
// SPOSENCE · Motion
// A linguagem de movimento do site, igual em todas as páginas:
// palavras saindo de máscara, fotos abrindo em cortina dentro do quadro
// arredondado, cards entrando em sequência e parallax suave na rolagem.
//
// Depende de GSAP + ScrollTrigger (opcionais). Sem eles, ou com
// reduced-motion, a página fica estática e o .reveal do app.js assume.
//
// Marcações que as páginas usam:
//   .sp-hero               seção de abertura; o <h1> dela entra palavra por palavra
//   [data-intro]           entra logo depois do título do hero
//   [data-intro-media]     quadro de foto do hero: cortina + zoom de saída
//   .h-title               título de seção: palavras sobem ao entrar na tela
//   .h-lead, .h-eyebrow    textos de apoio: sobem logo depois do título
//   [data-reveal]          qualquer bloco que só precisa subir ao entrar
//   [data-stagger]         os filhos entram em sequência (cards, listas)
//   [data-curtain]         quadro com <img>: cortina na entrada + parallax
//   [data-magnetic]        botão puxa levemente o ponteiro
// ============================================================

window.SpMotion = (function () {
  const REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const FINE_POINTER = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const enabled = !REDUCE && !!window.gsap && !!window.ScrollTrigger;
  const root = document.documentElement;

  const EASE = 'expo.out';
  const CURTAIN_FROM = 'inset(100% 0% 0% 0%)';
  const CURTAIN_TO = 'inset(0% 0% 0% 0%)';

  if (!enabled) {
    root.classList.remove('js-anim');
    return { enabled, REDUCE, FINE_POINTER, auto() {}, stagger() {}, refresh() {} };
  }

  gsap.registerPlugin(ScrollTrigger);

  const onEnter = (trigger, start = 'top 85%') => ({ trigger, start, once: true });

  // Parallax: a imagem desliza dentro do quadro enquanto a página rola
  const parallax = (img, amount = 7) => img && gsap.fromTo(img, { yPercent: -amount }, {
    yPercent: amount, ease: 'none',
    scrollTrigger: { trigger: img.parentElement, start: 'top bottom', end: 'bottom top', scrub: true },
  });

  // Quebra o texto em palavras mascaradas, preservando <em>, <strong> e <br>
  function splitWords(el) {
    if (el.classList.contains('h-split')) return el.querySelectorAll('.w > span');
    el.setAttribute('aria-label', el.textContent.replace(/\s+/g, ' ').trim());
    const walk = (node) => {
      [...node.childNodes].forEach((n) => {
        if (n.nodeType === 3) {
          const frag = document.createDocumentFragment();
          n.textContent.split(/(\s+)/).forEach((part) => {
            if (!part) return;
            if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(' ')); return; }
            const w = document.createElement('span'); w.className = 'w'; w.setAttribute('aria-hidden', 'true');
            const inner = document.createElement('span'); inner.textContent = part;
            w.appendChild(inner); frag.appendChild(w);
          });
          n.replaceWith(frag);
        } else if (n.nodeType === 1) {
          walk(n);
        }
      });
    };
    walk(el);
    el.classList.add('h-split');
    return el.querySelectorAll('.w > span');
  }

  // Assume o controle dos elementos que usavam o reveal genérico do app.js
  function takeOverReveal(scope = document) {
    scope.querySelectorAll('main .reveal').forEach((el) => {
      el.className = el.className.replace(/\breveal(-delay-\d)?\b/g, '').trim();
    });
  }

  // Títulos de seção: palavra por palavra
  function titles(scope = document) {
    scope.querySelectorAll('main .h-title').forEach((title) => {
      if (title.closest('.sp-hero') || title.dataset.motion) return;
      title.dataset.motion = '1';
      gsap.from(splitWords(title), { yPercent: 115, duration: 1.15, ease: EASE, stagger: 0.05, scrollTrigger: onEnter(title, 'top 88%') });
    });
  }

  // Textos de apoio e blocos simples: sobem logo depois do título
  function supporting(scope = document, extra = '') {
    const sel = `main section:not(.sp-hero):not(.h-hero) :is(.h-lead, .h-eyebrow${extra}), main [data-reveal]`;
    scope.querySelectorAll(sel).forEach((el) => {
      if (el.dataset.motion) return;
      el.dataset.motion = '1';
      gsap.from(el, { autoAlpha: 0, y: 26, duration: 1, ease: EASE, delay: 0.18, scrollTrigger: onEnter(el, 'top 90%') });
    });
  }

  // Filhos entrando em sequência. `now` anima na hora (conteúdo trocado por filtro).
  function stagger(box, { now = false, items } = {}) {
    if (!box) return;
    const kids = items ? [...box.querySelectorAll(items)] : [...box.children];
    if (!kids.length) return;
    // a transição de hover (transform) brigaria com a entrada; volta ao final
    gsap.set(kids, { transition: 'none' });
    const vars = { autoAlpha: 0, y: now ? 28 : 48, duration: now ? 0.8 : 1.1, ease: EASE, stagger: now ? 0.05 : 0.09, clearProps: 'transform,transition,opacity,visibility' };
    if (!now) vars.scrollTrigger = onEnter(box, 'top 88%');
    gsap.from(kids, vars);
    kids.forEach((k) => { const pic = k.querySelector('.h-card__media > img'); if (pic && !now) parallax(pic, 5); });
  }

  // Quadro de foto: cortina de baixo para cima + zoom saindo, depois parallax
  function curtain(frame, { amount = 6 } = {}) {
    const pic = frame.querySelector('img');
    if (!pic || frame.dataset.motion) return;
    frame.dataset.motion = '1';
    gsap.timeline({ scrollTrigger: onEnter(frame, 'top 90%') })
      .from(pic, { clipPath: CURTAIN_FROM, duration: 1.3, ease: 'expo.inOut' }, 0)
      .from(pic, { scale: 1.3, duration: 1.8, ease: EASE }, 0.1);
    parallax(pic, amount);
  }

  // Botões magnéticos
  function magnetic(scope = document) {
    if (!FINE_POINTER) return;
    scope.querySelectorAll('[data-magnetic]').forEach((el) => {
      if (el.dataset.magnet) return;
      el.dataset.magnet = '1';
      const bx = gsap.quickTo(el, 'x', { duration: 0.5, ease: 'power3.out' });
      const by = gsap.quickTo(el, 'y', { duration: 0.5, ease: 'power3.out' });
      el.addEventListener('pointermove', (e) => {
        const r = el.getBoundingClientRect();
        bx((e.clientX - r.left - r.width / 2) * 0.25);
        by((e.clientY - r.top - r.height / 2) * 0.35);
      });
      el.addEventListener('pointerleave', () => { bx(0); by(0); });
    });
  }

  // Abertura das páginas internas: navbar desce, título sobe palavra por
  // palavra, apoio entra em sequência e a foto do hero abre em cortina.
  function intro() {
    const hero = document.querySelector('.sp-hero');
    const nav = document.querySelector('#navbar');
    if (!hero) { root.classList.remove('js-anim'); return; }

    const words = [...hero.querySelectorAll('h1')].flatMap((h) => [...splitWords(h)]);
    const items = gsap.utils.toArray(hero.querySelectorAll('[data-intro]'));
    const frame = hero.querySelector('[data-intro-media]');
    const pic = frame && frame.querySelector('img');

    gsap.set(words, { yPercent: 110 });
    gsap.set(items, { autoAlpha: 0, y: 24 });
    if (frame) gsap.set(frame, { autoAlpha: 0, y: 30 });
    if (pic) gsap.set(pic, { clipPath: CURTAIN_FROM, scale: 1.28 });
    if (nav) gsap.set(nav, { autoAlpha: 0, y: -16 });
    root.classList.remove('js-anim');

    // Espera a foto (no máximo 1,2s) para a cortina não abrir sobre o vazio,
    // e o loader da primeira visita sair de cena
    const ready = Promise.all([
      pic && pic.decode
        ? Promise.race([pic.decode().catch(() => {}), new Promise((r) => setTimeout(r, 1200))])
        : Promise.resolve(),
      window.spLoaded,
    ]);

    ready.then(() => {
      const tl = gsap.timeline({ defaults: { ease: EASE } });
      if (frame) tl.to(frame, { autoAlpha: 1, y: 0, duration: 1.1 }, 0);
      if (pic) tl.to(pic, { clipPath: CURTAIN_TO, duration: 1.5, ease: 'expo.inOut' }, 0.05).to(pic, { scale: 1, duration: 2.2 }, 0.15);
      tl.to(words, { yPercent: 0, duration: 1.2, stagger: 0.05 }, 0.2)
        .to(items, { autoAlpha: 1, y: 0, duration: 1.1, stagger: 0.1 }, 0.55);
      if (nav) tl.to(nav, { autoAlpha: 1, y: 0, duration: 1 }, 0.4);
      tl.add(() => {
        if (nav) gsap.set(nav, { clearProps: 'transform,opacity,visibility' });
        gsap.set(items, { clearProps: 'transform' });
      });
    });

    // Na rolagem, o texto do hero se afasta e a foto desliza no quadro
    const heroScroll = { trigger: hero, start: 'top top', end: 'bottom top', scrub: true };
    const copy = hero.querySelector('.sp-hero__copy');
    if (copy) gsap.to(copy, { yPercent: -10, autoAlpha: 0.35, ease: 'none', scrollTrigger: { ...heroScroll, start: 'center top' } });
    if (pic) gsap.to(pic, { yPercent: 8, ease: 'none', scrollTrigger: heroScroll });
  }

  // Tudo o que uma página interna precisa, numa chamada
  function auto() {
    takeOverReveal();
    intro();
    titles();
    supporting();
    document.querySelectorAll('main [data-stagger]').forEach((box) => stagger(box));
    document.querySelectorAll('main [data-curtain]').forEach((f) => curtain(f));
    magnetic();
  }

  const refresh = () => ScrollTrigger.refresh();

  return {
    enabled, REDUCE, FINE_POINTER, EASE, CURTAIN_FROM, CURTAIN_TO,
    onEnter, parallax, splitWords, takeOverReveal, titles, supporting,
    stagger, curtain, magnetic, intro, auto, refresh,
  };
})();
