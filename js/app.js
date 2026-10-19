// ============================================================
// SPOSENCE — Global App Logic
// ============================================================

// ---- Cart State ----
const cart = {
  items: [],
  add(product, variant) {
    const key = `${product.id}-${variant?.size || 'fixed'}`;
    const existing = this.items.find(i => i.key === key);
    // Últimas unidades: não deixa passar do que resta em estoque
    if (variant && typeof variant.stock === 'number' && (existing ? existing.qty : 0) >= variant.stock) {
      showToast(variant.stock
        ? `Só ${variant.stock === 1 ? 'resta 1 unidade' : `restam ${variant.stock} unidades`} de ${product.name} ${variant.size}.`
        : `${product.name} ${variant.size} esgotou.`);
      return false;
    }
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
    return true;
  },
  remove(key) {
    this.items = this.items.filter(i => i.key !== key);
    this.save();
    this.render();
  },
  // Remove com animação: o item desliza para fora, o espaço dele se fecha
  // e os de baixo sobem. Os outros itens não são redesenhados (não piscam).
  removeAnimated(btn, key) {
    const el = btn.closest('.cart-item');
    if (!el || el.dataset.removing) return;
    el.dataset.removing = '1';
    this.items = this.items.filter(i => i.key !== key);
    this.save();
    this.renderBadge();
    this.renderTotal(true);

    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const cs = getComputedStyle(el);
    const gap = parseFloat(getComputedStyle(el.parentElement).rowGap) || 0;
    // o vão do flex entre itens também precisa fechar junto
    const absorb = el.nextElementSibling ? 'marginBottom' : el.previousElementSibling ? 'marginTop' : null;
    const open = { height: `${el.offsetHeight}px`, paddingTop: cs.paddingTop, paddingBottom: cs.paddingBottom, marginTop: '0px', marginBottom: '0px' };
    const shut = { height: '0px', paddingTop: '0px', paddingBottom: '0px', marginTop: '0px', marginBottom: '0px' };
    if (absorb) shut[absorb] = `${-gap}px`;
    el.style.overflow = 'hidden';
    el.style.pointerEvents = 'none';

    const anim = reduce
      ? el.animate([{ opacity: 1, ...open }, { opacity: 0, ...shut }], { duration: 160, fill: 'forwards' })
      : el.animate([
          { opacity: 1, transform: 'translateX(0) scale(1)', ...open, easing: 'cubic-bezier(0.4, 0, 1, 1)' },
          { offset: 0.42, opacity: 0, transform: 'translateX(36px) scale(0.97)', ...open, easing: 'cubic-bezier(0.32, 0.72, 0, 1)' },
          { opacity: 0, transform: 'translateX(36px) scale(0.97)', ...shut },
        ], { duration: 520, fill: 'forwards' });
    const done = () => {
      el.remove();
      if (!this.items.length) this.render();
    };
    anim.finished.then(done, done);
  },
  total() {
    return this.items.reduce((s, i) => s + i.price * i.qty, 0);
  },
  count() {
    return this.items.reduce((s, i) => s + i.qty, 0);
  },
  save() {
    localStorage.setItem('sposence_cart', JSON.stringify(this.items));
    this.syncConta();
  },
  // quem está logada na conta: o carrinho ajuda a Sposence a entender o gosto (só perfumes, sem dados de pagamento)
  syncConta() {
    try {
      if (localStorage.getItem('sp_conta_on') !== '1') return;
      clearTimeout(this._sync);
      this._sync = setTimeout(() => {
        const ids = [...new Set(this.items.filter(i => i.category === 'perfumes').map(i => i.productId))];
        fetch('/api/conta', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ acao: 'salvar', carrinho: ids }) })
          .then(r => { if (r.status === 401) localStorage.removeItem('sp_conta_on'); }).catch(() => {});
      }, 1500);
    } catch (_) {}
  },
  load() {
    try {
      this.items = JSON.parse(localStorage.getItem('sposence_cart') || '[]');
    } catch (_) { this.items = []; }
    // usa sempre o preço atual do catálogo, não o do dia em que o item entrou no carrinho
    const all = getAllProducts();
    // itens que esgotaram depois de entrar no carrinho saem dele
    this.items = this.items.filter(item => {
      const p = all.find(x => x.id === item.productId);
      const v = p && p.variants ? p.variants.find(x => x.size === item.variant) : null;
      return p && !spSoldOut(p) && !spSoldOut(v);
    });
    this.items.forEach(item => {
      const p = all.find(x => x.id === item.productId);
      const v = p && p.variants ? p.variants.find(x => x.size === item.variant) : null;
      const price = v ? v.price : p && p.price;
      if (typeof price === 'number') item.price = price;
    });
  },
  // Total: com animate, o valor rola do antigo para o novo
  renderTotal(animate = false) {
    const el = document.getElementById('cart-total-value');
    if (!el) return;
    const fmt = (v) => `R$ ${v.toFixed(2).replace('.', ',')}`;
    const to = this.total();
    const from = typeof this._shownTotal === 'number' ? this._shownTotal : to;
    this._shownTotal = to;
    cancelAnimationFrame(this._totalRaf);
    if (!animate || from === to || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      el.textContent = fmt(to);
      return;
    }
    const t0 = performance.now(), dur = 480;
    const step = (now) => {
      const k = Math.min((now - t0) / dur, 1);
      el.textContent = fmt(from + (to - from) * (1 - Math.pow(1 - k, 3)));
      if (k < 1) this._totalRaf = requestAnimationFrame(step);
    };
    this._totalRaf = requestAnimationFrame(step);
  },
  render() {
    this.renderBadge();
    this.renderBody();
  },
  renderBadge() {
    const countEl = document.querySelectorAll('.navbar__cart-count');
    countEl.forEach(el => {
      const oldCount = parseInt(el.textContent) || 0;
      const newCount = this.count();
      el.textContent = newCount;
      el.style.display = newCount > 0 ? 'flex' : 'none';

      if (oldCount !== newCount) {
        const cartBtn = el.closest('.navbar__cart');
        if (cartBtn) {
          cartBtn.classList.remove('cart-bump');
          void cartBtn.offsetWidth; // Trigger reflow
          cartBtn.classList.add('cart-bump');
        }
      }
    });
  },
  renderBody() {
    const body = document.getElementById('cart-body');
    const footer = document.getElementById('cart-footer');
    if (!body) return;

    if (this.items.length === 0) {
      body.innerHTML = `
        <div class="cart-empty">
          <div class="cart-empty__icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
          </div>
          <p class="cart-empty__text">Seu carrinho está vazio.</p>
          <a href="produtos.html" class="btn btn--primary btn--sm" style="margin-top:1rem" onclick="closeCart()">Explorar Fragrâncias</a>
        </div>`;
      if (footer) footer.style.display = 'none';
      return;
    }

    if (footer) footer.style.display = 'block';
    // Cada item leva de volta à página do produto (foto, nome e botão)
    body.innerHTML = this.items.map(item => {
      const product = spFindProduct(item.productId);
      const url = `produto.html?id=${item.productId}`;
      return `
      <div class="cart-item" data-key="${item.key}">
        <a href="${url}" class="cart-item__thumb" tabindex="-1" aria-hidden="true">
          <img src="${(product && spThumb(product.image)) || SP_BRAND_MARK}" alt="" loading="lazy" decoding="async">
        </a>
        <div class="cart-item__info">
          <a href="${url}" class="cart-item__name">${item.name}</a>
          <div class="cart-item__variant">${item.variant ? item.variant : item.category} × ${item.qty}</div>
          <a href="${url}" class="cart-item__link">Ver produto <i class="ph ph-arrow-right" aria-hidden="true"></i></a>
        </div>
        <div class="cart-item__price">R$ ${(item.price * item.qty).toFixed(2).replace('.', ',')}</div>
        <button class="cart-item__remove" onclick="cart.removeAnimated(this, '${item.key}')" aria-label="Remover ${item.name}">×</button>
      </div>`;
    }).join('');

    this.renderTotal();
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

// ---- Checkout Modal & Logic ----
function closeCheckout() {
  document.getElementById('checkout-modal').classList.remove('open');
  document.body.style.overflow = '';
}

// EmailJS só é baixado quando alguém abre o checkout
let emailJSPromise = null;
function loadEmailJS() {
  if (typeof emailjs !== 'undefined') return Promise.resolve();
  if (!emailJSPromise) {
    emailJSPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = "https://cdn.jsdelivr.net/npm/@emailjs/browser@3/dist/email.min.js";
      script.onload = resolve;
      script.onerror = () => { emailJSPromise = null; reject(); };
      document.head.appendChild(script);
    });
  }
  return emailJSPromise;
}

// Inicia as máscaras quando o modal abre
function openCheckout() {
  loadEmailJS().catch(() => {});
  if (cart.items.length === 0) return;
  closeCart();
  document.getElementById('checkout-modal').classList.add('open');
  document.body.style.overflow = 'hidden';
  initCheckoutHelpers(); // Inicializa máscaras e API de CEP
}

async function processCheckout(e) {
  e.preventDefault();
  const btn = document.getElementById('ck-submit');
  const originalText = btn.textContent;
  
  btn.textContent = "Processando...";
  btn.disabled = true;

  try {
    const val = (id) => (document.getElementById(id)?.value || '').trim();
    const name = val('ck-name');
    const phone = val('ck-phone');
    const email = val('ck-email');
    const cpf = val('ck-cpf');
    const cep = val('ck-cep');
    const address = val('ck-address');
    const number = val('ck-number');
    const comp = val('ck-comp');
    const deliveryMethod = document.querySelector('input[name="ck-delivery"]:checked')?.value || 'pickup';

    // Só o essencial é obrigatório: nome, WhatsApp e, para entrega, CEP + número
    const missing = [];
    if (!name) missing.push(['ck-name', 'seu nome']);
    if (phone.replace(/\D/g, '').length < 10) missing.push(['ck-phone', 'um WhatsApp com DDD']);
    if (deliveryMethod === 'shipping') {
      if (cep.replace(/\D/g, '').length !== 8) missing.push(['ck-cep', 'o CEP']);
      if (!number) missing.push(['ck-number', 'o número']);
      if (!isValidCPF(cpf)) missing.push(['ck-cpf', 'um CPF válido']);
    }
    if (missing.length) {
      showCheckoutError(`Falta preencher ${missing.map(m => m[1]).join(', ').replace(/, ([^,]*)$/, ' e $1')}.`, missing.map(m => m[0]));
      return;
    }
    showCheckoutError('');

    let fullAddress = "Retirada presencial (a combinar)";
    if (deliveryMethod === 'shipping') {
      fullAddress = `${address || 'Endereço a confirmar'}, Nº ${number}${comp ? ' (' + comp + ')' : ''} - CEP: ${cep}`;
    }
    // Formatar itens do carrinho
    let orderDetails = "ITENS DO PEDIDO:\n\n";
    cart.items.forEach(item => {
      orderDetails += `- ${item.qty}x ${item.name} (${item.variant ? item.variant : item.category}) | R$ ${(item.price * item.qty).toFixed(2).replace('.', ',')}\n`;
    });
    orderDetails += `\nTOTAL: R$ ${cart.total().toFixed(2).replace('.', ',')}`;

    // 1. Abrir WhatsApp
    const myPhone = "5511933175390";
    let waText = `Olá Sposence! Acabei de fazer um pedido no site e estou aguardando a confirmação do PIX:\n\n`;
    waText += `*DADOS DO CLIENTE*\nNome: ${name}\nWhatsApp: ${phone}\nRecebimento: ${fullAddress}${deliveryMethod === 'shipping' ? `\nCPF: ${cpf}` : ''}\n\n`;
    waText += `*${orderDetails}*`;
    
    // Extrai apenas os números do telefone preenchido
    let cleanPhone = phone.replace(/\D/g, '');
    // Se não tiver o 55 (DDI do Brasil), adiciona
    if (!cleanPhone.startsWith('55') && cleanPhone.length >= 10) {
      cleanPhone = '55' + cleanPhone;
    }
    
    const waUrl = `https://api.whatsapp.com/send?phone=${myPhone}&text=${encodeURIComponent(waText)}`;
    window.open(waUrl, '_blank');

    // 2. Enviar E-mails via EmailJS
    const emailParams = {
      to_name: "Sposence",
      from_name: name,
      reply_to: email,
      phone: cleanPhone, // Agora envia o número limpo para o link do botão no email
      cpf: deliveryMethod === 'shipping' ? cpf : 'não se aplica (retirada)',
      address: fullAddress,
      order_details: orderDetails,
      payment_status: "Aguardando Pagamento" 
    };

    // Sem await antes do window.open acima, para o navegador não bloquear o WhatsApp
    loadEmailJS()
      .then(() => Promise.all([
        emailjs.send("service_0pef7hl", "template_9fbieif", emailParams, "vuRyyPfZQpHshbobj"),
        emailjs.send("service_0pef7hl", "template_098jyr3", emailParams, "vuRyyPfZQpHshbobj")
      ]))
      .catch(err => console.error("Erro no EmailJS:", err));

    // 3. Gerar PIX
    const pixCode = generatePix(cart.total(), "e45ca6dd-c219-45cf-ae50-8ae7bc318cae", "SPOSENCE", "SAO PAULO");
    
    // 4. Mostrar tela de sucesso com PIX (Isso remove o formulário do HTML)
    showPixStep(pixCode);

    // 5. Limpar carrinho
    cart.items = [];
    cart.save();
    cart.render();
    showToast("Pedido enviado! Gere o pagamento abaixo. ✦");

  } catch (err) {
    alert("Erro: " + err.message);
  } finally {
    btn.textContent = originalText;
    btn.disabled = false;
  }
}

/**
 * Gera o payload do PIX Estático (BR Code)
 */
function generatePix(amount, key, name, city) {
  const formatAmount = amount.toFixed(2);
  
  // Tag 26: Merchant Account Information
  const gui = "0014br.gov.bcb.pix";
  const keyTag = "01" + key.length.toString().padStart(2, '0') + key;
  const merchantInfo = gui + keyTag;
  
  const payloadChunks = [
    "000201", // Payload Format Indicator
    "26" + merchantInfo.length.toString().padStart(2, '0') + merchantInfo,
    "52040000", // Merchant Category Code
    "5303986",  // Currency (BRL)
    "54" + formatAmount.length.toString().padStart(2, '0') + formatAmount,
    "5802BR",   // Country Code
    "59" + name.length.toString().padStart(2, '0') + name,
    "60" + city.length.toString().padStart(2, '0') + city,
    "62070503***", // Additional Data (TXID fixo)
    "6304"      // CRC16 Checksum (início)
  ];

  const payload = payloadChunks.join('');
  return payload + crc16(payload);
}

/**
 * Cálculo de CRC16 para o PIX
 */
function crc16(str) {
  let crc = 0xFFFF;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) crc = (crc << 1) ^ 0x1021;
      else crc <<= 1;
    }
  }
  return (crc & 0xFFFF).toString(16).toUpperCase().padStart(4, '0');
}

/**
 * Mostra o código PIX no modal
 */
function showPixStep(code) {
  const content = document.querySelector('.checkout-modal__content');
  const originalHTML = content.innerHTML;

  content.innerHTML = `
    <div class="checkout-success">
      <div class="checkout-success__header">
        <div class="checkout-success__icon">✦</div>
        <h3 class="checkout-modal__title">Pedido Recebido!</h3>
        <p>Agora basta realizar o pagamento via PIX para confirmarmos sua essência.</p>
      </div>
      
      <div class="pix-box">
        <label class="form-label" style="text-align: center; display: block; margin-bottom: 1rem;">Copia e Cola</label>
        <textarea class="pix-box__code" readonly>${code}</textarea>
        <button class="h-btn h-btn--primary" id="btn-copy-pix">Copiar Código PIX</button>
      </div>

      <div class="checkout-success__info">
        <p><strong>Total:</strong> R$ ${cart.total().toFixed(2).replace('.', ',')}</p>
        <p style="font-size: 0.85rem; opacity: 0.8; margin-top: 0.5rem;">Após copiar, abra o app do seu banco e escolha "Pix Copia e Cola".</p>
      </div>

      <div class="checkout-modal__actions">
        <button class="h-btn h-btn--ghost" onclick="location.reload()">Concluir e Voltar ao Início</button>
      </div>
    </div>
  `;

  document.getElementById('btn-copy-pix').addEventListener('click', (e) => {
    navigator.clipboard.writeText(code);
    e.target.textContent = "Copiado! ✓";
    setTimeout(() => e.target.textContent = "Copiar Código PIX", 2000);
  });
}

// ---- CPF: confere os dois dígitos verificadores ----
function isValidCPF(value) {
  const d = (value || '').replace(/\D/g, '');
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const check = (len) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(d[i]) * (len + 1 - i);
    const r = (sum * 10) % 11;
    return (r === 10 ? 0 : r) === Number(d[len]);
  };
  return check(9) && check(10);
}

// ---- Erros do checkout ----
function showCheckoutError(msg, ids = []) {
  const box = document.getElementById('ck-error');
  document.querySelectorAll('#checkout-form [aria-invalid]').forEach(el => el.removeAttribute('aria-invalid'));
  if (!box) return;
  box.hidden = !msg;
  box.textContent = msg;
  ids.forEach(id => document.getElementById(id)?.setAttribute('aria-invalid', 'true'));
  if (ids[0]) document.getElementById(ids[0])?.focus();
}

// ---- Resumo, máscaras e API de CEP (liga uma vez só) ----
function renderCheckoutSummary() {
  const box = document.getElementById('ck-summary');
  if (!box) return;
  const count = cart.items.reduce((n, i) => n + i.qty, 0);
  box.innerHTML = `
    <div class="ck-summary__items">${cart.items.map(i => `<span>${i.qty}x ${i.name}${i.variant ? ' · ' + i.variant : ''}</span>`).join('')}</div>
    <div class="ck-summary__total"><span>${count} ${count === 1 ? 'item' : 'itens'}</span><strong>${formatBRL(cart.total())}</strong></div>`;
}

function initCheckoutHelpers() {
  renderCheckoutSummary();
  const form = document.getElementById('checkout-form');
  if (!form || form.dataset.ready) return;
  form.dataset.ready = '1';

  const cpfInput = document.getElementById('ck-cpf');
  const phoneInput = document.getElementById('ck-phone');
  const cepInput = document.getElementById('ck-cep');
  const addressInput = document.getElementById('ck-address');
  const addressFields = document.getElementById('address-fields');

  form.querySelectorAll('input[name="ck-delivery"]').forEach(r => r.addEventListener('change', () => {
    addressFields.hidden = r.value !== 'shipping' || !r.checked;
    if (!addressFields.hidden) cepInput.focus();
  }));
  form.addEventListener('input', (e) => e.target.removeAttribute('aria-invalid'));

  cpfInput.addEventListener('input', (e) => {
    let v = e.target.value.replace(/\D/g, '').slice(0, 11);
    v = v.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
    e.target.value = v;
  });

  phoneInput.addEventListener('input', (e) => {
    let v = e.target.value.replace(/\D/g, '').slice(0, 11);
    v = v.replace(/^(\d{2})(\d)/g, '($1) $2').replace(/(\d{5})(\d)/, '$1-$2');
    e.target.value = v;
  });

  cepInput.addEventListener('input', async (e) => {
    let v = e.target.value.replace(/\D/g, '').slice(0, 8);
    e.target.value = v.replace(/^(\d{5})(\d)/, '$1-$2');
    if (v.length !== 8) return;
    addressInput.placeholder = 'Buscando endereço...';
    try {
      const data = await (await fetch(`https://viacep.com.br/ws/${v}/json/`)).json();
      if (data.erro) throw new Error();
      addressInput.value = [data.logradouro, data.bairro].filter(Boolean).join(', ') + ` - ${data.localidade}/${data.uf}`;
      document.getElementById('ck-number').focus();
    } catch (err) {
      // Sem resposta do CEP: a pessoa digita o endereço
      addressInput.placeholder = 'Não achamos o CEP. Digite o endereço';
    }
  });
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

  // Altura real da navbar (ela encolhe ao rolar), para barras fixas logo abaixo dela
  const setNavH = () => document.documentElement.style.setProperty('--nav-h', `${navbar.getBoundingClientRect().height}px`);
  if ('ResizeObserver' in window) new ResizeObserver(setNavH).observe(navbar, { box: 'border-box' });
  setNavH();

  // Cart
  document.querySelectorAll('[data-open-cart]').forEach(btn => btn.addEventListener('click', openCart));
  document.getElementById('cart-overlay')?.addEventListener('click', closeCart);
  document.getElementById('cart-close')?.addEventListener('click', closeCart);

  // Mobile menu toggle
  const burger = document.getElementById('menu-toggle');
  const mobileMenu = document.getElementById('mobile-menu');

  const toggleMobileMenu = () => {
    const isOpen = mobileMenu.classList.toggle('open');
    if (!isOpen) mobileMenu.classList.remove('is-search');
    burger.classList.toggle('is-open', isOpen);
    burger.setAttribute('aria-expanded', isOpen);
    document.body.style.overflow = isOpen ? 'hidden' : '';
    // Foco vai para o fechar ao abrir e volta para o hambúrguer ao fechar
    (isOpen ? document.getElementById('menu-close') : burger)?.focus({ preventScroll: true });
  };
  burger?.setAttribute('aria-expanded', 'false');
  burger?.setAttribute('aria-controls', 'mobile-menu');
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && mobileMenu?.classList.contains('open')) toggleMobileMenu();
  });

  burger?.addEventListener('click', toggleMobileMenu);
  document.getElementById('menu-close')?.addEventListener('click', toggleMobileMenu);
  // Fechar ao clicar em links ou fora do menu (se necessário)
  mobileMenu?.querySelectorAll('a').forEach(a => a.addEventListener('click', () => {
    mobileMenu.classList.remove('open', 'is-search');
    burger.classList.remove('is-open');
    document.body.style.overflow = '';
  }));

  // Botão de limpar a busca do menu
  const mobInput = document.getElementById('mob-search-input');
  const mobClear = mobileMenu?.querySelector('.mobile-menu__clear');
  if (mobInput && mobClear) {
    mobInput.addEventListener('input', () => { mobClear.hidden = !mobInput.value; });
    mobClear.addEventListener('click', () => {
      mobInput.value = '';
      mobClear.hidden = true;
      document.getElementById('search-dropdown-mob')?.classList.remove('show');
      mobInput.focus();
    });
  }

  // Mobile search toggle
  const mobileSearchBtn = document.getElementById('mobile-search-toggle');
  if (mobileSearchBtn) {
    mobileSearchBtn.addEventListener('click', () => {
      // A lupa abre o menu com o cursor já na busca
      if (!mobileMenu.classList.contains('open')) {
        toggleMobileMenu();
      }
      setTimeout(() => {
        document.getElementById('mob-search-input')?.focus();
      }, 400);
    });
  }
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
  if (!SPOSENCE_DATA || !SPOSENCE_DATA.fragrance_profiles) return profileId;
  const profile = SPOSENCE_DATA.fragrance_profiles.find(p => p.id === profileId);
  return profile ? profile.label : profileId;
}

// ---- Get all products flat ----
function getAllProducts() {
  if (typeof SPOSENCE_DATA === 'undefined') return [];
  return [
    ...(SPOSENCE_DATA.perfumes || []).map(p => ({ ...p, category: p.category || 'perfumes' })),
    ...(SPOSENCE_DATA.body_splashes || []).map(p => ({ ...p, category: p.category || 'body_splashes' })),
    ...(SPOSENCE_DATA.skincare || []).map(p => ({ ...p, category: p.category || 'skincare' })),
    ...(SPOSENCE_DATA.merchandise || []).map(p => ({ ...p, category: p.category || 'merchandise' }))
  ];
}

// ============================================================
// Card de produto (compartilhado por todas as páginas)
// ============================================================
const SP_BRAND_MARK = 'ID. VISUAL SPOSENCE/Imagens/LOGOS/Logo Secundária/Logo Secundária- SPOSENCE-15.png';
const SP_CATEGORY = { perfumes: 'Perfume', body_splashes: 'Body Splash', skincare: 'Cuidados', merchandise: 'Acessório' };
const spSoldOut = (x) => !!x && (x.outOfStock || x.available === false);
// Sob encomenda: fora do carrinho, preço variável; o pedido é feito pelo WhatsApp
const spOnRequest = (p) => !!(p && p.on_request);
const spOrderUrl = (p, v) => `https://wa.me/5511933175390?text=${encodeURIComponent(`Olá! Gostaria de encomendar o ${p.name}${v ? ` (${v.size})` : ''}.`)}`;
// Produto esgotado ou sob encomenda não mostra preço em lugar nenhum do site
const spPriceText = (p, value) => (spOnRequest(p) ? 'Sob encomenda' : spSoldOut(p) ? 'Indisponível' : formatBRL(value));
// Miniatura de 720px para cards e listas; a foto inteira fica para a página do produto
const spThumb = (src) => (src ? src.replace(/^img\//, 'img/thumbs/') : '');

// "Resta 1 unidade" / "Restam 2 unidades" para tamanhos com estoque contado
const spLeftLabel = (v) => (v && typeof v.stock === 'number' && v.stock > 0 && v.stock <= 3
  ? (v.stock === 1 ? 'Resta 1 unidade' : `Restam ${v.stock} unidades`) : '');

// Variante escolhida em cada card (por padrão, a primeira disponível)
const spPicked = {};
function spVariant(p) {
  if (!p || !p.variants) return null;
  if (!(p.id in spPicked)) {
    const i = p.variants.findIndex(v => !spSoldOut(v));
    spPicked[p.id] = i < 0 ? 0 : i;
  }
  return p.variants[spPicked[p.id]];
}
// variantes com nome (fragrâncias) em vez de tamanho (30ml, 100ml)
const spNamedVariants = (p) => !!(p && p.variants && p.variants.some(v => !/\d/.test(v.size)));
const spFindProduct = (id) => getAllProducts().find(p => p.id === id);

function spCardFoot(p, withSizes) {
  const v = spVariant(p);
  const off = spSoldOut(p) || spSoldOut(v);
  const from = p.variants && p.variants.length > 1 && !withSizes ? '<small>a partir de</small>' : '';
  const button = spOnRequest(p)
    ? `<a class="h-add h-add--order" href="${spOrderUrl(p, v)}" target="_blank" rel="noopener" aria-label="Encomendar ${p.name} pelo WhatsApp"><i class="ph ph-whatsapp-logo" aria-hidden="true"></i><span>Encomendar</span></a>`
    : off
    ? `<button class="h-add h-add--off" type="button" disabled><span>Esgotado</span></button>`
    : `<button class="h-add" type="button" data-add="${p.id}" aria-label="Adicionar ${p.name} ao carrinho"><i class="ph ph-plus" aria-hidden="true"></i><span>Adicionar</span></button>`;
  const left = !off && spLeftLabel(v) ? `<small class="h-left">${spLeftLabel(v)}</small>` : '';
  return `<div class="h-card__price${spSoldOut(p) ? ' h-card__price--off' : ''}">${spSoldOut(p) ? '' : from}${spPriceText(p, v ? v.price : (p.price || 0))}${left}</div>${button}`;
}

// sizes: mostra os tamanhos no card para escolher antes de adicionar
function spCard(p, { sizes = false } = {}) {
  const withSizes = sizes && p.variants && p.variants.length > 1;
  const url = `produto.html?id=${p.id}`;
  const meta = p.inspired_by ? `Inspirado em ${p.inspired_by}` : [p.type, p.volume].filter(Boolean).join(' · ') || p.description || '';
  const chip = spOnRequest(p) ? 'Sob encomenda' : spSoldOut(p) ? 'Esgotado' : (p.profile ? profileLabel(p.profile) : SP_CATEGORY[p.category] || 'Sposence');
  const sizeButtons = withSizes ? `
        <div class="h-sizes${spNamedVariants(p) ? ' h-sizes--named' : ''}" role="group" aria-label="${spNamedVariants(p) ? 'Fragrância' : 'Tamanho'}">
          ${p.variants.map((v, i) => `<button class="h-size" type="button" data-size="${p.id}" data-i="${i}" aria-pressed="${spVariant(p) === v}"${spSoldOut(v) ? ' data-soldout title="Esgotado"' : spLeftLabel(v) ? ` title="${spLeftLabel(v)}"` : ''}>${v.size}</button>`).join('')}
        </div>` : '';
  return `
    <article class="h-card${spSoldOut(p) && !spOnRequest(p) ? ' is-soldout' : ''}" data-card="${p.id}">
      <a href="${url}" class="h-card__media" aria-label="${p.name}">
        ${p.image ? `<img src="${spThumb(p.image)}" alt="${p.name}" loading="lazy" decoding="async"
            onerror="this.style.display='none'; this.nextElementSibling.style.display='grid';">` : ''}
        <div class="h-card__fallback" style="display:${p.image ? 'none' : 'grid'}"><img src="${SP_BRAND_MARK}" alt=""></div>
      </a>
      <div class="h-card__body">
        <div class="h-chips"><span class="h-chip${spSoldOut(p) ? ' h-chip--muted' : ''}">${chip}</span>${p.last_units && !spSoldOut(p) ? '<span class="h-chip h-chip--last">Últimas unidades</span>' : ''}</div>
        <div class="h-card__name">${p.name}</div>
        <div class="h-card__meta">${meta}</div>
        ${sizeButtons}
        <div class="h-card__foot">${spCardFoot(p, withSizes)}</div>
      </div>
    </article>`;
}

// Logo SPOSENCE do topo: sempre volta para a home com a abertura (ver js/intro.js).
// Só no clique simples; ctrl/cmd/meio abrem outra aba sem forçar nada.
document.addEventListener('click', (e) => {
  if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
  if (!e.target.closest('[data-intro-home]')) return;
  try { sessionStorage.setItem('sp-intro-force', '1'); } catch (_) {}
});

// Cliques dos cards: tamanho, adicionar e abrir o produto
document.addEventListener('click', (e) => {
  const size = e.target.closest('[data-size]');
  if (size) {
    const p = spFindProduct(size.dataset.size);
    if (!p) return;
    spPicked[p.id] = Number(size.dataset.i);
    const card = size.closest('[data-card]');
    card.querySelectorAll('[data-size]').forEach(b => b.setAttribute('aria-pressed', b === size));
    size.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
    card.querySelector('.h-card__foot').innerHTML = spCardFoot(p, true);
    return;
  }
  const add = e.target.closest('[data-add]');
  if (add) {
    e.preventDefault();
    const p = spFindProduct(add.dataset.add);
    const v = spVariant(p);
    if (!p || spSoldOut(p) || spSoldOut(v)) { showToast('Esse item está esgotado no momento.'); return; }
    if (cart.add(p, v)) openCart();
    return;
  }
  const card = e.target.closest('[data-card]');
  if (card && !e.target.closest('a, button')) location.href = `produto.html?id=${card.dataset.card}`;
});

// ---- Build Navbar HTML (shared) ----
function buildNavbar(activePage) {
  const pages = [
    { href: 'index.html', label: 'Início' },
    { href: 'produtos.html', label: 'Produtos' },
    { href: 'colecoes.html', label: 'Coleções' },
    { href: 'layering.html', label: 'Layering' },
    { href: 'sobre.html', label: 'Sobre' },
  ];
  return `
  <nav class="navbar" id="navbar">
    <a href="index.html" class="navbar__logo" data-intro-home><img src="img/logo-navbar.png" alt="Sposence" class="navbar__logo-img"></a>
    <ul class="navbar__links">
      ${pages.map(p => `<li><a href="${p.href}" class="${activePage === p.href ? 'active' : ''}">${p.label}</a></li>`).join('')}
    </ul>
    <div class="navbar__actions">
      <div class="navbar__search-wrapper" style="position: relative;">
        <form class="navbar__search" action="produtos.html" method="GET" onsubmit="return this.search.value.trim() !== ''">
          <input type="text" id="desk-search-input" name="search" placeholder="Buscar fragrância..." class="navbar__search-input" aria-label="Buscar" autocomplete="off">
          <button type="submit" class="navbar__search-btn" aria-label="Pesquisar">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          </button>
        </form>
        <div class="search-dropdown" id="search-dropdown-desk"></div>
      </div>
      <a href="conta.html" class="navbar__cart navbar__conta" aria-label="Minha conta"${activePage === 'conta.html' ? ' aria-current="page"' : ''}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/></svg>
      </a>
      <button class="navbar__cart" data-open-cart aria-label="Carrinho">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
        <span class="navbar__cart-count" style="display:none">0</span>
      </button>
      <button class="navbar__search-mobile-toggle" id="mobile-search-toggle" aria-label="Pesquisar">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
      </button>
      <button class="navbar__burger" id="menu-toggle" aria-label="Menu">
        <span></span><span></span><span></span>
      </button>
    </div>
  </nav>
  <div class="mobile-menu" id="mobile-menu" role="dialog" aria-modal="true" aria-label="Menu">
    <div class="mobile-menu__content">
      <div class="mobile-menu__header">
        <button class="mobile-menu__close" id="menu-close" aria-label="Fechar menu"><i class="ph ph-x" aria-hidden="true"></i></button>
      </div>
      <form class="mobile-menu__search" action="produtos.html" method="GET" onsubmit="return this.search.value.trim() !== ''">
        <i class="ph ph-magnifying-glass" aria-hidden="true"></i>
        <input type="search" id="mob-search-input" name="search" placeholder="Buscar produtos..." aria-label="Buscar produtos" autocomplete="off">
        <button type="button" class="mobile-menu__clear" aria-label="Limpar busca" hidden><i class="ph ph-x" aria-hidden="true"></i></button>
        <div class="search-dropdown search-dropdown--mobile" id="search-dropdown-mob"></div>
      </form>
      <nav class="mobile-menu__links" aria-label="Páginas">
        ${pages.map((p, i) => `<a href="${p.href}" style="--i:${i}"${activePage === p.href ? ' aria-current="page"' : ''}>${p.label}</a>`).join('')}
        <a href="conta.html" style="--i:${pages.length}"${activePage === 'conta.html' ? ' aria-current="page"' : ''}>Minha conta</a>
      </nav>
      <div class="mobile-menu__footer">
        <span class="mobile-menu__label">Contato</span>
        <a href="mailto:sposence@gmail.com" class="mobile-menu__contact">sposence@gmail.com</a>
        <a href="https://wa.me/5511933175390" target="_blank" rel="noopener" class="mobile-menu__contact">WhatsApp: (11) 93317-5390</a>
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
      <button class="btn btn--primary btn--full btn--lg" onclick="openCheckout()">
        Finalizar Pedido
      </button>
      <div class="cart-packaging-note">
        <span class="cart-packaging-note__icon">✦</span>
        <span>Todos os perfumes incluem a <strong>Mini Sacola</strong> de Algodão Cru como brinde de proteção.</span>
      </div>
    </div>
  </aside>
  
  <!-- Modal de Checkout -->
  <div class="checkout-modal" id="checkout-modal">
    <div class="checkout-modal__content">
      <div class="checkout-modal__header">
        <h3 class="checkout-modal__title">Finalizar Pedido</h3>
        <button onclick="closeCheckout()" class="btn--ghost" style="font-size:1.4rem">×</button>
      </div>
      <form id="checkout-form" onsubmit="processCheckout(event)" novalidate>
        <div class="ck-summary" id="ck-summary"></div>

        <div class="form-group">
          <label class="form-label" for="ck-name">Seu nome</label>
          <input type="text" id="ck-name" class="form-input" required autocomplete="name" placeholder="Como podemos te chamar?">
        </div>
        <div class="form-group">
          <label class="form-label" for="ck-phone">WhatsApp</label>
          <input type="tel" id="ck-phone" class="form-input" required autocomplete="tel-national" inputmode="numeric" placeholder="(11) 90000-0000">
          <small class="ck-hint">É por aqui que confirmamos o pedido e o pagamento.</small>
        </div>

        <fieldset class="form-group ck-choice">
          <legend class="form-label">Como quer receber?</legend>
          <label><input type="radio" name="ck-delivery" value="pickup" checked><span><strong>Combinar retirada</strong><small>Data e local pelo WhatsApp</small></span></label>
          <label><input type="radio" name="ck-delivery" value="shipping"><span><strong>Receber em casa</strong><small>Correios ou transportadora</small></span></label>
        </fieldset>

        <div id="address-fields" hidden>
          <div class="ck-row">
            <div class="form-group">
              <label class="form-label" for="ck-cep">CEP</label>
              <input type="text" id="ck-cep" class="form-input" inputmode="numeric" autocomplete="postal-code" placeholder="00000-000">
            </div>
            <div class="form-group">
              <label class="form-label" for="ck-number">Número</label>
              <input type="text" id="ck-number" class="form-input" placeholder="123">
            </div>
          </div>
          <div class="form-group">
            <label class="form-label" for="ck-address">Endereço</label>
            <input type="text" id="ck-address" class="form-input" autocomplete="street-address" placeholder="Preenchido pelo CEP">
          </div>
          <div class="form-group">
            <label class="form-label" for="ck-cpf">CPF</label>
            <input type="text" id="ck-cpf" class="form-input" inputmode="numeric" placeholder="000.000.000-00">
            <small class="ck-hint">Os Correios exigem o CPF do destinatário.</small>
          </div>
          <div class="form-group">
            <label class="form-label" for="ck-comp">Complemento <span>(opcional)</span></label>
            <input type="text" id="ck-comp" class="form-input" placeholder="Apto, bloco, referência">
          </div>
        </div>

        <details class="ck-more">
          <summary>Adicionar e-mail <span>(opcional)</span></summary>
          <div class="form-group">
            <label class="form-label" for="ck-email">E-mail</label>
            <input type="email" id="ck-email" class="form-input" autocomplete="email" placeholder="Para receber o resumo do pedido">
          </div>
        </details>

        <p class="ck-error" id="ck-error" role="alert" hidden></p>

        <div class="checkout-modal__actions">
          <button type="button" class="h-btn h-btn--ghost" onclick="closeCheckout()">Voltar</button>
          <button type="submit" class="h-btn h-btn--primary" id="ck-submit">Gerar PIX</button>
        </div>
      </form>
    </div>
  </div>`;
}

// ---- Build Footer HTML (shared) ----
function buildFooter() {
  return `
  <footer class="footer">
    <div class="container">
      <div class="footer__top">
        <div>
          <div class="footer__logo"><img src="img/logo-navbar.png" alt="Sposence" class="footer__logo-img"></div>
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
            <li><a href="sobre.html">Nossa Qualidade</a></li>
            <li><a href="conta.html">Minha conta</a></li>
            <li><a href="privacidade.html">Política de privacidade</a></li>
            <li><a href="mailto:sposence@gmail.com">sposence@gmail.com</a></li>
            <li><a href="https://wa.me/5511933175390" target="_blank" rel="noopener">WhatsApp (11) 93317-5390</a></li>
          </ul>
        </div>
      </div>
      <div class="footer__bottom">
        <p class="footer__copy">© 2026 Sposence. Essências que contam histórias.</p>
        <p class="footer__copy">Artesanal • Alta Fixação</p>
      </div>
    </div>
  </footer>`;
}

// ---- Toast Container (shared) ----
function buildToastContainer() {
  return `<div class="toast-container" id="toast-container"></div>`;
}

// ---- Global Search ----
function initGlobalSearch() {
  if (typeof SPOSENCE_DATA === 'undefined') return;
  
  const allProducts = [
    ...(SPOSENCE_DATA.perfumes || []).map(p => ({...p, category: 'perfumes'})),
    ...(SPOSENCE_DATA.body_splashes || []).map(p => ({...p, category: 'body_splashes'})),
    ...(SPOSENCE_DATA.skincare || []).map(p => ({...p, category: 'skincare'})),
    ...(SPOSENCE_DATA.merchandise || []).map(p => ({...p, category: 'merchandise'}))
  ];

  const setupSearch = (inputId, dropdownId) => {
    const input = document.getElementById(inputId);
    const dropdown = document.getElementById(dropdownId);
    if (!input || !dropdown) return;

    const renderResults = (query) => {
      if (!query) {
        dropdown.classList.remove('show');
        return;
      }
      
      const normalize = (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
      const q = normalize(query);
      
      // Simples algoritmo de Levenshtein para tolerar pequenos erros
      const isFuzzyMatch = (target, pattern) => {
        if (target.includes(pattern)) return true;
        if (pattern.length < 3) return false;
        
        const dist = (s1, s2) => {
          const m = s1.length, n = s2.length;
          const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
          for (let i = 0; i <= m; i++) dp[i][0] = i;
          for (let j = 0; j <= n; j++) dp[0][j] = j;
          for (let i = 1; i <= m; i++) {
            for (let j = 1; j <= n; j++) {
              if (s1[i - 1] === s2[j - 1]) dp[i][j] = dp[i - 1][j - 1];
              else dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
            }
          }
          return dp[m][n];
        };

        // Verifica se alguma palavra do alvo "quase" bate com o padrão
        const words = target.split(/\s+/);
        return words.some(word => {
          if (word.length < 3) return word === pattern;
          const maxDist = pattern.length > 6 ? 2 : 1;
          return dist(word.slice(0, pattern.length), pattern) <= maxDist;
        });
      };
      
      const results = allProducts.filter(p => {
        const name = normalize(p.name);
        const inspired = normalize(p.inspired_by || "");
        const tags = (p.tags || []).map(t => normalize(t));
        
        return isFuzzyMatch(name, q) || isFuzzyMatch(inspired, q) || tags.some(t => isFuzzyMatch(t, q));
      }).slice(0, 5);

      if (results.length === 0) {
        dropdown.innerHTML = `<div class="search-dropdown__empty">Nenhum produto encontrado.</div>`;
      } else {
        dropdown.innerHTML = results.map(p => {
          const price = p.variants ? spVariant(p).price : (p.price || 0);
          return `
            <a href="produto.html?id=${p.id}" class="search-dropdown__item">
              <img src="${spThumb(p.image) || SP_BRAND_MARK}" alt="" class="search-dropdown__img" loading="lazy" decoding="async">
              <div class="search-dropdown__info">
                <div class="search-dropdown__name">${p.name}</div>
                <div class="search-dropdown__type">${[SP_CATEGORY[p.category], p.profile ? profileLabel(p.profile) : ''].filter(Boolean).join(' · ')}</div>
              </div>
              <div class="search-dropdown__price">${spPriceText(p, price)}</div>
            </a>
          `;
        }).join('') + `<a href="produtos.html?search=${encodeURIComponent(query)}" class="search-dropdown__item search-dropdown__all">Ver todos os resultados <i class="ph ph-arrow-right" aria-hidden="true"></i></a>`;
      }
      dropdown.classList.add('show');
    };

    input.addEventListener('input', (e) => renderResults(e.target.value.trim()));
    input.addEventListener('focus', (e) => renderResults(e.target.value.trim()));
    
    // Close when clicking outside
    document.addEventListener('click', (e) => {
      if (!input.contains(e.target) && !dropdown.contains(e.target)) {
        dropdown.classList.remove('show');
      }
    });
  };

  // timeout slightly to ensure DOM is fully ready with navbar
  setTimeout(() => {
    setupSearch('desk-search-input', 'search-dropdown-desk');
    setupSearch('mob-search-input', 'search-dropdown-mob');
  }, 100);
}

// ---- Init Global ----
document.addEventListener('DOMContentLoaded', () => {
  cart.load();
  cart.render();
  initNavbar();
  initReveal();
  initGlobalSearch();
  initFloatingUI();
});

function initFloatingUI() {
  if (document.querySelector('.float-wa')) return;
  const wa = document.createElement('a');
  wa.href = "https://wa.me/5511933175390?text=Olá! Gostaria de tirar uma dúvida sobre as fragrâncias Sposence.";
  wa.className = "float-wa";
  wa.target = "_blank";
  wa.setAttribute('aria-label', 'Contato via WhatsApp');
  wa.innerHTML = `<svg viewBox="0 0 24 24"><path d="M12.031 6.172c-2.277 0-4.125 1.848-4.125 4.125 0 .736.194 1.425.53 2.02l-.564 2.057 2.106-.552c.57.314 1.226.495 1.924.495 2.277 0 4.125-1.848 4.125-4.125s-1.848-4.125-4.125-4.125zM12 2C6.477 2 2 6.477 2 12c0 1.891.525 3.66 1.438 5.17L2 22l4.997-1.312C8.423 21.574 10.151 22 12 22c5.523 0 10-4.477 10-10S17.523 2 12 2z"/></svg>`;
  document.body.appendChild(wa);
}
