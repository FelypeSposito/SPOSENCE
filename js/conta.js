// Minha conta: entrar com Google, marcar os perfumes que já usou ou quer experimentar, ver o gosto
// que a Sposence deduz disso (e do carrinho), consentimento de contato e direitos sobre os dados.
// Fala com /api/conta.
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const normal = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const aviso = (m) => { if (typeof showToast === 'function') showToast(m); };

  const PERFIS = [['doces', 'Doces'], ['frescos', 'Frescos'], ['noturnos', 'Noturnos'], ['elegantes', 'Elegantes']];
  const PUBLICOS = [['feminino', 'Femininos'], ['masculino', 'Masculinos'], ['compartilhavel', 'Unissex']];
  const ROTULO_NOTA = { citrico: 'Cítricos', amadeirado: 'Amadeirados', baunilha: 'Baunilha', gourmand: 'Gourmand', floral: 'Florais', amendoa: 'Amêndoa', aquatico: 'Aquáticos', dia: 'Para o dia', calor: 'Para o calor', oud: 'Oud', especiado: 'Especiados', ambar: 'Âmbar', oriental: 'Orientais', sedutor: 'Sedutores' };
  const PERFUMES = (typeof SPOSENCE_DATA !== 'undefined' ? SPOSENCE_DATA.perfumes : []).filter((p) => p.category === 'perfumes' || !p.category);
  const NOTAS = [...new Set(PERFUMES.flatMap((p) => p.tags || []).filter((t) => !PERFIS.some((x) => x[0] === t) && !PUBLICOS.some((x) => x[0] === t)))];
  const rotuloNota = (t) => ROTULO_NOTA[t] || t.charAt(0).toUpperCase() + t.slice(1);
  const rotuloPerfil = (k) => (PERFIS.find((x) => x[0] === k) || [])[1] || k;
  const porId = new Map(PERFUMES.map((p) => [p.id, p]));

  let conta = null;
  let pedidos = [];
  let sujo = false;
  let busca = '';
  let filtro = 'todos';
  const ed = { perfis: new Set(), publicos: new Set(), notas: new Set(), usou: new Set(), desejos: new Set(), naocurte: new Set(), marketing: false, whatsapp: '' };

  const chamar = (corpo) => fetch('/api/conta', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) })
    .then((r) => r.json().catch(() => ({ erro: 'Resposta inesperada do servidor.' })).then((d) => ({ status: r.status, d })));

  // perfumes que estão no carrinho deste aparelho (só o que é perfume)
  function carrinhoLocal() {
    try {
      const itens = JSON.parse(localStorage.getItem('sposence_cart') || '[]');
      return [...new Set(itens.filter((i) => porId.has(i.productId)).map((i) => i.productId))];
    } catch (_) { return []; }
  }

  function carregarEdicao() {
    ed.perfis = new Set(conta.gosto.perfis); ed.publicos = new Set(conta.gosto.publicos); ed.notas = new Set(conta.gosto.notas);
    ed.usou = new Set(conta.usou); ed.desejos = new Set(conta.desejos); ed.naocurte = new Set(conta.naocurte || []);
    ed.marketing = Boolean(conta.consentimento.marketing); ed.whatsapp = conta.consentimento.whatsapp || '';
    sujo = false;
  }

  /* ---------- o gosto, deduzido do que a pessoa marcou e do carrinho ---------- */
  function gostoAutomatico() {
    const fam = {}, pub = {}, nota = {};
    const soma = (p, k) => {
      if (!p || ed.naocurte.has(p.id)) return;
      if (p.profile) fam[p.profile] = (fam[p.profile] || 0) + k;
      (p.tags || []).forEach((t) => {
        if (PUBLICOS.some((x) => x[0] === t)) pub[t] = (pub[t] || 0) + k;
        else if (NOTAS.includes(t)) nota[t] = (nota[t] || 0) + k;
      });
    };
    ed.usou.forEach((id) => soma(porId.get(id), 1));
    ed.desejos.forEach((id) => soma(porId.get(id), 1.5));
    carrinhoLocal().forEach((id) => soma(porId.get(id), 1.2));
    ed.perfis.forEach((k) => { fam[k] = (fam[k] || 0) + 2; });
    ed.publicos.forEach((k) => { pub[k] = (pub[k] || 0) + 2; });
    ed.notas.forEach((k) => { nota[k] = (nota[k] || 0) + 2; });
    const topo = (o, n, minimo) => { const itens = Object.entries(o).sort((a, b) => b[1] - a[1]); const m = itens.length ? itens[0][1] : 0; return itens.filter(([, v]) => v >= m * minimo).slice(0, n).map(([k]) => k); };
    return { familias: topo(fam, 3, 0.55), publicos: topo(pub, 2, 0.6), notas: topo(nota, 5, 0.5) };
  }
  function blocoGosto() {
    const g = gostoAutomatico();
    const noCarrinho = carrinhoLocal().filter((id) => !ed.naocurte.has(id)).map((id) => porId.get(id).name);
    const marcados = ed.usou.size + ed.desejos.size;
    if (!g.familias.length && !g.publicos.length && !g.notas.length) {
      return `<p class="gosto-vazio"><b>Ainda não sei do que você gosta.</b> Marque dois ou três perfumes que você já usou, ou que quer experimentar. O resto a gente deduz.</p>`;
    }
    const base = [];
    if (marcados) base.push(`${marcados} ${marcados === 1 ? 'perfume marcado' : 'perfumes marcados'}`);
    if (noCarrinho.length) base.push(`carrinho (${noCarrinho.join(', ')})`);
    return `<p class="gosto-linha">${g.familias.length ? `<b>${esc(g.familias.map(rotuloPerfil).join(', '))}</b>` : ''}${g.publicos.length ? `${g.familias.length ? ', ' : ''}${esc(g.publicos.map((k) => (PUBLICOS.find((x) => x[0] === k) || [])[1].toLowerCase()).join(' e '))}` : ''}.</p>
      ${g.notas.length ? `<p class="gosto-notas">${g.notas.map((n) => `<span class="gosto-chip">${esc(rotuloNota(n))}</span>`).join('')}</p>` : ''}
      ${base.length ? `<p class="gosto-base">Deduzido de: ${esc(base.join(' e '))}.</p>` : ''}`;
  }
  const atualizarGosto = () => { const el = $('gosto-auto'); if (el) el.innerHTML = blocoGosto(); };

  /* ---------- entrar ---------- */
  function desenharEntrar(clientId) {
    $('conta-app').innerHTML = `
      <div class="conta-card conta-entrar">
        <h2>Entrar</h2>
        <p class="conta-sub">Use a sua conta Google. A Sposence não recebe a sua senha.</p>
        ${clientId ? '<div id="g-botao" class="conta-g" aria-label="Entrar com o Google"></div>' : '<p class="conta-aviso">O login com Google estará disponível em breve.</p>'}
        <p class="conta-aviso" id="conta-msg" role="alert"></p>
        <ul class="conta-vantagens">
          <li>Marque os perfumes que já usou e a Sposence descobre o seu gosto sozinha.</li>
          <li>Receba indicações que combinam com você.</li>
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
    conta = d.conta; pedidos = d.pedidos || []; carregarEdicao(); entrouAgora(); desenharConta();
  }
  // deixa o carrinho das outras páginas avisar a conta, e já manda o carrinho que está neste aparelho
  function entrouAgora() {
    try { localStorage.setItem('sp_conta_on', '1'); } catch (_) {}
    const ids = carrinhoLocal();
    if (ids.join() !== (conta.carrinho || []).join()) chamar({ acao: 'salvar', carrinho: ids });
  }

  /* ---------- perfumes ---------- */
  const foto = (p) => encodeURI(p.image || '');
  function cartao(p) {
    const nao = ed.naocurte.has(p.id);
    const no = carrinhoLocal().includes(p.id);
    const b = (l, rotulo) => `<button type="button" class="pf-b" data-lista="${l}" data-id="${esc(p.id)}" aria-pressed="${ed[l].has(p.id)}">${rotulo}</button>`;
    return `<article class="pf${nao ? ' nao' : ''}">
      <div class="pf-foto" style="background-image:url('${foto(p)}')">
        <span class="pf-fam">${esc(rotuloPerfil(p.profile))}</span>${no ? '<span class="pf-car">No carrinho</span>' : ''}
        <button type="button" class="pf-x" data-lista="naocurte" data-id="${esc(p.id)}" aria-pressed="${nao}" aria-label="${nao ? 'Voltar a mostrar' : 'Não curto'} ${esc(p.name)}" title="${nao ? 'Desfazer' : 'Não curto'}">${nao ? '<i class="ph ph-arrow-counter-clockwise"></i>' : '<i class="ph ph-x"></i>'}</button>
      </div>
      <div class="pf-corpo"><b>${esc(p.name)}</b>${p.inspired_by ? `<small>inspirado em ${esc(p.inspired_by)}</small>` : ''}</div>
      <div class="pf-bot">${nao ? '<span class="pf-nao">Não curto</span>' : `${b('usou', 'Já usei')}${b('desejos', 'Quero')}`}</div>
    </article>`;
  }
  function listaPerfumes() {
    const q = normal(busca);
    const itens = PERFUMES.filter((p) => (!q || normal(p.name + ' ' + (p.inspired_by || '')).includes(q)) && (filtro === 'todos' || ed[filtro].has(p.id)));
    if (itens.length) return itens.map(cartao).join('');
    return filtro === 'todos' ? '<p class="conta-nota">Nenhum perfume encontrado.</p>'
      : '<div class="pf-vazio"><b>Nada por aqui ainda</b><span>Marque perfumes na aba Todos e eles aparecem aqui.</span></div>';
  }
  const abas = () => [['todos', 'Todos', PERFUMES.length], ['usou', 'Já usei', ed.usou.size], ['desejos', 'Quero', ed.desejos.size], ['naocurte', 'Não curto', ed.naocurte.size]]
    .map(([k, n, c]) => `<button type="button" class="cp-aba" data-aba="${k}" aria-pressed="${filtro === k}">${n} <small>${c}</small></button>`).join('');

  /* ---------- conta ---------- */
  const chip = (grupo, k, nome, ativo) => `<button type="button" class="conta-pill" data-grupo="${grupo}" data-k="${esc(k)}" aria-pressed="${ativo}">${esc(nome)}</button>`;
  const din = (n) => 'R$ ' + Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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

        <section class="conta-card gosto-card" aria-labelledby="t-gosto">
          <h2 id="t-gosto">O seu gosto</h2>
          <div id="gosto-auto" aria-live="polite">${blocoGosto()}</div>
          <details class="ajuste">
            <summary>Ajustar à mão</summary>
            <p class="conta-rotulo">Famílias olfativas</p><div class="conta-pills">${PERFIS.map(([k, n]) => chip('perfis', k, n, ed.perfis.has(k))).join('')}</div>
            <p class="conta-rotulo">Para quem</p><div class="conta-pills">${PUBLICOS.map(([k, n]) => chip('publicos', k, n, ed.publicos.has(k))).join('')}</div>
            <p class="conta-rotulo">Notas e momentos</p><div class="conta-pills">${NOTAS.map((k) => chip('notas', k, rotuloNota(k), ed.notas.has(k))).join('')}</div>
          </details>
        </section>

        <section class="conta-card" aria-labelledby="t-perfumes">
          <h2 id="t-perfumes">Seus perfumes</h2>
          <p class="conta-sub">Toque em <b>Já usei</b> ou <b>Quero</b>. Se não curte um, toque no X da foto.</p>
          <div class="cp-abas" id="cp-abas" role="group" aria-label="Filtrar a lista">${abas()}</div>
          <input id="conta-busca" type="search" class="conta-campo" placeholder="Buscar fragrância" aria-label="Buscar fragrância" value="${esc(busca)}" autocomplete="off" />
          <div class="pf-grade" id="conta-perfumes">${listaPerfumes()}</div>
        </section>

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
      usou: [...ed.usou], desejos: [...ed.desejos], naocurte: [...ed.naocurte], carrinho: carrinhoLocal(),
      consentimento: { marketing: ed.marketing, whatsapp: ed.whatsapp },
    });
    if (status === 401) { conta = null; iniciar(); return; }
    if (status !== 200) { $('conta-erro').textContent = d.erro || 'Não consegui salvar.'; $('conta-erro').scrollIntoView({ block: 'center', behavior: 'smooth' }); return; }
    conta = d.conta; carregarEdicao(); desenharConta(); aviso('Alterações salvas.');
  }

  function alternarLista(l, id) {
    const s = ed[l];
    if (s.has(id)) s.delete(id);
    else {
      s.add(id);
      if (l === 'naocurte') { ed.usou.delete(id); ed.desejos.delete(id); } else ed.naocurte.delete(id);
    }
  }
  const redesenharLista = () => { $('conta-perfumes').innerHTML = listaPerfumes(); $('cp-abas').innerHTML = abas(); };

  document.addEventListener('click', async (ev) => {
    const alvo = ev.target.closest('[data-grupo], [data-lista], [data-acao], [data-aba]');
    if (!alvo || !conta) return;
    const d = alvo.dataset;
    if (d.aba) { filtro = d.aba; redesenharLista(); return; }
    if (d.grupo) {
      const s = ed[d.grupo]; const k = d.k;
      s.has(k) ? s.delete(k) : s.add(k);
      alvo.setAttribute('aria-pressed', s.has(k)); marcarSujo(); atualizarGosto(); return;
    }
    if (d.lista) {
      alternarLista(d.lista, d.id);
      // sem refazer a grade inteira: só o cartão que mudou (a página não pula)
      const antigo = alvo.closest('.pf');
      const p = porId.get(d.id);
      const ficaNaLista = filtro === 'todos' || ed[filtro].has(d.id);
      if (ficaNaLista) { const t = document.createElement('div'); t.innerHTML = cartao(p); antigo.replaceWith(t.firstElementChild); } else antigo.remove();
      const ab = $('cp-abas'); if (ab) ab.innerHTML = abas();
      marcarSujo(); atualizarGosto(); return;
    }
    const acao = d.acao;
    if (acao === 'salvar') salvar();
    else if (acao === 'sair') { await chamar({ acao: 'sair' }); try { localStorage.removeItem('sp_conta_on'); } catch (_) {} conta = null; pedidos = []; iniciar(); }
    else if (acao === 'exportar') {
      const { status, d: dados } = await chamar({ acao: 'exportar' });
      if (status !== 200) { aviso(dados.erro || 'Não consegui baixar agora.'); return; }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([JSON.stringify(dados, null, 2)], { type: 'application/json' }));
      a.download = 'sposence-meus-dados.json'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }
    else if (acao === 'excluir') $('conta-excluir').showModal();
    else if (acao === 'cancelar') $('conta-excluir').close();
    else if (acao === 'confirmar-excluir') {
      const { status, d: dados } = await chamar({ acao: 'excluir' });
      if (status !== 200) { aviso(dados.erro || 'Não consegui excluir agora.'); return; }
      try { localStorage.removeItem('sp_conta_on'); } catch (_) {}
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
    $('conta-app').innerHTML = '<div class="conta-carregando" role="status" aria-label="Abrindo a sua conta"><span class="cc-linha"></span><span class="cc-linha cc-linha--curta"></span><span class="cc-bloco"></span></div>';
    try {
      const config = await fetch('/api/conta').then((r) => r.json());
      const { status, d } = await chamar({ acao: 'eu' });
      if (status === 200) { conta = d.conta; pedidos = d.pedidos || []; carregarEdicao(); entrouAgora(); desenharConta(); return; }
      try { localStorage.removeItem('sp_conta_on'); } catch (_) {}
      desenharEntrar(config.clientId);
    } catch (_) {
      $('conta-app').innerHTML = '<div class="conta-card"><h2>Sem conexão</h2><p class="conta-sub">Não consegui abrir a sua conta agora. Tente de novo em instantes.</p></div>';
    }
  }
  iniciar();
})();
