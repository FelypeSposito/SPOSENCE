// ============================================================
// SPOSENCE — Global App Logic
// ============================================================

// ---- Cart State ----
const cart = {
  items: [],
  add(product, variant) {
    const key = `${product.id}-${variant?.size || 'fixed'}`;
    const existing = this.items.find(i => i.key === key);
    if (existing) {
      existing.qty++;
    } else {
      this.items.push({
        key,
        productId: product.id,
        name: product.name,
        variant: variant?.size || null,
        price: variant?.price || product.price,
        category: product.category,
        qty: 1,
      });
    }
    this.save();
    this.render();
    showToast(`${product.name} adicionado ao carrinho`);
  },
  remove(key) {
    this.items = this.items.filter(i => i.key !== key);
    this.save();
    this.render();
  },
  total() {
    return this.items.reduce((s, i) => s + i.price * i.qty, 0);
  },
  count() {
    return this.items.reduce((s, i) => s + i.qty, 0);
  },
  save() {
    localStorage.setItem('sposence_cart', JSON.stringify(this.items));
  },
  load() {
    try {
      this.items = JSON.parse(localStorage.getItem('sposence_cart') || '[]');
    } catch (_) { this.items = []; }
  },
  render() {
    const countEl = document.querySelectorAll('.navbar__cart-count');
    countEl.forEach(el => {
      el.textContent = this.count();
      el.style.display = this.count() > 0 ? 'flex' : 'none';
    });

    const body = document.getElementById('cart-body');
    const footer = document.getElementById('cart-footer');
    if (!body) return;

    if (this.items.length === 0) {
      body.innerHTML = `
        <div class="cart-empty">
          <div class="cart-empty__icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
          </div>
          <p class="cart-empty__text">Seu carrinho está vazio.<br>Explore nossas essências.</p>
        </div>`;
      if (footer) footer.style.display = 'none';
      return;
    }

    if (footer) footer.style.display = 'block';
    body.innerHTML = this.items.map(item => `
      <div class="cart-item">
        <div class="cart-item__info">
          <div class="cart-item__name">${item.name}</div>
          <div class="cart-item__variant">${item.variant ? item.variant : item.category} × ${item.qty}</div>
        </div>
        <div class="cart-item__price">R$ ${(item.price * item.qty).toFixed(2).replace('.', ',')}</div>
        <button class="cart-item__remove" onclick="cart.remove('${item.key}')" aria-label="Remover">×</button>
      </div>
    `).join('');

    document.getElementById('cart-total-value').textContent =
      `R$ ${this.total().toFixed(2).replace('.', ',')}`;
  }
};

// ---- Cart Sidebar Toggle ----
function openCart() {
  document.getElementById('cart-overlay').classList.add('open');
  document.getElementById('cart-sidebar').classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeCart() {
  document.getElementById('cart-overlay').classList.remove('open');
  document.getElementById('cart-sidebar').classList.remove('open');
  document.body.style.overflow = '';
}

// ---- Toast ----
let toastTimer;
function showToast(message, icon = '✦') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const el = document.createElement('div');
  el.className = 'toast toast--success';
  el.innerHTML = `<span class="toast__icon">${icon}</span><span class="toast__text">${message}</span>`;
  container.appendChild(el);
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('show')));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 400);
  }, 3000);
}

// ---- Navbar Scroll ----
function initNavbar() {
  const navbar = document.querySelector('.navbar');
  if (!navbar) return;

  const onScroll = () => {
    navbar.classList.toggle('scrolled', window.scrollY > 40);
    const el = document.getElementById('scroll-progress');
    if (el) {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      el.style.width = max > 0 ? `${(window.scrollY / max) * 100}%` : '0%';
    }
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // Cart
  document.querySelectorAll('[data-open-cart]').forEach(btn => btn.addEventListener('click', openCart));
  document.getElementById('cart-overlay')?.addEventListener('click', closeCart);
  document.getElementById('cart-close')?.addEventListener('click', closeCart);

  // Mobile menu toggle
  const burger = document.getElementById('menu-toggle');
  const mobileMenu = document.getElementById('mobile-menu');

  const toggleMobileMenu = () => {
    const isOpen = mobileMenu.classList.toggle('open');
    burger.classList.toggle('is-open', isOpen);
    document.body.style.overflow = isOpen ? 'hidden' : '';
  };

  burger?.addEventListener('click', toggleMobileMenu);
  // Fechar ao clicar em links ou fora do menu (se necessário)
  mobileMenu?.querySelectorAll('a').forEach(a => a.addEventListener('click', () => {
    mobileMenu.classList.remove('open');
    burger.classList.remove('is-open');
    document.body.style.overflow = '';
  }));
}


// ---- Reveal on scroll ----
function initReveal() {
  const els = document.querySelectorAll('.reveal');
  if (!els.length) return;
  const obs = new IntersectionObserver((entries) => {
    entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); obs.unobserve(e.target); } });
  }, { threshold: 0.12 });
  els.forEach(el => obs.observe(el));
}

// ---- Format currency ----
function formatBRL(value) {
  return `R$ ${Number(value).toFixed(2).replace('.', ',')}`;
}

// ---- Profile badge color class ----
function profileClass(profileId) {
  const map = { frescos: 'frescos', doces: 'doces', noturnos: 'noturnos', elegantes: 'elegantes' };
  return map[profileId] || 'gold';
}

// ---- Profile label ----
function profileLabel(profileId) {
  const profile = SPOSENCE_DATA.fragrance_profiles.find(p => p.id === profileId);
  return profile ? profile.label : profileId;
}

// ---- Build Navbar HTML (shared) ----
function buildNavbar(activePage) {
  const pages = [
    { href: 'index.html',    label: 'Início' },
    { href: 'produtos.html', label: 'Perfumes' },
    { href: 'colecoes.html', label: 'Coleções' },
    { href: 'layering.html', label: 'Layering' },
    { href: 'sobre.html',    label: 'Sobre' },
  ];
  return `
  <nav class="navbar" id="navbar">
    <a href="index.html" class="navbar__logo">Sposence</a>
    <ul class="navbar__links">
      ${pages.map(p => `<li><a href="${p.href}" class="${activePage === p.href ? 'active' : ''}">${p.label}</a></li>`).join('')}
    </ul>
    <div class="navbar__actions">
      <button class="navbar__cart" data-open-cart aria-label="Carrinho">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
        <span class="navbar__cart-count" style="display:none">0</span>
      </button>
      <button class="navbar__burger" id="menu-toggle" aria-label="Menu">
        <span></span><span></span><span></span>
      </button>
    </div>
  </nav>
  <div class="mobile-menu" id="mobile-menu">
    <div class="mobile-menu__content">
      <div class="mobile-menu__header" style="margin-bottom: 2rem">
        <div class="navbar__logo">Sposence</div>
      </div>
      <div class="mobile-menu__links">
        ${pages.map((p, i) => `<a href="${p.href}" style="animation-delay: ${0.1 + i * 0.05}s">${p.label}</a>`).join('')}
      </div>
      <div class="mobile-menu__footer">
        <div class="mobile-menu__meta">
          <div class="t-label" style="margin-bottom:0.5rem">Contato</div>
          <p>@sposence.br</p>
          <p>contato@sposence.com.br</p>
        </div>
        <div class="mobile-menu__meta">
          <div class="t-label" style="margin-bottom:0.5rem">Essência</div>
          <p>27% Concentração Pura</p>
          <p>Artesanal · Atemporal</p>
        </div>
      </div>
    </div>
  </div>`;
}

// ---- Build Cart Sidebar (shared) ----
function buildCart() {
  return `
  <div class="cart-overlay" id="cart-overlay"></div>
  <aside class="cart-sidebar" id="cart-sidebar">
    <div class="cart-sidebar__header">
      <h2 class="cart-sidebar__title">Seu Carrinho</h2>
      <button id="cart-close" class="btn--ghost" style="font-size:1.4rem">×</button>
    </div>
    <div class="cart-sidebar__body" id="cart-body">
      <div class="cart-empty">
        <div class="cart-empty__icon">🛒</div>
        <p class="cart-empty__text">Seu carrinho está vazio.<br>Explore nossas essências.</p>
      </div>
    </div>
    <div class="cart-sidebar__footer" id="cart-footer" style="display:none">
      <div class="cart-total">
        <span class="cart-total__label">Total</span>
        <span class="cart-total__value" id="cart-total-value">R$ 0,00</span>
      </div>
      <button class="btn btn--primary btn--full btn--lg" onclick="showToast('Em breve: checkout disponível ✦')">
        Finalizar Pedido
      </button>
      <div class="cart-packaging-note">
        <span class="cart-packaging-note__icon">✦</span>
        Todos os perfumes incluem a&nbsp;<strong>Mini Sacola</strong> de Algodão Cru como brinde de proteção.
      </div>
    </div>
  </aside>`;
}

// ---- Build Footer HTML (shared) ----
function buildFooter() {
  return `
  <footer class="footer">
    <div class="container">
      <div class="footer__top">
        <div>
          <div class="footer__logo">Sposence</div>
          <p class="footer__tagline">Essências artesanais de alta concentração, criadas para pessoas que valorizam autenticidade.</p>
        </div>
        <div>
          <div class="footer__heading">Produtos</div>
          <ul class="footer__links">
            <li><a href="produtos.html">Perfumes</a></li>
            <li><a href="produtos.html?cat=body_splashes">Body Splashes</a></li>
            <li><a href="produtos.html?cat=skincare">Cuidados Corporais</a></li>
            <li><a href="produtos.html?cat=merchandise">Acessórios</a></li>
          </ul>
        </div>
        <div>
          <div class="footer__heading">Explore</div>
          <ul class="footer__links">
            <li><a href="layering.html">Guia de Layering</a></li>
            <li><a href="colecoes.html">Coleções</a></li>
            <li><a href="sobre.html">Sobre Nós</a></li>
          </ul>
        </div>
        <div>
          <div class="footer__heading">Informações</div>
          <ul class="footer__links">
            <li><a href="#">Concentração 27%</a></li>
            <li><a href="#">Base de Insumos</a></li>
            <li><a href="#">Contato</a></li>
          </ul>
        </div>
      </div>
      <div class="footer__bottom">
        <p class="footer__copy">© 2026 Sposence — Essências que contam histórias.</p>
        <p class="footer__copy">Concentração: 27% • Álcool de cereais • Fixador Galaxo</p>
      </div>
    </div>
  </footer>`;
}

// ---- Toast Container (shared) ----
function buildToastContainer() {
  return `<div class="toast-container" id="toast-container"></div>`;
}

// ---- Init Global ----
document.addEventListener('DOMContentLoaded', () => {
  cart.load();
  cart.render();
  initNavbar();
  initReveal();
});
