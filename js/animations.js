// ============================================================
// SPOSENCE — Animations Controller
// ============================================================
// Requer: css/animations.css importado antes deste script.
// Uso: adicionar classes sp-reveal, sp-reveal--left,
//      sp-reveal--right, sp-reveal--scale nos elementos HTML.
//      data-delay="1..6" para stagger.
// ============================================================

(function () {
  'use strict';

  /* ----------------------------------------------------------
     1. SCROLL REVEAL — IntersectionObserver
  ---------------------------------------------------------- */
  function initReveal() {
    const elements = document.querySelectorAll('.sp-reveal');
    if (!elements.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            // Para de observar após revelar (one-shot)
            observer.unobserve(entry.target);
          }
        });
      },
      {
        threshold: 0.12,       // 12% do elemento visível dispara
        rootMargin: '0px 0px -40px 0px', // margem inferior para antecipar
      }
    );

    elements.forEach((el) => observer.observe(el));
  }

  /* ----------------------------------------------------------
     2. NAVBAR — shrink ao rolar + active link
  ---------------------------------------------------------- */
  function initNavbar() {
    const navbar = document.querySelector('.navbar');
    if (!navbar) return;

    // Shrink ao scroll
    const onScroll = () => {
      navbar.classList.toggle('scrolled', window.scrollY > 60);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll(); // chama na carga caso já esteja rolado

    // Active link baseado na seção visível
    const sections = document.querySelectorAll('section[id]');
    const links    = document.querySelectorAll('.navbar__links a[href^="#"]');

    if (sections.length && links.length) {
      const sectionObserver = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              const id = entry.target.id;
              links.forEach((a) => {
                a.classList.toggle('active', a.getAttribute('href') === `#${id}`);
              });
            }
          });
        },
        { threshold: 0.4 }
      );
      sections.forEach((s) => sectionObserver.observe(s));
    }
  }

  /* ----------------------------------------------------------
     3. MOBILE BURGER MENU
  ---------------------------------------------------------- */
  function initBurger() {
    const burger   = document.querySelector('.navbar__burger');
    const menu     = document.querySelector('.mobile-menu');
    const closeBtn = document.querySelector('.mobile-menu__close');

    if (!burger || !menu) return;

    function openMenu() {
      menu.classList.add('open');
      burger.classList.add('is-open');
      burger.setAttribute('aria-expanded', 'true');
      document.body.style.overflow = 'hidden';
    }

    function closeMenu() {
      menu.classList.remove('open');
      burger.classList.remove('is-open');
      burger.setAttribute('aria-expanded', 'false');
      document.body.style.overflow = '';
    }

    burger.addEventListener('click', () => {
      menu.classList.contains('open') ? closeMenu() : openMenu();
    });

    if (closeBtn) closeBtn.addEventListener('click', closeMenu);

    // Fecha ao clicar em link do menu
    menu.querySelectorAll('a').forEach((a) => {
      a.addEventListener('click', closeMenu);
    });

    // Fecha ao pressionar Esc
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && menu.classList.contains('open')) closeMenu();
    });
  }

  /* ----------------------------------------------------------
     4. SMOOTH SCROLL — links âncora internos
  ---------------------------------------------------------- */
  function initSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
      anchor.addEventListener('click', (e) => {
        const target = document.querySelector(anchor.getAttribute('href'));
        if (!target) return;
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  }

  /* ----------------------------------------------------------
     5. CART SIDEBAR ANIMATION
  ---------------------------------------------------------- */
  function initCart() {
    const overlay  = document.querySelector('.cart-overlay');
    const sidebar  = document.querySelector('.cart-sidebar');
    const cartBtns = document.querySelectorAll('[data-cart-toggle]');
    const closeBtns = document.querySelectorAll('[data-cart-close]');

    if (!overlay || !sidebar) return;

    function openCart() {
      overlay.classList.add('open');
      sidebar.classList.add('open');
      document.body.style.overflow = 'hidden';
    }

    function closeCart() {
      overlay.classList.remove('open');
      sidebar.classList.remove('open');
      document.body.style.overflow = '';
    }

    cartBtns.forEach((btn) => btn.addEventListener('click', openCart));
    closeBtns.forEach((btn) => btn.addEventListener('click', closeCart));
    overlay.addEventListener('click', closeCart);
  }

  /* ----------------------------------------------------------
     6. PRODUCT CARDS — stagger de entrada quando revelados
  ---------------------------------------------------------- */
  function initCardStagger() {
    // Atribui data-delay automaticamente a cards em grid
    document.querySelectorAll('.grid-3, .grid-4, .grid-2').forEach((grid) => {
      grid.querySelectorAll('.product-card, .profile-card, .layering-card').forEach((card, i) => {
        // Só adiciona sp-reveal se ainda não tiver
        if (!card.classList.contains('sp-reveal')) {
          card.classList.add('sp-reveal');
          card.setAttribute('data-delay', String((i % 6) + 1));
        }
      });
    });
  }

  /* ----------------------------------------------------------
     7. HERO TITLE — animação de entrada na carga
  ---------------------------------------------------------- */
  function initHeroEntrance() {
    const heroTitle = document.querySelector('.hero__title');
    const heroDesc  = document.querySelector('.hero__description');
    const heroCta   = document.querySelector('.hero__cta');
    const heroStats = document.querySelector('.hero__stats');

    [heroTitle, heroDesc, heroCta, heroStats].forEach((el, i) => {
      if (!el) return;
      el.style.opacity = '0';
      el.style.transform = 'translateY(24px)';
      el.style.transition = `opacity 0.7s ease ${i * 0.12}s, transform 0.7s cubic-bezier(0.4,0,0.2,1) ${i * 0.12}s`;

      // Dispara no próximo frame para garantir o estado inicial
      requestAnimationFrame(() => requestAnimationFrame(() => {
        el.style.opacity = '1';
        el.style.transform = 'translateY(0)';
      }));
    });
  }

  /* ----------------------------------------------------------
     8. TOAST HELPER — helper reutilizável
  ---------------------------------------------------------- */
  window.SposenceToast = function showToast(message, icon = '✦') {
    const container = document.querySelector('.toast-container') || (() => {
      const c = document.createElement('div');
      c.className = 'toast-container';
      document.body.appendChild(c);
      return c;
    })();

    const toast = document.createElement('div');
    toast.className = 'toast toast--success';
    toast.innerHTML = `<span class="toast__icon">${icon}</span><span class="toast__text">${message}</span>`;
    container.appendChild(toast);

    requestAnimationFrame(() => requestAnimationFrame(() => toast.classList.add('show')));

    setTimeout(() => {
      toast.classList.remove('show');
      toast.addEventListener('transitionend', () => toast.remove(), { once: true });
    }, 3200);
  };

  /* ----------------------------------------------------------
     INIT
  ---------------------------------------------------------- */
  function init() {
    initCardStagger(); // antes do reveal para aplicar classes
    initReveal();
    initNavbar();
    initBurger();
    initSmoothScroll();
    initCart();
    initHeroEntrance();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
