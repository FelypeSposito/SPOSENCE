// Minha conta: entrar com Google, gosto declarado, perfumes que já usou, lista de desejos,
// consentimento de contato e direitos sobre os dados. Fala com /api/conta.
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const normal = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const aviso = (m) => { if (typeof showToast === 'function') showToast(m); };

  const PERFIS = [['doces', 'Doces'], ['frescos', 'Frescos'], ['noturnos', 'Noturnos'], ['elegantes', 'Elegantes']];
  const PUBLICOS = [['feminino', 'Femininos'], ['masculino', 'Masculinos'], ['compartilhavel', 'Unissex']];
  const ROTULO_NOTA = { citrico: 'Cítricos', amadeirado: 'Amadeirados', baunilha: 'Baunilha', gourmand: 'Gourmand', floral: 'Florais', amendoa: 'Amêndoa', aquatico: 'Aquáticos', dia: 'Para o dia', calor: 'Para o calor', oud: 'Oud', especiado: 'Especiados' };
  const PERFUMES = (typeof SPOSENCE_DATA !== 'undefined' ? SPOSENCE_DATA.perfumes : []).filter((p) => p.category === 'perfumes' || !p.category);
  const NOTAS = [...new Set(PERFUMES.flatMap((p) => p.tags || []).filter((t) => !PERFIS.some((x) => x[0] === t) && !PUBLICOS.some((x) => x[0] === t)))];
  const rotuloNota = (t) => ROTULO_NOTA[t] || t.charAt(0).toUpperCase() + t.slice(1);

  let conta = null;
  let pedidos = [];
  let sujo = false;
  let busca = '';
  const ed = { perfis: new Set(), publicos: new Set(), notas: new Set(), usou: new Set(), desejos: new Set(), marketing: false, whatsapp: '' };

  const chamar = (corpo) => fetch('/api/conta', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) })
    .then((r) => r.json().catch(() => ({ erro: 'Resposta inesperada do servidor.' })).then((d) => ({ status: r.status, d })));

  function carregarEdicao() {
    ed.perfis = new Set(conta.gosto.perfis); ed.publicos = new Set(conta.gosto.publicos); ed.notas = new Set(conta.gosto.notas);
    ed.usou = new Set(conta.usou); ed.desejos = new Set(conta.desejos);
    ed.marketing = Boolean(conta.consentimento.marketing); ed.whatsapp = conta.consentimento.whatsapp || '';
    sujo = false;
  }

  /* ---------- entrar ---------- */
  function desenharEntrar(clientId) {
    $('conta-app').innerHTML = `
      <div class="conta-card conta-entrar">
        <h2>Entrar</h2>
        <p class="conta-sub">Use a sua conta Google. A Sposence não recebe a sua senha.</p>
        ${clientId ? '<div id="g-botao" class="conta-g" aria-label="Entrar com o Google"></div>' : '<p class="conta-aviso">O login com Google estará disponível em breve.</p>'}
        <p class="conta-aviso" id="conta-msg" role="alert"></p>
        <ul class="conta-vantagens">
          <li>Guarde o seu gosto e receba indicações que combinam com você.</li>
          <li>Marque os perfumes que já usou e os que quer experimentar.</li>
          <li>Veja os seus pedidos, depois que a Sposence confirmar que a conta é sua.</li>
          <li>Baixe ou apague os seus dados quando quiser.</li>
        </ul>
        <p class="conta-nota">Ao entrar, você concorda com a <a href="privacidade.html">política de privacidade</a>. Receber novidades é opcional e começa desmarcado.</p>
      </div>`;
    if (!clientId) return;
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client'; s.async = true;
    s.onload = () => {
      window.google.accounts.id.initialize({ client_id: clientId, callback: aoReceberCredencial, ux_mode: 'popup', auto_select: false });
      window.google.accounts.id.renderButton($('g-botao'), { theme: 'outline', size: 'large', shape: 'pill', text: 'continue_with', locale: 'pt-BR', width: 300 });
    };
    s.onerror = () => { $('conta-msg').textContent = 'Não consegui carregar o login do Google. Verifique a conexão e tente de novo.'; };
    document.head.appendChild(s);
  }

  async function aoReceberCredencial(resp) {
    const { status, d } = await chamar({ acao: 'entrar', credential: resp.credential });
    if (status !== 200) { const m = $('conta-msg'); if (m) m.textContent = d.erro || 'Não consegui entrar.'; return; }
    conta = d.conta; pedidos = d.pedidos || []; carregarEdicao(); desenharConta();
  }

  /* ---------- conta ---------- */
  const chip = (grupo, k, nome, ativo) => `<button type="button" class="conta-pill" data-grupo="${grupo}" data-k="${esc(k)}" aria-pressed="${ativo}">${esc(nome)}</button>`;
  const din = (n) => 'R$ ' + Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  function listaPerfumes() {
    const b = normal(busca);
    const itens = PERFUMES.filter((p) => !b || normal(p.name + ' ' + (p.inspired_by || '')).includes(b));
    return itens.length ? itens.map((p) => `<div class="cp-linha"><div><b>${esc(p.name)}</b>${p.inspired_by ? `<small>inspirado em ${esc(p.inspired_by)}</small>` : ''}</div>
      <div class="cp-botoes">${['usou', 'desejos'].map((l) => `<button type="button" class="conta-pill" data-lista="${l}" data-id="${esc(p.id)}" aria-pressed="${ed[l].has(p.id)}">${l === 'usou' ? 'Já usei' : 'Quero'}</button>`).join('')}</div></div>`).join('')
      : '<p class="conta-nota">Nenhum perfume encontrado.</p>';
  }

  function desenharConta() {
    const c = conta;
    const aceitou = c.consentimento.marketing && c.consentimento.data;
    $('conta-app').innerHTML = `
      <div class="conta-wrap">
        <div class="conta-card conta-topo">
          ${c.foto ? `<img class="conta-foto" src="${esc(c.foto)}" alt="" referrerpolicy="no-referrer" width="56" height="56">` : '<span class="conta-foto conta-foto--vazia" aria-hidden="true"></span>'}
          <div><h2>Olá, ${esc((c.nome || '').split(' ')[0])}</h2><p class="conta-sub">${esc(c.email)}</p></div>
          <button type="button" class="h-btn h-btn--ghost conta-sair" data-acao="sair">Sair</button>
        </div>

        <div class="conta-card">
          <h2>O que você curte</h2>
          <p class="conta-sub">Marque à vontade. Isso ajuda a Sposence a indicar fragrâncias que combinam com você.</p>
          <p class="conta-rotulo">Famílias olfativas</p><div class="conta-pills">${PERFIS.map(([k, n]) => chip('perfis', k, n, ed.perfis.has(k))).join('')}</div>
          <p class="conta-rotulo">Para quem</p><div class="conta-pills">${PUBLICOS.map(([k, n]) => chip('publicos', k, n, ed.publicos.has(k))).join('')}</div>
          <p class="conta-rotulo">Notas e momentos</p><div class="conta-pills">${NOTAS.map((k) => chip('notas', k, rotuloNota(k), ed.notas.has(k))).join('')}</div>
        </div>

        <div class="conta-card">
          <h2>Seus perfumes</h2>
          <p class="conta-sub">Marque os que você já usou e os que quer experimentar.</p>
          <input id="conta-busca" type="search" class="conta-campo" placeholder="Buscar fragrância" aria-label="Buscar fragrância" value="${esc(busca)}" autocomplete="off" />
          <div class="cp-lista" id="conta-perfumes">${listaPerfumes()}</div>
        </div>

        <div class="conta-card">
          <h2>Receber novidades</h2>
          <label class="conta-consent">
            <input type="checkbox" id="conta-mkt"${ed.marketing ? ' checked' : ''} />
            <span>Quero receber novidades e sugestões da Sposence pelo WhatsApp, como lançamentos e fragrâncias parecidas com o que eu gosto.</span>
          </label>
          <div id="conta-whats-box"${ed.marketing ? '' : ' hidden'}>
            <label for="conta-whats" class="conta-rotulo">Seu WhatsApp com DDD</label>
            <input id="conta-whats" type="tel" class="conta-campo" inputmode="tel" placeholder="(11) 90000-0000" value="${esc(ed.whatsapp)}" maxlength="30" autocomplete="tel" />
          </div>
          <p class="conta-erro" id="conta-erro" role="alert"></p>
          <p class="conta-nota">${aceitou ? `Você aceitou em ${esc(String(c.consentimento.data).slice(8, 10) + '/' + String(c.consentimento.data).slice(5, 7) + '/' + String(c.consentimento.data).slice(0, 4))}. ` : ''}Você pode mudar de ideia quando quiser, é só desmarcar e salvar. Veja como tratamos os seus dados na <a href="privacidade.html">política de privacidade</a>.</p>
        </div>

        ${pedidos.length ? `<div class="conta-card"><h2>Meus pedidos</h2><ul class="conta-pedidos">${pedidos.map((p) => `<li><div><b>Pedido nº ${p.numero}</b><small>${esc(p.data.slice(8, 10) + '/' + p.data.slice(5, 7))}, ${esc(p.itens.join(' · '))}</small></div><span>${din(p.total)}</span></li>`).join('')}</ul></div>` : ''}

        <div class="conta-card">
          <h2>Seus dados</h2>
          <p class="conta-sub">Você tem direito de ver, levar e apagar o que a Sposence guarda sobre você.</p>
          <div class="conta-acoes">
            <button type="button" class="h-btn h-btn--ghost" data-acao="exportar">Baixar meus dados</button>
            <button type="button" class="h-btn h-btn--ghost conta-perigo" data-acao="excluir">Excluir minha conta</button>
          </div>
          <p class="conta-nota">Ao excluir, apagamos o seu perfil, o consentimento e o vínculo com a conta. Os pedidos já feitos continuam nos registros da loja, sem ligação com a sua conta.</p>
        </div>
      </div>

      <div class="conta-barra" id="conta-barra"${sujo ? '' : ' hidden'}>
        <span>Você tem alterações para salvar.</span>
        <button type="button" class="h-btn h-btn--primary" data-acao="salvar">Salvar</button>
      </div>

      <dialog id="conta-excluir" class="conta-dialogo" aria-labelledby="ce-t">
        <h2 id="ce-t">Excluir a sua conta?</h2>
        <p>Isso apaga o seu perfil, o seu gosto, as suas listas e o seu consentimento. Não dá para desfazer.</p>
        <div class="conta-acoes"><button type="button" class="h-btn h-btn--ghost" data-acao="cancelar">Cancelar</button><button type="button" class="h-btn h-btn--primary" data-acao="confirmar-excluir">Excluir</button></div>
      </dialog>`;
  }

  const marcarSujo = () => { sujo = true; const b = $('conta-barra'); if (b) b.hidden = false; };

  async function salvar() {
    $('conta-erro').textContent = '';
    const { status, d } = await chamar({
      acao: 'salvar',
      gosto: { perfis: [...ed.perfis], publicos: [...ed.publicos], notas: [...ed.notas] },
      usou: [...ed.usou], desejos: [...ed.desejos],
      consentimento: { marketing: ed.marketing, whatsapp: ed.whatsapp },
    });
    if (status === 401) { conta = null; iniciar(); return; }
    if (status !== 200) { $('conta-erro').textContent = d.erro || 'Não consegui salvar.'; $('conta-erro').scrollIntoView({ block: 'center', behavior: 'smooth' }); return; }
    conta = d.conta; carregarEdicao(); desenharConta(); aviso('Alterações salvas.');
  }

  document.addEventListener('click', async (ev) => {
    const alvo = ev.target.closest('[data-grupo], [data-lista], [data-acao]');
    if (!alvo || !conta) return;
    if (alvo.dataset.grupo) {
      const s = ed[alvo.dataset.grupo]; const k = alvo.dataset.k;
      s.has(k) ? s.delete(k) : s.add(k);
      alvo.setAttribute('aria-pressed', s.has(k)); marcarSujo(); return;
    }
    if (alvo.dataset.lista) {
      const s = ed[alvo.dataset.lista]; const id = alvo.dataset.id;
      s.has(id) ? s.delete(id) : s.add(id);
      alvo.setAttribute('aria-pressed', s.has(id)); marcarSujo(); return;
    }
    const acao = alvo.dataset.acao;
    if (acao === 'salvar') salvar();
    else if (acao === 'sair') { await chamar({ acao: 'sair' }); conta = null; pedidos = []; iniciar(); }
    else if (acao === 'exportar') {
      const { status, d } = await chamar({ acao: 'exportar' });
      if (status !== 200) { aviso(d.erro || 'Não consegui baixar agora.'); return; }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([JSON.stringify(d, null, 2)], { type: 'application/json' }));
      a.download = 'sposence-meus-dados.json'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }
    else if (acao === 'excluir') $('conta-excluir').showModal();
    else if (acao === 'cancelar') $('conta-excluir').close();
    else if (acao === 'confirmar-excluir') {
      const { status, d } = await chamar({ acao: 'excluir' });
      if (status !== 200) { aviso(d.erro || 'Não consegui excluir agora.'); return; }
      conta = null; pedidos = []; iniciar(); aviso('Conta excluída.');
    }
  });
  document.addEventListener('input', (ev) => {
    if (ev.target.id === 'conta-busca') { busca = ev.target.value; $('conta-perfumes').innerHTML = listaPerfumes(); }
    else if (ev.target.id === 'conta-whats') { ed.whatsapp = ev.target.value; marcarSujo(); }
  });
  document.addEventListener('change', (ev) => {
    if (ev.target.id === 'conta-mkt') { ed.marketing = ev.target.checked; $('conta-whats-box').hidden = !ed.marketing; marcarSujo(); if (ed.marketing) $('conta-whats').focus(); }
  });

  /* ---------- início ---------- */
  async function iniciar() {
    $('conta-app').innerHTML = '<p class="conta-sub" style="padding:2rem 0">Abrindo a sua conta…</p>';
    try {
      const config = await fetch('/api/conta').then((r) => r.json());
      const { status, d } = await chamar({ acao: 'eu' });
      if (status === 200) { conta = d.conta; pedidos = d.pedidos || []; carregarEdicao(); desenharConta(); return; }
      desenharEntrar(config.clientId);
    } catch (_) {
      $('conta-app').innerHTML = '<div class="conta-card"><h2>Sem conexão</h2><p class="conta-sub">Não consegui abrir a sua conta agora. Tente de novo em instantes.</p></div>';
    }
  }
  iniciar();
})();
