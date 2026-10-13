// ============================================================
// SPOSENCE · Guia de layering
// Kits prontos no mesmo formato da home: abas, foto grande e a montagem do kit
// (1 perfume + complementos), com total e "adicionar ao carrinho".
// Depende de: data.js, app.js, motion.js. GSAP é opcional (sem ele a troca é direta).
// ============================================================

(function () {
  document.getElementById('navbar-mount').innerHTML = buildNavbar('layering.html');
  document.getElementById('cart-mount').innerHTML = buildCart();
  document.getElementById('toast-mount').innerHTML = buildToastContainer();
  document.getElementById('footer-mount').innerHTML = buildFooter();

  const M = window.SpMotion;
  const byId = (list, id) => (SPOSENCE_DATA[list] || []).find(p => p.id === id);
  // size: fragrância/tamanho definido pelo kit (ex.: body splash Baunilha); sem ele, o primeiro disponível
  const variantOf = (p, size) => (p.variants
    ? (size && p.variants.find(v => v.size === size && !spSoldOut(v))) || p.variants.find(v => !spSoldOut(v)) || p.variants[0]
    : null);
  const priceOf = (p, size) => (variantOf(p, size)?.price ?? p.price) || 0;
  const available = (p) => p && !spSoldOut(p);

  const KITS = SPOSENCE_DATA.layering.map((kit) => ({
    kit,
    perfumes: kit.perfume_ids.map(id => byId('perfumes', id)).filter(available),
    extras: [
      ...kit.skincare_ids.map(id => byId('skincare', id)).filter(available)
        .map(p => ({ p, list: 'skincare', label: 'Creme hidratante', size: kit.skincare_variant })),
      ...kit.splash_ids.map(id => byId('body_splashes', id)).filter(available)
        .map(p => ({ p, list: 'body_splashes', label: `Body splash ${p.volume || ''}`.trim(), size: kit.splash_variant })),
    ],
  }));

  // Estado da montagem: kit aberto, perfume escolhido (-1 = já tenho) e complementos marcados
  const state = { kit: 0, perfume: 0, extras: new Set() };
  const resetPicks = () => {
    state.perfume = KITS[state.kit].perfumes.length ? 0 : -1;
    state.extras = new Set(KITS[state.kit].extras.map((_, i) => i));
  };

  const mount = document.getElementById('kits-mount');
  mount.innerHTML = `
    <div class="h-tabs" role="tablist" aria-label="Kits de layering">
      ${KITS.map((k, i) => `<button type="button" class="h-tab" role="tab" id="lk-tab-${i}" aria-controls="lk-panel" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}" data-kit="${i}">${k.kit.title.replace(/^Kit\s+/i, '')}</button>`).join('')}
    </div>
    <div class="sp-studio" role="tabpanel" id="lk-panel" aria-labelledby="lk-tab-0">
      <div class="sp-studio__visual">
        <img alt="" decoding="async">
        <div class="sp-studio__caption" aria-hidden="true"></div>
      </div>
      <div class="sp-studio__body" aria-live="polite"></div>
    </div>`;

  const panel = mount.querySelector('.sp-studio');
  const visual = mount.querySelector('.sp-studio__visual');
  const visualImg = visual.querySelector('img');
  const caption = visual.querySelector('.sp-studio__caption');
  const body = mount.querySelector('.sp-studio__body');
  const tabs = [...mount.querySelectorAll('.h-tab')];

  const pick = ({ p, label, size, checked, kind, i }) => `
    <button type="button" class="sp-pick" role="${kind === 'perfume' ? 'radio' : 'checkbox'}" aria-checked="${checked}" data-kind="${kind}" data-i="${i}">
      <span class="sp-pick__box" aria-hidden="true"><i class="ph ph-check"></i></span>
      <img src="${spThumb(p.image) || SP_BRAND_MARK}" alt="" loading="lazy" decoding="async">
      <span><span class="sp-pick__name">${p.name}</span><span class="sp-pick__type">${label}${variantOf(p, size) ? ` · ${variantOf(p, size).size}` : ''}</span></span>
      <span class="sp-pick__price">${formatBRL(priceOf(p, size))}</span>
    </button>`;

  function content() {
    const k = KITS[state.kit];
    return `
      <div><span class="h-chip">${profileLabel(k.kit.tag)}</span></div>
      <h3 class="sp-studio__title">${k.kit.title}</h3>
      <p class="sp-studio__desc">${k.kit.description}</p>
      ${k.perfumes.length ? `
      <div class="sp-studio__step">
        <div class="sp-kit__label">1. Escolha o perfume</div>
        <div class="sp-kit__list" role="radiogroup" aria-label="Perfume do kit">
          ${k.perfumes.map((p, i) => pick({ p, label: `Inspirado em ${p.inspired_by}`, checked: state.perfume === i, kind: 'perfume', i })).join('')}
        </div>
        <button type="button" class="sp-studio__skip" data-skip aria-pressed="${state.perfume === -1}">Já tenho meu perfume</button>
      </div>` : ''}
      ${k.extras.length ? `
      <div class="sp-studio__step">
        <div class="sp-kit__label">${k.perfumes.length ? '2. ' : ''}Complementos</div>
        <div class="sp-kit__list">
          ${k.extras.map((x, i) => pick({ ...x, checked: state.extras.has(i), kind: 'extra', i })).join('')}
        </div>
      </div>` : ''}
      <div class="sp-studio__foot">
        <div class="sp-kit__total">Total selecionado<strong data-total>${formatBRL(0)}</strong><span data-hint></span></div>
        <button type="button" class="h-btn h-btn--primary" data-kit-add data-magnetic>Adicionar ao carrinho <i class="ph ph-shopping-bag" aria-hidden="true"></i></button>
      </div>`;
  }

  // Itens marcados agora: o perfume escolhido + os complementos
  function selected() {
    const k = KITS[state.kit];
    const items = [];
    if (state.perfume >= 0 && k.perfumes[state.perfume]) items.push({ p: k.perfumes[state.perfume], list: 'perfumes' });
    k.extras.forEach((x, i) => { if (state.extras.has(i)) items.push(x); });
    return items;
  }

  function syncTotals() {
    const items = selected();
    body.querySelector('[data-total]').textContent = formatBRL(items.reduce((s, x) => s + priceOf(x.p, x.size), 0));
    body.querySelector('[data-hint]').textContent = items.length
      ? `${items.length} ${items.length === 1 ? 'item' : 'itens'}`
      : 'Nenhum item selecionado';
    body.querySelector('[data-kit-add]').disabled = !items.length;
  }

  // Foto do painel: o perfume escolhido (ou o primeiro do kit, se a pessoa já tem perfume)
  function visualFor() {
    const k = KITS[state.kit];
    return k.perfumes[Math.max(state.perfume, 0)] || k.extras[0]?.p || null;
  }
  function setCaption(p) { caption.textContent = p ? p.name : ''; }

  function paint() {
    body.innerHTML = content();
    syncTotals();
  }

  // Troca da foto ao escolher outro perfume (dentro do mesmo kit): esmaece e volta
  function swapPhoto(p) {
    const src = (p && p.image) || SP_BRAND_MARK;
    setCaption(p);
    if (visualImg.getAttribute('src') === src) return;
    if (M.REDUCE || !visualImg.getAttribute('src')) { visualImg.src = src; return; }
    visualImg.classList.add('is-out');
    setTimeout(() => {
      visualImg.src = src;
      const show = () => visualImg.classList.remove('is-out');
      visualImg.decode ? visualImg.decode().then(show, show) : show();
    }, 280);
  }

  // Trocar de kit: com GSAP repete a entrada (cortina + peças); sem, troca direto
  let kitSwap = null;
  function openKit(i, animate) {
    state.kit = i;
    resetPicks();
    tabs.forEach((t, n) => { t.setAttribute('aria-selected', n === i); t.tabIndex = n === i ? 0 : -1; });
    panel.setAttribute('aria-labelledby', `lk-tab-${i}`);
    const p = visualFor();
    if (animate && kitSwap) { kitSwap((p && p.image) || SP_BRAND_MARK, () => { setCaption(p); paint(); }); return; }
    visualImg.src = (p && p.image) || SP_BRAND_MARK;
    setCaption(p);
    paint();
  }

  mount.addEventListener('click', (e) => {
    const tab = e.target.closest('[data-kit]');
    if (tab) {
      const i = Number(tab.dataset.kit);
      if (i !== state.kit) openKit(i, true);
      return;
    }
    const item = e.target.closest('.sp-pick');
    if (item) {
      const i = Number(item.dataset.i);
      if (item.dataset.kind === 'perfume') {
        state.perfume = i;
        body.querySelectorAll('.sp-pick[data-kind="perfume"]').forEach(b => b.setAttribute('aria-checked', Number(b.dataset.i) === i));
        body.querySelector('[data-skip]')?.setAttribute('aria-pressed', 'false');
        swapPhoto(KITS[state.kit].perfumes[i]);
      } else {
        state.extras.has(i) ? state.extras.delete(i) : state.extras.add(i);
        item.setAttribute('aria-checked', state.extras.has(i));
      }
      syncTotals();
      return;
    }
    const skip = e.target.closest('[data-skip]');
    if (skip) {
      // "Já tenho meu perfume": tira o perfume do kit; clicar de novo volta o primeiro
      state.perfume = state.perfume === -1 ? 0 : -1;
      skip.setAttribute('aria-pressed', state.perfume === -1);
      body.querySelectorAll('.sp-pick[data-kind="perfume"]').forEach(b => b.setAttribute('aria-checked', Number(b.dataset.i) === state.perfume));
      if (state.perfume === 0) swapPhoto(KITS[state.kit].perfumes[0]);
      syncTotals();
      return;
    }
    if (e.target.closest('[data-kit-add]')) {
      const items = selected();
      if (!items.length) { showToast('Selecione ao menos um item.'); return; }
      items.forEach(({ p, list, size }) => cart.add({ ...p, category: p.category || list }, variantOf(p, size)));
      openCart();
    }
  });

  // Setas trocam de aba, como na home
  mount.querySelector('.h-tabs').addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const dir = e.key === 'ArrowRight' ? 1 : -1;
    openKit((state.kit + dir + KITS.length) % KITS.length, true);
    tabs[state.kit].focus();
  });

  // Vindo da home com #kit-N: abre esse kit e rola até a seção
  const fromHash = /^#kit-(\d+)$/.exec(location.hash);
  const startKit = fromHash && KITS[Number(fromHash[1])] ? Number(fromHash[1]) : 0;
  openKit(startKit, false);
  if (fromHash) {
    window.addEventListener('load', () => {
      setTimeout(() => document.getElementById('kits').scrollIntoView({ behavior: M.REDUCE ? 'auto' : 'smooth', block: 'start' }), 150);
    });
  }

  M.auto();
  if (!M.enabled) return;

  // ---- MOTION ----
  const { EASE, onEnter, parallax } = M;
  // Entrada: painel sobe, foto abre em cortina, texto e passos entram em sequência
  gsap.timeline({ scrollTrigger: onEnter(panel, 'top 85%') })
    .from(panel, { autoAlpha: 0, y: 40, duration: 1, ease: EASE }, 0)
    .from(visual, { clipPath: 'inset(0% 100% 0% 0%)', duration: 1.4, ease: 'expo.inOut' }, 0.1)
    .from(body, { autoAlpha: 0, x: 30, duration: 1.1, ease: EASE }, 0.45)
    .from(body.querySelectorAll('.sp-studio__step, .sp-studio__foot'), { autoAlpha: 0, y: 24, duration: 0.9, ease: EASE, stagger: 0.1 }, 0.7);
  parallax(visualImg, 5);

  // Troca de kit: a foto sai em cortina, a nova entra com cortina e zoom,
  // texto e passos sobem em sequência. Cliques rápidos interrompem; só a última troca entra.
  let swapTl = null, swapId = 0;
  kitSwap = (src, done) => {
    if (swapTl) swapTl.kill();
    const id = ++swapId;
    const enter = () => {
      done();
      swapTl = gsap.timeline()
        .fromTo(visual, { clipPath: 'inset(0% 100% 0% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: 1.2, ease: 'expo.inOut' }, 0)
        .fromTo(visualImg, { scale: 1.22 }, { scale: 1, duration: 1.6, ease: EASE }, 0)
        .fromTo(body, { autoAlpha: 0, x: 30 }, { autoAlpha: 1, x: 0, duration: 1, ease: EASE }, 0.3)
        .from(body.querySelectorAll('.sp-studio__step, .sp-studio__foot'), { autoAlpha: 0, y: 24, duration: 0.9, ease: EASE, stagger: 0.1 }, 0.55);
      M.magnetic(body);
    };
    swapTl = gsap.timeline()
      .fromTo(visual, { clipPath: 'inset(0% 0% 0% 0%)' }, { clipPath: 'inset(0% 0% 0% 100%)', duration: 0.55, ease: 'expo.in' }, 0)
      .to(body, { autoAlpha: 0, x: -20, duration: 0.35, ease: 'power2.in' }, 0)
      .add(() => {
        // espera a foto nova decodificar para a cortina não abrir sobre o vazio
        visualImg.src = src;
        const go = () => { if (id === swapId) enter(); };
        visualImg.decode ? visualImg.decode().then(go, go) : go();
      });
  };
})();
