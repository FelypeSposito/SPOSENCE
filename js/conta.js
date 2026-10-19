// Minha conta: entrar com Google, perfil olfativo (jornada do "Seu frasco"), perfumes que já usou,
// quer experimentar ou não curte, consentimento de contato e direitos sobre os dados. Fala com /api/conta.
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const normal = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const aviso = (m) => { if (typeof showToast === 'function') showToast(m); };
  const reduzido = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- o que existe no catálogo ---------- */
  const FAM = [
    ['doces', 'Doces', 'Aconchego que abraça: baunilha, caramelo, pele quente.', '#daa753'],
    ['frescos', 'Frescos', 'Leveza de manhã cedo: cítricos, brisa, água.', '#b9ba86'],
    ['noturnos', 'Noturnos', 'Para quando a luz baixa: intensos, sedutores.', '#4a2509'],
    ['elegantes', 'Elegantes', 'Presença sem esforço: florais nobres, orientais.', '#6b6943'],
  ];
  const PERFIS = FAM.map((f) => [f[0], f[1]]);
  const PUBLICOS = [
    ['feminino', 'Femininos', 'ph-gender-female', 'Delicados, florais e envolventes.'],
    ['masculino', 'Masculinos', 'ph-gender-male', 'Marcantes, amadeirados e secos.'],
    ['compartilhavel', 'Unissex', 'ph-intersect', 'Sem rótulo: vale para quem usa.'],
  ];
  const ROTULO_NOTA = { citrico: 'Cítricos', amadeirado: 'Amadeirados', baunilha: 'Baunilha', gourmand: 'Gourmand', floral: 'Florais', amendoa: 'Amêndoa', aquatico: 'Aquáticos', dia: 'Para o dia', calor: 'Para o calor', oud: 'Oud', especiado: 'Especiados' };
  const PERFUMES = (typeof SPOSENCE_DATA !== 'undefined' ? SPOSENCE_DATA.perfumes : []).filter((p) => p.category === 'perfumes' || !p.category);
  const NOTAS = [...new Set(PERFUMES.flatMap((p) => p.tags || []).filter((t) => !PERFIS.some((x) => x[0] === t) && !PUBLICOS.some((x) => x[0] === t)))];
  const rotuloNota = (t) => ROTULO_NOTA[t] || t.charAt(0).toUpperCase() + t.slice(1);

  // sensações: agrupam as notas para a pessoa escolher em poucos toques
  const SENSACOES = [
    { k: 'leve', nome: 'Leve, para o dia', icone: 'ph-sun', notas: ['dia', 'calor', 'citrico', 'aquatico'], tam: 1.1 },
    { k: 'doce', nome: 'Doce e aconchegante', icone: 'ph-cookie', notas: ['baunilha', 'gourmand', 'amendoa'], tam: 1.25 },
    { k: 'flor', nome: 'Floral', icone: 'ph-flower', notas: ['floral', 'lavanda'], tam: 0.95 },
    { k: 'mata', nome: 'Amadeirado e verde', icone: 'ph-tree', notas: ['amadeirado', 'menta'], tam: 1.15 },
    { k: 'forte', nome: 'Marcante e especiado', icone: 'ph-fire', notas: ['couro', 'especiado'], tam: 1 },
    { k: 'premium', nome: 'Sedutor e premium', icone: 'ph-crown-simple', notas: ['sedutor', 'premium', 'oud', 'oriental', 'ambar'], tam: 1.35 },
  ].map((s) => ({ ...s, notas: s.notas.filter((n) => NOTAS.includes(n)) })).filter((s) => s.notas.length);

  let conta = null;
  let pedidos = [];
  let sujo = false;
  let busca = '';
  let abaLista = 'todos';
  let vista = 'painel';        // 'painel' | 'quiz'
  let passo = 0;               // passo atual da jornada
  let maxPasso = 0;
  let baralho = { lista: [], i: 0 };
  const ed = { perfis: new Set(), publicos: new Set(), notas: new Set(), usou: new Set(), desejos: new Set(), naocurte: new Set(), marketing: false, whatsapp: '' };

  const chamar = (corpo) => fetch('/api/conta', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) })
    .then((r) => r.json().catch(() => ({ erro: 'Resposta inesperada do servidor.' })).then((d) => ({ status: r.status, d })));

  function carregarEdicao() {
    ed.perfis = new Set(conta.gosto.perfis); ed.publicos = new Set(conta.gosto.publicos); ed.notas = new Set(conta.gosto.notas);
    ed.usou = new Set(conta.usou); ed.desejos = new Set(conta.desejos); ed.naocurte = new Set(conta.naocurte || []);
    ed.marketing = Boolean(conta.consentimento.marketing); ed.whatsapp = conta.consentimento.whatsapp || '';
    sujo = false;
  }
  const temPerfil = () => ed.perfis.size + ed.publicos.size + ed.notas.size + ed.usou.size + ed.desejos.size + ed.naocurte.size > 0;

  /* ---------- o frasco: líquido por camadas, uma para cada família ---------- */
  const CORPO = 'M30 34H70C70 44 86 48 86 70V122C86 134 78 144 66 144H34C22 144 14 134 14 122V70C14 48 30 44 30 34Z';
  const ONDA = 'M-100 0q12.5-5 25 0t25 0t25 0t25 0t25 0t25 0t25 0t25 0t25 0t25 0t25 0t25 0t25 0t25 0t25 0V30H-100Z';
  let seqFrasco = 0;
  function frasco(classe) {
    const id = 'fr' + (++seqFrasco);
    const camadas = FAM.slice().reverse().map((f) => `<rect class="f-liq" data-k="${f[0]}" x="0" y="0" width="100" height="160" fill="${f[3]}" style="transform:translateY(150px)"/>`).join('');
    return `<svg class="frasco ${classe || ''}" viewBox="0 0 100 150" aria-hidden="true" focusable="false">
      <defs><clipPath id="${id}"><path d="${CORPO}"/></clipPath></defs>
      <path class="f-vazio" d="${CORPO}"/>
      <g clip-path="url(#${id})">${camadas}<g class="f-ola" style="transform:translateY(150px)"><path d="${ONDA}"/></g></g>
      <path class="f-vidro" d="${CORPO}"/><rect class="f-pescoco" x="41" y="19" width="18" height="15" rx="2"/><rect class="f-tampa" x="35" y="3" width="30" height="17" rx="4"/><path class="f-brilho" d="M24 76V116"/></svg>`;
  }
  // pesos: { doces: 1, frescos: 2 ... } reparte o líquido entre as famílias
  function ajustarFrasco(el, pesos) {
    if (!el) return;
    const total = FAM.reduce((t, f) => t + (pesos[f[0]] || 0), 0);
    const altura = 92 * 0.9;
    let acumulado = 0;
    FAM.forEach((f) => {
      acumulado += total ? ((pesos[f[0]] || 0) / total) * altura : 0;
      const r = el.querySelector(`.f-liq[data-k="${f[0]}"]`);
      if (r) r.style.transform = `translateY(${total ? 144 - acumulado : 150}px)`;
    });
    const o = el.querySelector('.f-ola');
    if (o) o.style.transform = `translateY(${total ? 144 - altura - 1 : 150}px)`;
    el.classList.toggle('cheio', total > 0);
  }
  const pesosDoPerfil = () => { const p = {}; ed.perfis.forEach((k) => { p[k] = 1; }); return p; };
  function atualizarFrascosGrandes() {
    document.querySelectorAll('[data-frasco="perfil"]').forEach((el) => ajustarFrasco(el, pesosDoPerfil()));
    const t = $('qz-legenda'); if (t) t.innerHTML = legendaPerfil();
    document.querySelectorAll('.mf-legenda').forEach((el) => { el.innerHTML = legendaPerfil(); });
  }
  const aoProximoQuadro = (fn) => requestAnimationFrame(() => requestAnimationFrame(fn));

  const ativa = (s) => s.notas.filter((n) => ed.notas.has(n)).length >= Math.ceil(s.notas.length / 2);

  function legendaPerfil() {
    const fam = [...ed.perfis].map((k) => (PERFIS.find((x) => x[0] === k) || [])[1]).filter(Boolean);
    const pub = [...ed.publicos].map((k) => (PUBLICOS.find((x) => x[0] === k) || [])[1]).filter(Boolean);
    const sens = SENSACOES.filter((s) => ativa(s)).map((s) => s.nome);
    if (!fam.length && !pub.length && !sens.length) return '<span class="qz-vazio">Ainda vazio. Escolha um clima e ele começa a encher.</span>';
    const linhas = [];
    if (fam.length) linhas.push(`<b>${esc(fam.join(', '))}</b>`);
    if (pub.length) linhas.push(esc(pub.join(', ').toLowerCase()));
    if (sens.length) linhas.push(`<i>${esc(sens.slice(0, 3).join(', ').toLowerCase())}</i>`);
    return linhas.join('<br>');
  }

  /* ---------- afinidade, no navegador: só para ordenar o baralho e mostrar as indicações ---------- */
  function afinidade(p) {
    let ganho = 0, total = 0;
    const tags = p.tags || [];
    if (ed.perfis.size) { total += 3; if (ed.perfis.has(p.profile)) ganho += 3; }
    if (ed.publicos.size) { total += 2; if (tags.some((t) => ed.publicos.has(t))) ganho += 2; else if (tags.includes('compartilhavel')) ganho += 1.4; }
    if (ed.notas.size) {
      const notas = tags.filter((t) => NOTAS.includes(t));
      let ov = notas.filter((t) => ed.notas.has(t)).length;
      if ((p.featured || p.is_special_edition) && ed.notas.has('premium')) ov += 1;
      total += 3; ganho += 3 * Math.min(1, ov / Math.min(2, ed.notas.size));
    }
    return total ? Math.round((ganho / total) * 100) : 0;
  }
  const motivosDe = (p) => {
    const m = [];
    if (ed.perfis.has(p.profile)) m.push(((PERFIS.find((x) => x[0] === p.profile) || [])[1] || '').toLowerCase());
    (p.tags || []).filter((t) => ed.notas.has(t)).slice(0, 2).forEach((t) => m.push(rotuloNota(t).toLowerCase()));
    if ((p.featured || p.is_special_edition) && ed.notas.has('premium') && !m.includes('premium')) m.push('premium');
    return m.slice(0, 3);
  };
  const foto = (p) => encodeURI(p.image || '');
  const notasDe = (p) => { const n = p.notes || {}; return [n.top, n.heart, n.base].filter(Boolean).map((x) => String(x).split(',')[0].trim()).join(', '); };
  function indicacoes() {
    return PERFUMES.filter((p) => !ed.naocurte.has(p.id) && !ed.usou.has(p.id)).map((p) => ({ p, pts: afinidade(p) + (ed.desejos.has(p.id) ? 12 : 0) })).sort((a, b) => b.pts - a.pts).slice(0, 3);
  }

  /* ---------- entrar ---------- */
  function desenharEntrar(clientId) {
    $('conta-app').innerHTML = `
      <div class="conta-card conta-entrar">
        <div class="entrar-frasco">${frasco('frasco--entrar')}</div>
        <h2>Entrar</h2>
        <p class="conta-sub">Use a sua conta Google. A Sposence não recebe a sua senha.</p>
        ${clientId ? '<div id="g-botao" class="conta-g" aria-label="Entrar com o Google"></div>' : '<p class="conta-aviso">O login com Google estará disponível em breve.</p>'}
        <p class="conta-aviso" id="conta-msg" role="alert"></p>
        <ul class="conta-vantagens">
          <li>Monte o seu frasco: em um minuto a Sposence aprende o seu gosto.</li>
          <li>Marque os perfumes que já usou, os que quer experimentar e os que não curte.</li>
          <li>Veja os seus pedidos, depois que a Sposence confirmar que a conta é sua.</li>
          <li>Baixe ou apague os seus dados quando quiser.</li>
        </ul>
        <p class="conta-nota">Ao entrar, você concorda com a <a href="privacidade.html">política de privacidade</a>. Receber novidades é opcional e começa desmarcado.</p>
      </div>`;
    const f = document.querySelector('.frasco--entrar');
    if (f) { ajustarFrasco(f, {}); aoProximoQuadro(() => ajustarFrasco(f, { doces: 1, frescos: 1, noturnos: 1, elegantes: 1 })); }
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
    conta = d.conta; pedidos = d.pedidos || []; carregarEdicao(); abrirInicio();
  }
  function abrirInicio() {
    if (temPerfil()) desenharConta(); else { maxPasso = 0; iniciarQuiz(0); }
  }

  /* =========================================================================================
     JORNADA: clima, para quem, sensações, perfumes, resultado
     ========================================================================================= */
  const PASSOS = ['Clima', 'Para quem', 'Sensações', 'Perfumes', 'Seu frasco'];
  const rolarParaApp = () => window.scrollTo({ top: Math.max(0, ($('conta-app').getBoundingClientRect().top + window.scrollY) - 90), behavior: reduzido ? 'auto' : 'smooth' });

  function iniciarQuiz(p) {
    vista = 'quiz'; passo = p; maxPasso = Math.max(maxPasso, p);
    $('conta-app').innerHTML = `
      <div class="qz">
        <aside class="qz-lado">
          <div class="qz-frasco">${frasco('frasco--grande')}</div>
          <p class="qz-titulo-lado">Seu frasco</p>
          <p class="qz-legenda" id="qz-legenda" aria-live="polite">${legendaPerfil()}</p>
          <ol class="qz-passos" id="qz-passos"></ol>
        </aside>
        <div class="qz-palco" id="qz-palco"></div>
      </div>`;
    const g = document.querySelector('.qz .frasco');
    g.dataset.frasco = 'perfil';
    ajustarFrasco(g, {});
    aoProximoQuadro(() => ajustarFrasco(g, pesosDoPerfil()));
    desenharPasso(true);
    rolarParaApp();
  }

  function desenharPassos() {
    $('qz-passos').innerHTML = PASSOS.map((n, i) => `<li><button type="button" data-ir="${i}" class="${i === passo ? 'atual' : ''}${i < passo ? ' feito' : ''}"${i > maxPasso ? ' disabled' : ''}${i === passo ? ' aria-current="step"' : ''}><span class="n">${i < passo ? '<i class="ph ph-check"></i>' : i + 1}</span><span class="t">${n}</span></button></li>`).join('');
  }

  const cabecaPasso = (n, titulo, texto) => `<header class="qz-cab"><p class="qz-n">Passo ${n} de ${PASSOS.length}</p><h2>${titulo}</h2>${texto ? `<p class="conta-sub">${texto}</p>` : ''}</header>`;
  const rodapePasso = (extra) => `<footer class="qz-rodape">
    ${passo > 0 ? '<button type="button" class="qz-voltar" data-nav="volta"><i class="ph ph-arrow-left"></i> Voltar</button>' : '<span></span>'}
    <div class="qz-dir">${extra || ''}</div></footer>`;
  const botaoProx = (rotulo) => `<button type="button" class="h-btn h-btn--primary" data-nav="prox"><span>${rotulo || 'Continuar'}</span> <i class="ph ph-arrow-right"></i></button>`;

  function passoClima() {
    return `${cabecaPasso(1, 'Que clima é o seu?', 'Toque em quantos quiser. O frasco enche com o que combina com você.')}
      <div class="qz-fam">${FAM.map(([k, nome, frase, cor], i) => {
        const exemplos = PERFUMES.filter((p) => p.profile === k).slice(0, 2).map((p) => p.name).join(', ');
        return `<button type="button" class="fam" data-q="perfis" data-k="${k}" aria-pressed="${ed.perfis.has(k)}" style="--cor:${cor};--i:${i}">
          ${frasco('frasco--mini')}<span class="fam-txt"><b>${nome}</b><span>${frase}</span>${exemplos ? `<small>${esc(exemplos)}</small>` : ''}</span><i class="ph ph-check-circle fam-ok"></i></button>`;
      }).join('')}</div>
      ${rodapePasso(botaoProx(ed.perfis.size ? 'Continuar' : 'Pular'))}`;
  }
  function passoPublico() {
    return `${cabecaPasso(2, 'Para quem você perfuma?', 'Pode marcar mais de um.')}
      <div class="qz-pub">${PUBLICOS.map(([k, nome, ic, frase], i) => `<button type="button" class="pub" data-q="publicos" data-k="${k}" aria-pressed="${ed.publicos.has(k)}" style="--i:${i}">
        <i class="ph ${ic} pub-ic"></i><b>${nome}</b><span>${frase}</span></button>`).join('')}</div>
      ${rodapePasso(botaoProx(ed.publicos.size ? 'Continuar' : 'Pular'))}`;
  }
  function passoSensacoes() {
    return `${cabecaPasso(3, 'O que te atrai?', 'Escolha as sensações que mais te puxam. Cada uma reúne várias notas.')}
      <div class="qz-bolhas">${SENSACOES.map((s, i) => `<button type="button" class="bolha" data-q="sens" data-k="${s.k}" aria-pressed="${ativa(s)}" style="--t:${s.tam};--i:${i}"><i class="ph ${s.icone}"></i><span>${s.nome}</span></button>`).join('')}</div>
      ${rodapePasso(botaoProx(SENSACOES.some(ativa) ? 'Continuar' : 'Pular'))}`;
  }

  /* ----- baralho de perfumes ----- */
  function montarBaralho() {
    const marcados = new Set([...ed.usou, ...ed.desejos, ...ed.naocurte]);
    baralho = { lista: PERFUMES.filter((p) => !marcados.has(p.id)).sort((a, b) => afinidade(b) - afinidade(a)), i: 0 };
  }
  function cartaBaralho(p, camada) {
    const m = motivosDe(p);
    const fam = (PERFIS.find((x) => x[0] === p.profile) || [])[1] || '';
    return `<article class="carta carta--${camada}" ${camada === 0 ? 'data-topo' : ''} aria-hidden="${camada !== 0}">
      <div class="carta-foto" style="background-image:url('${foto(p)}')"></div>
      <div class="carta-sel carta-sel--quero"><i class="ph ph-heart"></i> Quero</div>
      <div class="carta-sel carta-sel--nao"><i class="ph ph-x"></i> Não curto</div>
      <div class="carta-sel carta-sel--usei"><i class="ph ph-check"></i> Já usei</div>
      <div class="carta-info"><span class="carta-fam">${esc(fam)}</span><h3>${esc(p.name)}</h3>
        ${p.inspired_by ? `<p>inspirado em ${esc(p.inspired_by)}</p>` : ''}
        <p class="carta-notas">${esc(notasDe(p))}</p>
        ${m.length ? `<p class="carta-comb"><i class="ph ph-sparkle"></i> combina com ${esc(m.join(', '))}</p>` : ''}</div></article>`;
  }
  function desenharBaralho() {
    const el = $('qz-baralho'); if (!el) return;
    const { lista, i } = baralho;
    const restantes = lista.length - i;
    $('qz-contagem').textContent = restantes > 0 ? `${i + 1} de ${lista.length}` : 'Acabaram as cartas';
    document.querySelectorAll('.deck-botoes button, .qz-pular').forEach((b) => { b.disabled = restantes <= 0; });
    if (restantes <= 0) {
      el.innerHTML = '<div class="carta-fim"><i class="ph ph-drop"></i><b>Você viu todos os perfumes.</b><span>Agora veja o seu frasco pronto.</span></div>';
      return;
    }
    const proxima = lista[i + 1];
    el.innerHTML = `${proxima ? cartaBaralho(proxima, 1) : ''}${cartaBaralho(lista[i], 0)}`;
    ligarArrasto(el.querySelector('[data-topo]'));
  }
  function passoPerfumes() {
    montarBaralho();
    return `${cabecaPasso(4, 'Já cruzou com algum destes?', 'Arraste a carta ou use os botões. Direita: quero. Esquerda: não curto. Para cima: já usei.')}
      <div class="qz-deck"><p class="qz-contagem" id="qz-contagem"></p><div class="baralho" id="qz-baralho"></div>
        <div class="deck-botoes">
          <button type="button" class="db db--nao" data-deck="naocurte" aria-label="Não curto"><i class="ph ph-x"></i><span>Não curto</span></button>
          <button type="button" class="db db--usei" data-deck="usou" aria-label="Já usei"><i class="ph ph-check"></i><span>Já usei</span></button>
          <button type="button" class="db db--quero" data-deck="desejos" aria-label="Quero experimentar"><i class="ph ph-heart"></i><span>Quero</span></button>
        </div><button type="button" class="qz-pular" data-deck="pular">Pular este</button></div>
      ${rodapePasso(botaoProx('Ver meu frasco'))}`;
  }

  function ligarArrasto(carta) {
    if (!carta) return;
    let x0 = 0, y0 = 0, arrastando = false, dx = 0, dy = 0;
    const aplicar = () => {
      carta.style.transform = `translate(${dx}px,${dy}px) rotate(${dx / 18}deg)`;
      carta.style.setProperty('--quero', Math.max(0, Math.min(1, dx / 110)));
      carta.style.setProperty('--nao', Math.max(0, Math.min(1, -dx / 110)));
      carta.style.setProperty('--usei', Math.max(0, Math.min(1, -dy / 110)));
    };
    carta.addEventListener('pointerdown', (ev) => { arrastando = true; x0 = ev.clientX; y0 = ev.clientY; carta.setPointerCapture(ev.pointerId); carta.classList.add('arrastando'); });
    carta.addEventListener('pointermove', (ev) => { if (!arrastando) return; dx = ev.clientX - x0; dy = Math.min(0, ev.clientY - y0); aplicar(); });
    const soltar = () => {
      if (!arrastando) return; arrastando = false; carta.classList.remove('arrastando');
      if (dx > 110) decidir('desejos'); else if (dx < -110) decidir('naocurte'); else if (dy < -110) decidir('usou');
      else { dx = 0; dy = 0; aplicar(); }
    };
    carta.addEventListener('pointerup', soltar); carta.addEventListener('pointercancel', soltar);
  }

  let decidindo = false;
  function decidir(acao) {
    const p = baralho.lista[baralho.i]; if (!p || decidindo) return;
    const carta = document.querySelector('#qz-baralho [data-topo]');
    if (acao === 'usou') { ed.usou.add(p.id); ed.naocurte.delete(p.id); }
    else if (acao === 'desejos') { ed.desejos.add(p.id); ed.naocurte.delete(p.id); }
    else if (acao === 'naocurte') { ed.naocurte.add(p.id); ed.usou.delete(p.id); ed.desejos.delete(p.id); }
    if (acao !== 'pular') sujo = true;
    const saida = { desejos: 'translate(130%, -10%) rotate(14deg)', naocurte: 'translate(-130%, -10%) rotate(-14deg)', usou: 'translate(0, -130%)', pular: 'translate(0, 40%) scale(.9)' }[acao];
    const seguir = () => { baralho.i += 1; decidindo = false; desenharBaralho(); };
    if (carta && !reduzido) { decidindo = true; carta.classList.add('saindo'); carta.style.transform = saida; carta.style.opacity = '0'; setTimeout(seguir, 260); } else seguir();
  }

  /* ----- resultado ----- */
  function passoResultado() {
    const ind = indicacoes();
    return `${cabecaPasso(5, 'Seu frasco está pronto.', 'É assim que a Sposence passa a enxergar o seu gosto. Você muda quando quiser.')}
      <div class="qz-res">
        <div class="res-resumo"><p class="conta-rotulo" style="margin-top:0">Você curte</p><p class="res-linha">${legendaPerfil()}</p>
          <p class="res-nums"><span><b>${ed.usou.size}</b> já usou</span><span><b>${ed.desejos.size}</b> quer experimentar</span><span><b>${ed.naocurte.size}</b> não curte</span></p></div>
        ${ind.length ? `<div><p class="conta-rotulo" style="margin-top:0">Para começar a experimentar</p><ul class="res-lista">${ind.map(({ p, pts }, i) => `<li style="--i:${i}"><span class="res-foto" style="background-image:url('${foto(p)}')"></span><div><b>${esc(p.name)}</b><small>${esc(motivosDe(p).length ? 'combina com ' + motivosDe(p).join(', ') : (p.inspired_by ? 'inspirado em ' + p.inspired_by : ''))}</small></div><span class="res-pts">${Math.min(99, pts)}</span></li>`).join('')}</ul></div>` : ''}
      </div>
      <p class="conta-erro" id="conta-erro" role="alert"></p>
      ${rodapePasso('<button type="button" class="h-btn h-btn--primary" data-acao="salvar-quiz"><span>Salvar o meu perfil</span> <i class="ph ph-check"></i></button>')}`;
  }

  function desenharPasso(primeira) {
    const palco = $('qz-palco'); if (!palco) return;
    palco.classList.remove('entra'); void palco.offsetWidth;
    palco.innerHTML = [passoClima, passoPublico, passoSensacoes, passoPerfumes, passoResultado][passo]();
    palco.classList.add('entra');
    desenharPassos();
    if (passo === 0) palco.querySelectorAll('.fam').forEach((b) => { const f = b.querySelector('.frasco'); ajustarFrasco(f, {}); if (b.getAttribute('aria-pressed') === 'true') aoProximoQuadro(() => ajustarFrasco(f, { [b.dataset.k]: 1 })); });
    if (passo === 3) desenharBaralho();
    if (!primeira) rolarParaApp();
  }
  function irPara(n) { passo = Math.max(0, Math.min(PASSOS.length - 1, n)); maxPasso = Math.max(maxPasso, passo); desenharPasso(); }

  function alternar(grupo, k, btn) {
    if (grupo === 'sens') {
      const s = SENSACOES.find((x) => x.k === k); const liga = !ativa(s);
      s.notas.forEach((n) => (liga ? ed.notas.add(n) : ed.notas.delete(n)));
      btn.setAttribute('aria-pressed', liga);
    } else {
      const set = ed[grupo]; set.has(k) ? set.delete(k) : set.add(k);
      btn.setAttribute('aria-pressed', set.has(k));
      if (grupo === 'perfis') ajustarFrasco(btn.querySelector('.frasco'), set.has(k) ? { [k]: 1 } : {});
    }
    sujo = true;
    atualizarFrascosGrandes();
    const prox = document.querySelector('[data-nav="prox"] span');
    if (prox) prox.textContent = (grupo === 'sens' ? SENSACOES.some(ativa) : ed[grupo].size > 0) ? 'Continuar' : 'Pular';
  }

  /* =========================================================================================
     PAINEL: quem já montou o perfil
     ========================================================================================= */
  const chip = (grupo, k, nome, ativo) => `<button type="button" class="conta-pill" data-grupo="${grupo}" data-k="${esc(k)}" aria-pressed="${ativo}">${esc(nome)}</button>`;
  const din = (n) => 'R$ ' + Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  function linhaPerfume(p) {
    const b = (l, rotulo, ic) => `<button type="button" class="cp-b cp-b--${l}" data-lista="${l}" data-id="${esc(p.id)}" aria-pressed="${ed[l].has(p.id)}" aria-label="${rotulo}: ${esc(p.name)}"><i class="ph ${ic}"></i><span>${rotulo}</span></button>`;
    return `<div class="cp-linha${ed.naocurte.has(p.id) ? ' nao' : ''}"><span class="cp-foto" style="background-image:url('${foto(p)}')"></span>
      <div class="cp-nome"><b>${esc(p.name)}</b>${p.inspired_by ? `<small>inspirado em ${esc(p.inspired_by)}</small>` : ''}</div>
      <div class="cp-botoes">${b('usou', 'Já usei', 'ph-check')}${b('desejos', 'Quero', 'ph-heart')}${b('naocurte', 'Não curto', 'ph-x')}</div></div>`;
  }
  function listaPerfumes() {
    const q = normal(busca);
    const itens = PERFUMES.filter((p) => (!q || normal(p.name + ' ' + (p.inspired_by || '')).includes(q)) && (abaLista === 'todos' || ed[abaLista].has(p.id)));
    if (itens.length) return itens.map(linhaPerfume).join('');
    return abaLista === 'todos' && q ? '<p class="conta-nota">Nenhum perfume encontrado.</p>'
      : '<div class="cp-vazio"><i class="ph ph-drop"></i><b>Nada por aqui ainda</b><span>Marque perfumes na aba Todos ou toque em Descobrir perfumes.</span></div>';
  }
  const abasLista = () => [['todos', 'Todos', PERFUMES.length], ['usou', 'Já usei', ed.usou.size], ['desejos', 'Quero', ed.desejos.size], ['naocurte', 'Não curto', ed.naocurte.size]]
    .map(([k, n, c]) => `<button type="button" class="cp-aba" data-aba="${k}" aria-pressed="${abaLista === k}">${n} <small>${c}</small></button>`).join('');

  function desenharConta() {
    vista = 'painel';
    const c = conta;
    const aceitou = c.consentimento.marketing && c.consentimento.data;
    const ind = indicacoes();
    $('conta-app').innerHTML = `
      <div class="conta-wrap">
        <div class="conta-card conta-topo">
          ${c.foto ? `<img class="conta-foto" src="${esc(c.foto)}" alt="" referrerpolicy="no-referrer" width="56" height="56">` : '<span class="conta-foto conta-foto--vazia" aria-hidden="true"></span>'}
          <div><h2>Olá, ${esc((c.nome || '').split(' ')[0])}</h2><p class="conta-sub">${esc(c.email)}</p></div>
          <button type="button" class="h-btn h-btn--ghost conta-sair" data-acao="sair">Sair</button>
        </div>

        <div class="painel-grade">
          <section class="conta-card meu-frasco">
            <div class="mf-vidro">${frasco('frasco--grande')}</div>
            <div class="mf-txt">
              <p class="conta-rotulo" style="margin-top:0">Seu frasco</p>
              <p class="mf-legenda">${legendaPerfil()}</p>
              ${ind.length ? `<p class="conta-rotulo">Para experimentar</p><ul class="mf-ind">${ind.map(({ p }) => `<li><span class="res-foto" style="background-image:url('${foto(p)}')"></span><b>${esc(p.name)}</b></li>`).join('')}</ul>` : ''}
              <div class="conta-acoes" style="margin-top:1.1rem">
                <button type="button" class="h-btn h-btn--primary" data-acao="descobrir"><span>Descobrir perfumes</span> <i class="ph ph-arrow-right"></i></button>
                <button type="button" class="h-btn h-btn--ghost" data-acao="refazer"><i class="ph ph-arrow-counter-clockwise"></i> <span>Refazer o perfil</span></button>
              </div>
            </div>
          </section>

          <section class="conta-card meus-perfumes">
            <h2>Seus perfumes</h2>
            <p class="conta-sub">Já usou, quer experimentar ou não curte: as indicações se ajustam a cada marca.</p>
            <div class="cp-abas" id="cp-abas" role="group" aria-label="Filtrar a lista">${abasLista()}</div>
            <input id="conta-busca" type="search" class="conta-campo" placeholder="Buscar fragrância" aria-label="Buscar fragrância" value="${esc(busca)}" autocomplete="off" />
            <div class="cp-lista" id="conta-perfumes">${listaPerfumes()}</div>
          </section>
        </div>

        <details class="conta-card ajuste">
          <summary><span><b>Ajustar o que você curte</b><small>Famílias, para quem e notas, uma a uma</small></span><i class="ph ph-caret-down"></i></summary>
          <p class="conta-rotulo">Famílias olfativas</p><div class="conta-pills">${PERFIS.map(([k, n]) => chip('perfis', k, n, ed.perfis.has(k))).join('')}</div>
          <p class="conta-rotulo">Para quem</p><div class="conta-pills">${PUBLICOS.map(([k, n]) => chip('publicos', k, n, ed.publicos.has(k))).join('')}</div>
          <p class="conta-rotulo">Notas e momentos</p><div class="conta-pills">${NOTAS.map((k) => chip('notas', k, rotuloNota(k), ed.notas.has(k))).join('')}</div>
        </details>

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
    const g = document.querySelector('.meu-frasco .frasco');
    g.dataset.frasco = 'perfil'; ajustarFrasco(g, {});
    aoProximoQuadro(() => ajustarFrasco(g, pesosDoPerfil()));
  }

  const marcarSujo = () => { sujo = true; const b = $('conta-barra'); if (b) b.hidden = false; };

  async function salvar(deQuiz) {
    const erroEl = $('conta-erro'); if (erroEl) erroEl.textContent = '';
    const { status, d } = await chamar({
      acao: 'salvar',
      gosto: { perfis: [...ed.perfis], publicos: [...ed.publicos], notas: [...ed.notas] },
      usou: [...ed.usou], desejos: [...ed.desejos], naocurte: [...ed.naocurte],
      consentimento: { marketing: ed.marketing, whatsapp: ed.whatsapp },
    });
    if (status === 401) { conta = null; iniciar(); return; }
    if (status !== 200) { const e = $('conta-erro'); if (e) { e.textContent = d.erro || 'Não consegui salvar.'; e.scrollIntoView({ block: 'center', behavior: 'smooth' }); } return; }
    conta = d.conta; carregarEdicao(); desenharConta(); aviso(deQuiz ? 'Perfil salvo. Já estamos de olho nas suas indicações.' : 'Alterações salvas.');
    if (deQuiz) window.scrollTo({ top: 0, behavior: reduzido ? 'auto' : 'smooth' });
  }

  function alternarLista(l, id) {
    const s = ed[l];
    if (s.has(id)) s.delete(id);
    else {
      s.add(id);
      if (l === 'naocurte') { ed.usou.delete(id); ed.desejos.delete(id); } else ed.naocurte.delete(id);
    }
  }

  document.addEventListener('click', async (ev) => {
    if (!conta) return;
    const alvo = ev.target.closest('[data-grupo], [data-lista], [data-acao], [data-q], [data-nav], [data-ir], [data-deck], [data-aba]');
    if (!alvo) return;
    const d = alvo.dataset;
    if (d.q) { alternar(d.q, d.k, alvo); return; }
    if (d.nav) { irPara(passo + (d.nav === 'prox' ? 1 : -1)); return; }
    if (d.ir !== undefined) { irPara(Number(d.ir)); return; }
    if (d.deck) { decidir(d.deck); return; }
    if (d.aba) { abaLista = d.aba; $('conta-perfumes').innerHTML = listaPerfumes(); document.querySelectorAll('.cp-aba').forEach((b) => b.setAttribute('aria-pressed', b.dataset.aba === abaLista)); return; }
    if (d.grupo) {
      const s = ed[d.grupo]; const k = d.k;
      s.has(k) ? s.delete(k) : s.add(k);
      alvo.setAttribute('aria-pressed', s.has(k)); marcarSujo(); atualizarFrascosGrandes(); return;
    }
    if (d.lista) {
      alternarLista(d.lista, d.id);
      const linha = alvo.closest('.cp-linha');
      linha.querySelectorAll('.cp-b').forEach((b) => b.setAttribute('aria-pressed', ed[b.dataset.lista].has(d.id)));
      linha.classList.toggle('nao', ed.naocurte.has(d.id));
      const abas = $('cp-abas'); if (abas) abas.innerHTML = abasLista();
      if (abaLista !== 'todos' && !ed[abaLista].has(d.id)) linha.remove();
      marcarSujo(); return;
    }
    const acao = d.acao;
    if (acao === 'salvar') salvar(false);
    else if (acao === 'salvar-quiz') salvar(true);
    else if (acao === 'descobrir') { maxPasso = 3; iniciarQuiz(3); }
    else if (acao === 'refazer') { maxPasso = 0; iniciarQuiz(0); }
    else if (acao === 'sair') { await chamar({ acao: 'sair' }); conta = null; pedidos = []; iniciar(); }
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
  // teclado no baralho: setas decidem, para quem não arrasta
  document.addEventListener('keydown', (ev) => {
    if (vista !== 'quiz' || passo !== 3 || !document.querySelector('#qz-baralho [data-topo]') || /INPUT|TEXTAREA|BUTTON/.test(ev.target.tagName)) return;
    const mapa = { ArrowRight: 'desejos', ArrowLeft: 'naocurte', ArrowUp: 'usou', ArrowDown: 'pular' };
    if (mapa[ev.key]) { ev.preventDefault(); decidir(mapa[ev.key]); }
  });

  /* ---------- início ---------- */
  async function iniciar() {
    $('conta-app').innerHTML = '<div class="conta-carregando" role="status" aria-label="Abrindo a sua conta"><span class="cc-linha"></span><span class="cc-linha cc-linha--curta"></span><span class="cc-bloco"></span></div>';
    try {
      const config = await fetch('/api/conta').then((r) => r.json());
      const { status, d } = await chamar({ acao: 'eu' });
      if (status === 200) { conta = d.conta; pedidos = d.pedidos || []; carregarEdicao(); abrirInicio(); return; }
      desenharEntrar(config.clientId);
    } catch (_) {
      $('conta-app').innerHTML = '<div class="conta-card"><h2>Sem conexão</h2><p class="conta-sub">Não consegui abrir a sua conta agora. Tente de novo em instantes.</p></div>';
    }
  }
  iniciar();
})();
