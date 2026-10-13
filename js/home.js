// ============================================================
// SPOSENCE · Home
// Monta as seções dinâmicas e o motion da página inicial.
// Depende de: data.js, app.js, motion.js. GSAP é opcional (sem ele a página fica estática).
// ============================================================

(function () {
  // ---- Mount compartilhado ----
  document.getElementById('navbar-mount').innerHTML = buildNavbar('index.html');
  document.getElementById('cart-mount').innerHTML = buildCart();
  document.getElementById('toast-mount').innerHTML = buildToastContainer();
  document.getElementById('footer-mount').innerHTML = buildFooter();

  const BRAND_MARK = SP_BRAND_MARK;
  const M = window.SpMotion;
  const REDUCE = M.REDUCE;

  const PRODUCTS = new Map(getAllProducts().map(p => [p.id, p]));
  const price = formatBRL;
  const priceOf = (p) => { const v = spVariant(p); return v ? v.price : (p && p.price) || 0; };
  const productCard = (p) => spCard(p);

  // ---- Card flutuante do hero ----
  const hero = PRODUCTS.get('royal-amber');
  if (hero) {
    document.getElementById('hero-float').innerHTML = `
      <img src="img/hero/sacola-thumb.webp" alt="" width="64" height="64" decoding="async">
      <div>
        <div class="h-hero__float-name">${hero.name}</div>
        <div class="h-hero__float-meta">${(spVariant(hero) || {}).size || hero.volume || ''} | ${price(priceOf(hero))}</div>
      </div>
      <button class="h-add" type="button" data-add="${hero.id}" aria-label="Adicionar ${hero.name} ao carrinho"><i class="ph ph-plus" aria-hidden="true"></i></button>`;
  }

  // ---- Em destaque ----
  const rail = document.getElementById('featured-rail');
  rail.innerHTML = getAllProducts()
    .filter(p => p.featured && p.profile !== 'elegantes')
    .map(productCard).join('');

  const railBtns = document.querySelectorAll('[data-rail]');
  const syncRailBtns = () => {
    const max = rail.scrollWidth - rail.clientWidth - 4;
    railBtns.forEach(b => { b.disabled = Number(b.dataset.dir) < 0 ? rail.scrollLeft <= 4 : rail.scrollLeft >= max; });
  };
  railBtns.forEach(btn => btn.addEventListener('click', () => {
    const card = rail.firstElementChild;
    const step = card ? card.getBoundingClientRect().width + 20 : 300;
    rail.scrollBy({ left: step * Number(btn.dataset.dir), behavior: REDUCE ? 'auto' : 'smooth' });
  }));
  rail.addEventListener('scroll', syncRailBtns, { passive: true });
  window.addEventListener('resize', syncRailBtns);
  syncRailBtns();

  // ---- Cremes corporais ----
  const creams = document.getElementById('creams-grid');
  if (creams) creams.innerHTML = (SPOSENCE_DATA.skincare || [])
    .map(p => spCard({ ...p, category: p.category || 'skincare' }, { sizes: true })).join('');

  // ---- Elegantes ----
  // O primeiro card é o destaque grande da seção
  const ELEGANT_HIGHLIGHT = 'royal-amber';
  document.getElementById('elegant-grid').innerHTML = SPOSENCE_DATA.perfumes
    .filter(p => p.profile === 'elegantes')
    .sort((a, b) => (b.id === ELEGANT_HIGHLIGHT) - (a.id === ELEGANT_HIGHLIGHT))
    .slice(0, 5)
    .map(productCard).join('');

  // ---- Kits de layering ----
  const findIn = (list, id) => (SPOSENCE_DATA[list] || []).find(x => x.id === id);
  const KITS = SPOSENCE_DATA.layering.map((kit, index) => ({
    index,
    kit,
    perfumes: kit.perfume_ids.map(id => findIn('perfumes', id)).filter(Boolean),
    creme: findIn('skincare', kit.skincare_ids[0]),
    splash: [findIn('body_splashes', kit.splash_ids[0])].filter(p => p && !spSoldOut(p))[0] || null,
  }));
  const state = { kit: 0, perfume: 0 };
  const kitsMount = document.getElementById('kits-mount');

  // Uma peça do kit: foto, o que é e um detalhe curto
  // Cada peça leva à página do produto; o detalhe pode trazer links próprios
  const productUrl = (p, size) => `produto.html?id=${p.id}${size ? `&v=${encodeURIComponent(size)}` : ''}`;
  function piece(href, img, type, detail, label) {
    return `
      <div class="h-piece">
        <a href="${href}" class="h-piece__link" aria-label="${label}">
          <div class="h-piece__thumb"><img src="${img || BRAND_MARK}" alt="" loading="lazy" decoding="async"></div>
          <div class="h-piece__type">${type}</div>
        </a>
        <div class="h-piece__detail">${detail}</div>
      </div>`;
  }

  function kitContent(k, perfumeIdx) {
    const perf = k.perfumes[perfumeIdx];
    const perfVar = spVariant(perf);
    const total = priceOf(perf) + priceOf(k.creme) + priceOf(k.splash);
    // cada perfume do kit é um link próprio
    const names = k.perfumes.map(p => `<a href="${productUrl(p)}">${p.name}</a>`);
    const perfumeDetail = names.length > 1 ? `${names.slice(0, -1).join(', ')} ou ${names[names.length - 1]}` : names[0];
    const shortName = (p, prefix) => (p ? p.name.replace(prefix, '').trim() : '');
    const splashDetail = k.splash ? [shortName(k.splash, /^Body Splash\s+/i), k.kit.splash_variant].filter(Boolean).join(' · ') : '';
    return `
      <div><span class="h-chip">${profileLabel(k.kit.tag)}</span></div>
      <div class="h-kit__title">${k.kit.title}</div>
      <p class="h-kit__desc">${k.kit.description}</p>
      <div class="h-pieces">
        ${piece(productUrl(perf), perf.image, `Perfume ${perfVar ? perfVar.size : ''}`, perfumeDetail, `Ver ${perf.name}`)}
        ${k.creme ? piece(productUrl(k.creme), k.creme.image, 'Creme corporal', shortName(k.creme, /^Creme\s+/i), `Ver ${k.creme.name}`) : ''}
        ${k.splash ? piece(productUrl(k.splash, k.kit.splash_variant), k.splash.image, `Body splash ${k.splash.volume || ''}`, splashDetail, `Ver ${k.splash.name}${k.kit.splash_variant ? ' ' + k.kit.splash_variant : ''}`) : ''}
      </div>
      <div class="h-kit__foot">
        <div class="h-kit__total">Total do kit, a partir de<strong>${price(total)}</strong></div>
        <a href="layering.html#kit-${k.index}" class="h-btn h-btn--primary">Montar kit <i class="ph ph-arrow-right" aria-hidden="true"></i></a>
      </div>`;
  }

  kitsMount.innerHTML = `
    <div class="h-tabs" role="tablist" aria-label="Kits de layering">
      ${KITS.map((k, i) => `<button type="button" class="h-tab" role="tab" id="kit-tab-${i}" aria-controls="kit-panel" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}" data-kit="${i}">${k.kit.title.replace(/^Kit\s+/i, '')}</button>`).join('')}
    </div>
    <div class="h-kit" role="tabpanel" id="kit-panel" aria-labelledby="kit-tab-0">
      <div class="h-kit__visual"><img alt="" decoding="async"></div>
      <div class="h-kit__content" aria-live="polite"></div>
    </div>`;

  const kitPanel = kitsMount.querySelector('.h-kit');
  const kitVisual = kitsMount.querySelector('.h-kit__visual img');
  const kitBody = kitsMount.querySelector('.h-kit__content');
  const kitTabs = [...kitsMount.querySelectorAll('.h-tab')];

  function setVisual(src) {
    if (kitVisual.getAttribute('src') === src) return;
    if (REDUCE || !kitVisual.getAttribute('src')) { kitVisual.src = src; return; }
    kitVisual.classList.add('is-out');
    setTimeout(() => {
      kitVisual.src = src;
      const show = () => kitVisual.classList.remove('is-out');
      kitVisual.decode ? kitVisual.decode().then(show, show) : show();
    }, 280);
  }

  // Com GSAP ativo, a troca de kit repete a entrada (cortina + peças); ver MOTION
  let kitSwap = null;
  function renderKit(animate) {
    const k = KITS[state.kit];
    const src = k.perfumes[state.perfume].image || BRAND_MARK;
    const paint = () => {
      kitBody.innerHTML = kitContent(k, state.perfume);
      kitBody.classList.remove('is-swapping');
    };
    kitTabs.forEach((t, i) => { t.setAttribute('aria-selected', i === state.kit); t.tabIndex = i === state.kit ? 0 : -1; });
    kitPanel.setAttribute('aria-labelledby', `kit-tab-${state.kit}`);
    if (animate && kitSwap) { kitSwap(src, paint); return; }
    setVisual(src);
    if (animate && !REDUCE) { kitBody.classList.add('is-swapping'); setTimeout(paint, 260); } else { paint(); }
  }

  kitsMount.addEventListener('click', (e) => {
    const tab = e.target.closest('[data-kit]');
    if (tab) {
      const i = Number(tab.dataset.kit);
      if (i === state.kit) return;
      state.kit = i; state.perfume = 0;
      renderKit(true);
    }
  });
  kitsMount.querySelector('.h-tabs').addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const dir = e.key === 'ArrowRight' ? 1 : -1;
    state.kit = (state.kit + dir + KITS.length) % KITS.length;
    state.perfume = 0;
    renderKit(true);
    kitTabs[state.kit].focus();
  });
  renderKit(false);

  // ---- Perfis olfativos ----
  // Um cartão por perfil: descrição, quantas fragrâncias e uma amostra delas
  const PROFILE_ICONS = { frescos: 'ph-waves', doces: 'ph-cookie', noturnos: 'ph-moon-stars', elegantes: 'ph-sparkle' };
  const sentence = (s) => s.replace(/\s+—\s+(\S)/g, (_, c) => `. ${c.toUpperCase()}`);
  document.getElementById('profiles-grid').innerHTML = SPOSENCE_DATA.fragrance_profiles.map((pr, i) => {
    const list = SPOSENCE_DATA.perfumes.filter(p => p.profile === pr.id);
    const sample = list.slice(0, 3);
    const delay = i > 0 ? `reveal-delay-${i}` : '';
    return `
    <a href="produtos.html?cat=perfumes&profile=${pr.id}" class="h-profile reveal ${delay}">
      <i class="ph ${PROFILE_ICONS[pr.id] || 'ph-drop'} h-profile__icon" aria-hidden="true"></i>
      <span class="h-profile__name">${pr.label}</span>
      <p class="h-profile__desc">${sentence(pr.description)}</p>
      <div class="h-profile__foot">
        <div class="h-profile__thumbs" aria-hidden="true">
          ${sample.map(p => `<img src="${p.image || BRAND_MARK}" alt="" loading="lazy" decoding="async">`).join('')}
        </div>
        <span class="h-profile__count">${list.length} ${list.length === 1 ? 'fragrância' : 'fragrâncias'}</span>
        <span class="h-profile__arrow"><i class="ph ph-arrow-right" aria-hidden="true"></i></span>
      </div>
      <span class="h-profile__names">${sample.map(p => p.name).join(', ')}${list.length > sample.length ? ' e mais' : ''}</span>
    </a>`;
  }).join('');

  // ============================================================
  // MOTION (GSAP)
  // Linguagem única na página inteira: palavras saindo de máscara,
  // fotos abrindo em cortina dentro do quadro arredondado e parallax suave na rolagem.
  // ============================================================
  const root = document.documentElement;
  if (!M.enabled) return;

  const q = (s) => document.querySelector(s);
  const { EASE, CURTAIN_FROM, CURTAIN_TO, onEnter, parallax } = M;

  // ---- HERO ----
  const words = gsap.utils.toArray('.h-hero__title .w > span');
  const intro = gsap.utils.toArray('.h-hero [data-intro]');
  const frame = q('.h-hero__frame');
  const img = q('#hero-img');
  const mark = q('.h-hero__mark');
  const nav = q('#navbar');

  // Estado inicial em linha e libera a classe que escondia o hero
  gsap.set(words, { y: 0, yPercent: 110 });
  gsap.set(intro, { autoAlpha: 0, y: 24 });
  gsap.set(frame, { autoAlpha: 0, y: 30 });
  gsap.set(img, { clipPath: CURTAIN_FROM, scale: 1.28 });
  gsap.set(mark, { autoAlpha: 0, scale: 0.94 });
  if (nav) gsap.set(nav, { autoAlpha: 0, y: -16 });
  root.classList.remove('js-anim');

  // Espera a imagem do hero (no máximo 1,4s) para a cortina não abrir sobre o vazio
  const ready = Promise.all([
    Promise.race([
      img.decode ? img.decode().catch(() => {}) : Promise.resolve(),
      new Promise(r => setTimeout(r, 1400)),
    ]),
    window.spLoaded, // loader da primeira visita
  ]);

  ready.then(() => {
    const tl = gsap.timeline({ defaults: { ease: EASE } });
    tl.to(frame, { autoAlpha: 1, y: 0, duration: 1.1 }, 0)
      .to(img, { clipPath: CURTAIN_TO, duration: 1.5, ease: 'expo.inOut' }, 0.05)
      .to(img, { scale: 1, duration: 2.2 }, 0.15)
      .to(mark, { autoAlpha: 1, scale: 1, duration: 2.2, ease: 'power3.out' }, 0.2)
      .to(words, { yPercent: 0, duration: 1.2, stagger: 0.06 }, 0.35)
      .to(intro, { autoAlpha: 1, y: 0, duration: 1.1, stagger: 0.1 }, 0.75);
    if (nav) tl.to(nav, { autoAlpha: 1, y: 0, duration: 1 }, 0.6);
    tl.add(() => { if (nav) gsap.set(nav, { clearProps: 'transform,opacity,visibility' }); });
  });

  // Rolagem no hero: foto desliza no quadro, símbolo sobe devagar, texto se afasta
  const heroScroll = { trigger: '.h-hero', start: 'top top', end: 'bottom top', scrub: true };
  gsap.to(img, { yPercent: 8, ease: 'none', scrollTrigger: heroScroll });
  gsap.to('.h-hero__mark > span', { yPercent: 14, ease: 'none', scrollTrigger: { ...heroScroll, scrub: 1 } });
  gsap.to('.h-hero__copy', { yPercent: -14, autoAlpha: 0.25, ease: 'none', scrollTrigger: { ...heroScroll, start: 'center center' } });
  gsap.to('#hero-float', { yPercent: -35, ease: 'none', scrollTrigger: heroScroll });

  // ---- SEÇÕES ----

  // Títulos palavra por palavra e textos de apoio subindo logo depois
  M.takeOverReveal();
  M.titles();
  M.supporting(document, ', .h-head__actions, .h-tabs, .h-kits__intro ~ div > .h-link');

  // Linhas (bento): cortina na foto dentro do quadro + parallax
  gsap.utils.toArray('.h-tile').forEach((tile, i) => {
    const pic = tile.querySelector('img');
    gsap.timeline({ scrollTrigger: onEnter(tile, 'top 90%'), delay: (i % 2) * 0.12 })
      .from(pic, { clipPath: CURTAIN_FROM, duration: 1.3, ease: 'expo.inOut' }, 0)
      .from(pic, { scale: 1.3, duration: 1.8, ease: EASE }, 0.1)
      .from(tile.querySelector('.h-tile__body'), { autoAlpha: 0, y: 20, duration: 0.9, ease: EASE }, 0.7);
    parallax(pic, 6);
  });

  // Cards e perfis: entram em sequência; as fotos dos elegantes têm parallax
  M.stagger(q('#featured-rail'));
  M.stagger(q('#elegant-grid'));
  M.stagger(q('#profiles-grid'));

  // Kits: painel sobe, foto abre em cortina, as 3 peças entram uma a uma
  const kitEl = q('.h-kit');
  if (kitEl) {
    gsap.timeline({ scrollTrigger: onEnter(kitEl, 'top 85%') })
      .from(kitEl, { autoAlpha: 0, y: 40, duration: 1, ease: EASE }, 0)
      .from('.h-kit__visual', { clipPath: 'inset(0% 100% 0% 0%)', duration: 1.4, ease: 'expo.inOut' }, 0.1)
      .from('.h-kit__content', { autoAlpha: 0, x: 30, duration: 1.1, ease: EASE }, 0.45)
      .from('.h-kit .h-piece', { autoAlpha: 0, y: 24, duration: 0.9, ease: EASE, stagger: 0.1 }, 0.7);
    parallax(q('.h-kit__visual img'), 5);

    // Trocar de kit: passagem vertical com profundidade. A máscara corre mais rápido
    // que a foto dentro dela (como no parallax da rolagem); texto e peças sobem em
    // sequência. Usa 'y' em px para não brigar com o yPercent do parallax. Cliques rápidos interrompem.
    const kVisual = q('.h-kit__visual');
    const kImg = q('.h-kit__visual img');
    const kBody = q('.h-kit__content');
    let swapTl = null, swapId = 0;
    kitSwap = (src, paint) => {
      if (swapTl) swapTl.kill();
      const id = ++swapId; // só a troca mais recente chega a entrar
      const enter = () => {
        paint();
        const h = kVisual.offsetHeight || 400;
        swapTl = gsap.timeline()
          // a nova foto sobe de baixo; a imagem vem atrasada em relação à máscara
          .fromTo(kVisual, { clipPath: 'inset(100% 0% 0% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: 1.1, ease: 'expo.inOut' }, 0)
          .fromTo(kImg, { y: h * 0.28, scale: 1.12 }, { y: 0, scale: 1, duration: 1.5, ease: EASE }, 0)
          .fromTo(kBody, { autoAlpha: 0, y: 26 }, { autoAlpha: 1, y: 0, duration: 0.9, ease: EASE }, 0.35)
          .from(kBody.querySelectorAll('.h-piece'), { autoAlpha: 0, y: 36, scale: 0.96, duration: 1, ease: EASE, stagger: 0.09 }, 0.55);
      };
      const h = kVisual.offsetHeight || 400;
      swapTl = gsap.timeline()
        // a foto atual é recolhida para cima; a imagem sobe mais devagar que a máscara
        .fromTo(kVisual, { clipPath: 'inset(0% 0% 0% 0%)' }, { clipPath: 'inset(0% 0% 100% 0%)', duration: 0.6, ease: 'power3.in' }, 0)
        .to(kImg, { y: -h * 0.12, duration: 0.6, ease: 'power3.in' }, 0)
        .to(kBody, { autoAlpha: 0, y: -16, duration: 0.4, ease: 'power2.in' }, 0)
        .add(() => {
          // espera a foto nova decodificar para a cortina não abrir sobre o vazio
          kImg.src = src;
          const go = () => { if (id === swapId) enter(); };
          kImg.decode ? kImg.decode().then(go, go) : go();
        });
    };
  }

  // ---- PONTEIRO ----
  M.magnetic();
  if (M.FINE_POINTER) {
    // Profundidade no hero: quadro e símbolo se movem em direções opostas
    const stage = q('.h-hero');
    const fx = gsap.quickTo(frame, 'x', { duration: 0.9, ease: 'power3.out' });
    const fy = gsap.quickTo(frame, 'y', { duration: 0.9, ease: 'power3.out' });
    const mx = gsap.quickTo(mark, 'x', { duration: 1.4, ease: 'power3.out' });
    const my = gsap.quickTo(mark, 'y', { duration: 1.4, ease: 'power3.out' });
    stage.addEventListener('pointermove', (e) => {
      const nx = e.clientX / innerWidth - 0.5;
      const ny = e.clientY / innerHeight - 0.5;
      fx(nx * 14); fy(ny * 10);
      mx(nx * -28); my(ny * -18);
    });
    stage.addEventListener('pointerleave', () => { fx(0); fy(0); mx(0); my(0); });
  }
})();
