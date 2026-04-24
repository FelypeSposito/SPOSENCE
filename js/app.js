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

// ---- Checkout Modal & Logic ----
function closeCheckout() {
  document.getElementById('checkout-modal').classList.remove('open');
  document.body.style.overflow = '';
}

// Inicia as máscaras quando o modal abre
function openCheckout() {
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
    if (typeof emailjs === 'undefined') {
      throw new Error("O sistema de e-mail ainda está carregando. Aguarde um instante.");
    }

    const name = document.getElementById('ck-name').value;
    const email = document.getElementById('ck-email').value;
    const phone = document.getElementById('ck-phone').value;
    const cpf = document.getElementById('ck-cpf').value;
    const cep = document.getElementById('ck-cep').value;
    const address = document.getElementById('ck-address').value; // Rua/Bairro/Cidade (preenchido pela API)
    const number = document.getElementById('ck-number').value;
    const comp = document.getElementById('ck-comp').value;

    const deliveryMethod = document.querySelector('input[name="ck-delivery"]:checked')?.value || 'shipping';
    let fullAddress = "Retirada Presencial (a combinar)";
    
    if (deliveryMethod === 'shipping') {
      fullAddress = `${address}, Nº ${number}${comp ? ' (' + comp + ')' : ''} - CEP: ${cep}`;
    }
    // Formatar itens do carrinho
    let orderDetails = "ITENS DO PEDIDO:\n\n";
    cart.items.forEach(item => {
      orderDetails += `- ${item.qty}x ${item.name} (${item.variant ? item.variant : item.category}) | R$ ${(item.price * item.qty).toFixed(2).replace('.', ',')}\n`;
    });
    orderDetails += `\nTOTAL: R$ ${cart.total().toFixed(2).replace('.', ',')}`;

    // 1. Abrir WhatsApp (Reativado conforme solicitado)
    const myPhone = "5511933175390";
    let waText = `Olá Sposence! Acabei de fazer um pedido no site e estou aguardando a confirmação do PIX:\n\n`;
    waText += `*DADOS DO CLIENTE*\nNome: ${name}\nWhatsApp: ${phone}\n\n`;
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
      cpf: cpf,
      address: fullAddress,
      order_details: orderDetails,
      payment_status: "Aguardando Pagamento" 
    };

    Promise.all([
      emailjs.send("service_0pef7hl", "template_9fbieif", emailParams, "vuRyyPfZQpHshbobj"),
      emailjs.send("service_0pef7hl", "template_098jyr3", emailParams, "vuRyyPfZQpHshbobj")
    ]).catch(err => console.error("Erro no EmailJS:", err));

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
        <button class="btn btn--primary btn--full" id="btn-copy-pix">Copiar Código PIX</button>
      </div>

      <div class="checkout-success__info">
        <p><strong>Total:</strong> R$ ${cart.total().toFixed(2).replace('.', ',')}</p>
        <p style="font-size: 0.85rem; opacity: 0.8; margin-top: 0.5rem;">Após copiar, abra o app do seu banco e escolha "Pix Copia e Cola".</p>
      </div>

      <div class="checkout-modal__actions">
        <button class="btn btn--outline btn--full" onclick="location.reload()">Concluir e Voltar ao Início</button>
      </div>
    </div>
  `;

  document.getElementById('btn-copy-pix').addEventListener('click', (e) => {
    navigator.clipboard.writeText(code);
    e.target.textContent = "Copiado! ✓";
    setTimeout(() => e.target.textContent = "Copiar Código PIX", 2000);
  });
}

// ---- Máscaras e API de CEP ----
function initCheckoutHelpers() {
  const cpfInput = document.getElementById('ck-cpf');
  const phoneInput = document.getElementById('ck-phone');
  const cepInput = document.getElementById('ck-cep');
  const addressInput = document.getElementById('ck-address');

  if (cpfInput) {
    cpfInput.addEventListener('input', (e) => {
      let v = e.target.value.replace(/\D/g, '');
      if (v.length > 11) v = v.slice(0, 11);
      v = v.replace(/(\d{3})(\d)/, '$1.$2');
      v = v.replace(/(\d{3})(\d)/, '$1.$2');
      v = v.replace(/(\d{3})(\d{1,2})$/, '$1-$2');
      e.target.value = v;
    });
  }

  if (phoneInput) {
    phoneInput.addEventListener('input', (e) => {
      let v = e.target.value.replace(/\D/g, '');
      if (v.length > 11) v = v.slice(0, 11);
      v = v.replace(/^(\d{2})(\d)/g, '($1) $2');
      v = v.replace(/(\d{5})(\d)/, '$1-$2');
      e.target.value = v;
    });
  }

  if (cepInput) {
    cepInput.addEventListener('input', async (e) => {
      let v = e.target.value.replace(/\D/g, '');
      if (v.length > 8) v = v.slice(0, 8);
      v = v.replace(/^(\d{5})(\d)/, '$1-$2');
      e.target.value = v;

      if (v.replace('-', '').length === 8) {
        addressInput.value = "Buscando endereço...";
        try {
          const res = await fetch(`https://viacep.com.br/ws/${v.replace('-', '')}/json/`);
          const data = await res.json();
          if (data.erro) {
            addressInput.value = "";
            alert("CEP não encontrado.");
          } else {
            addressInput.value = `${data.logradouro}, ${data.bairro} - ${data.localidade}/${data.uf}`;
            document.getElementById('ck-number').focus();
          }
        } catch (err) {
          addressInput.value = "";
        }
      }
    });
  }
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
    { href: 'index.html', label: 'Início' },
    { href: 'produtos.html', label: 'Perfumes' },
    { href: 'colecoes.html', label: 'Coleções' },
    { href: 'layering.html', label: 'Layering' },
    { href: 'sobre.html', label: 'Sobre' },
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
      <button class="btn btn--primary btn--full btn--lg" onclick="openCheckout()">
        Finalizar Pedido
      </button>
      <div class="cart-packaging-note">
        <span class="cart-packaging-note__icon">✦</span>
        Todos os perfumes incluem a&nbsp;<strong>Mini Sacola</strong> de Algodão Cru como brinde de proteção.
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
      <form id="checkout-form" onsubmit="processCheckout(event)">
        <div class="form-group">
          <label class="form-label">Nome Completo</label>
          <input type="text" id="ck-name" class="form-input" required placeholder="Ex: João da Silva">
        </div>
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
          <div class="form-group">
            <label class="form-label">E-mail</label>
            <input type="email" id="ck-email" class="form-input" required placeholder="Ex: joao@email.com">
          </div>
          <div class="form-group">
            <label class="form-label">WhatsApp</label>
            <input type="text" id="ck-phone" class="form-input" required placeholder="(00) 00000-0000">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">CPF</label>
          <input type="text" id="ck-cpf" class="form-input" required placeholder="000.000.000-00">
        </div>
        <div class="form-group" style="margin-bottom: 1.5rem;">
          <label class="form-label" style="margin-bottom: 0.75rem;">Método de Recebimento</label>
          <div style="display: flex; flex-direction: column; gap: 0.75rem;">
            <label style="font-size: 14px; display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
              <input type="radio" name="ck-delivery" value="shipping" checked onchange="document.getElementById('address-fields').style.display='block';"> 
              Entrega (Correios/Transportadora)
            </label>
            <label style="font-size: 14px; display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
              <input type="radio" name="ck-delivery" value="pickup" onchange="document.getElementById('address-fields').style.display='none';"> 
              Receber Presencialmente (Data e local a combinar)
            </label>
          </div>
        </div>

        <div id="address-fields">
          <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
            <div class="form-group">
              <label class="form-label">CEP</label>
              <input type="text" id="ck-cep" class="form-input" placeholder="00000-000">
            </div>
            <div class="form-group">
              <label class="form-label">Número da Casa</label>
              <input type="text" id="ck-number" class="form-input" placeholder="Ex: 123">
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Endereço (Autocompletado pelo CEP)</label>
            <input type="text" id="ck-address" class="form-input" readonly placeholder="Rua, Bairro, Cidade - UF" style="background:var(--surface-container); opacity: 0.8; cursor: not-allowed;">
          </div>
          <div class="form-group">
            <label class="form-label">Complemento (Opcional)</label>
            <input type="text" id="ck-comp" class="form-input" placeholder="Ex: Apto 4, Bloco B">
          </div>
        </div>

        <div class="checkout-modal__actions">
          <button type="button" class="btn btn--outline btn--full" onclick="closeCheckout()">Voltar</button>
          <button type="submit" class="btn btn--primary btn--full" id="ck-submit">Confirmar e Gerar PIX</button>
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
        <p class="footer__copy">Concentração: 27%</p>
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
  // Injetar EmailJS dinamicamente
  const script = document.createElement('script');
  script.src = "https://cdn.jsdelivr.net/npm/@emailjs/browser@3/dist/email.min.js";
  document.head.appendChild(script);

  cart.load();
  cart.render();
  initNavbar();
  initReveal();
});
