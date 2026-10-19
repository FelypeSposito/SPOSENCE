// Clientes da Sposence: tudo é calculado a partir dos pedidos, sem cadastro à parte.
//
// - Cada cliente é identificado pelo WhatsApp (ou, sem telefone, pelo nome).
// - O perfil olfativo vem das fragrâncias que a pessoa comprou (perfil e notas de js/data.js).
// - A afinidade com uma fragrância é um score de 0 a 100, explicável:
//     85% quanto das características da fragrância (perfil, público, notas) a pessoa já aprecia,
//         dando mais peso ao que ela comprou recentemente; quesitos sem dado da pessoa não contam contra
//     15% sinal de "clientes parecidos": o que as pessoas de gosto próximo também compraram
//   Se a pessoa já tem a fragrância, o score cai pela metade (ela provavelmente quer algo novo).
// - Recompra: compara os dias desde a última compra com o intervalo habitual da própria pessoa
//   (ou 45 dias, quando só comprou uma vez).
//
// Não é "aprendizado de máquina" de verdade: com poucas dezenas de clientes, um modelo treinado só decoraria
// ruído. Este score é transparente e já usa os mesmos dados que um modelo usaria depois, quando houver volume.
import crypto from 'node:crypto';
import { todos, hojeSP, disponivel } from './_estoque.js';

const PERFIS = ['frescos', 'doces', 'noturnos', 'elegantes'];
const PUBLICOS = ['feminino', 'masculino', 'compartilhavel'];
const MEIA_VIDA_DIAS = 240;       // uma compra de 8 meses atrás vale metade
const INTERVALO_PADRAO = 45;      // dias, para quem comprou uma vez só
const CARENCIA_CONTATO = 14;      // não sugere chamar quem foi chamado há menos que isso

const normal = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const limpar = (s, max = 300) => String(s ?? '').replace(/[<>"`\\]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
const difDias = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
const erro = (msg, status = 400) => Object.assign(new Error(msg), { status });

const ROTULOS = {
  'perfil:frescos': 'perfumes frescos', 'perfil:doces': 'perfumes doces', 'perfil:noturnos': 'perfumes noturnos', 'perfil:elegantes': 'perfumes elegantes',
  'publico:feminino': 'perfumes femininos', 'publico:masculino': 'perfumes masculinos', 'publico:compartilhavel': 'perfumes unissex',
  'nota:citrico': 'notas cítricas', 'nota:baunilha': 'baunilha', 'nota:amadeirado': 'notas amadeiradas', 'nota:gourmand': 'gourmand',
  'nota:floral': 'florais', 'nota:aquatico': 'notas aquáticas', 'nota:calor': 'perfumes para o calor', 'nota:dia': 'perfumes de dia',
  'nota:amendoa': 'amêndoa', 'nota:oud': 'oud', 'nota:especiado': 'notas especiadas',
};
const rotuloDe = (f) => ROTULOS[f] || `notas ${f.split(':')[1]}`;

// ---------- vetores de características ----------
export function featuresProduto(p) {
  const f = {};
  if (p.profile) f[`perfil:${p.profile}`] = 2;
  for (const t of p.tags || []) {
    if (PERFIS.includes(t)) continue;
    if (PUBLICOS.includes(t)) f[`publico:${t}`] = 1.5;
    else f[`nota:${t}`] = 1;
  }
  return f;
}
const soma = (a, b, k = 1) => { for (const [f, v] of Object.entries(b)) a[f] = (a[f] || 0) + v * k; };
const norma = (v) => Math.sqrt(Object.values(v).reduce((t, x) => t + x * x, 0));
function cosseno(a, b) {
  const na = norma(a), nb = norma(b);
  if (!na || !nb) return 0;
  let p = 0;
  for (const [f, v] of Object.entries(a)) if (b[f]) p += v * b[f];
  return p / (na * nb);
}

// ---------- clientes a partir dos pedidos ----------
export function clientesInternos(e, contas = []) {
  const hoje = hojeSP();
  const lista = todos(e);
  const porId = new Map(lista.map((p) => [p.id, p]));
  const porNome = new Map(lista.map((p) => [normal(p.name), p]));
  const mapa = new Map();

  for (const ped of e.pedidos) {
    if (ped.status === 'cancelado') continue;
    const c = ped.cliente || {};
    const digitos = String(c.telefone || '').replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '');
    const chave = digitos.length >= 10 ? `t:${digitos}` : (normal(c.nome) ? `n:${normal(c.nome)}` : null);
    if (!chave) continue;
    const id = 'c' + crypto.createHash('sha1').update(chave).digest('hex').slice(0, 8);
    const x = mapa.get(id) || { id, nome: '', telefone: '', tel: digitos.length >= 10 ? digitos : '', pedidos: [], gasto: 0, perfilQtd: {}, notaQtd: {}, compras: new Map(), vetor: {}, comprou: new Set() };
    if (c.nome) x.nome = c.nome;
    if (c.telefone) x.telefone = c.telefone;
    const data = String(ped.criado).slice(0, 10);
    const dias = Math.max(0, difDias(data, hoje));
    const recencia = Math.pow(0.5, dias / MEIA_VIDA_DIAS);
    x.pedidos.push({ id: ped.id, numero: ped.numero, data, total: ped.total, status: ped.status, itens: ped.itens.map((i) => `${i.qtd}× ${i.nome}${i.variante ? ' ' + i.variante : ''}`) });
    x.gasto += ped.total;
    for (const it of ped.itens) {
      const prod = (it.produto_id && porId.get(it.produto_id)) || porNome.get(normal(it.nome));
      const chaveProd = prod ? prod.id : `nome:${normal(it.nome)}`;
      const atual = x.compras.get(chaveProd) || { nome: prod ? prod.name : it.nome, qtd: 0, ultima: data };
      atual.qtd += it.qtd; if (data > atual.ultima) atual.ultima = data;
      x.compras.set(chaveProd, atual);
      if (prod && prod.category === 'perfumes') {
        x.comprou.add(prod.id);
        const f = featuresProduto(prod);
        soma(x.vetor, f, it.qtd * recencia);
        if (prod.profile) x.perfilQtd[prod.profile] = (x.perfilQtd[prod.profile] || 0) + it.qtd;
        for (const t of prod.tags || []) if (!PERFIS.includes(t) && !PUBLICOS.includes(t)) x.notaQtd[t] = (x.notaQtd[t] || 0) + it.qtd;
      }
    }
    mapa.set(id, x);
  }

  const extras = e.clientes_extra || {};
  const porSub = new Map(contas.map((c) => [c.sub, c]));
  const porTel = new Map(contas.map((c) => [digitosTel(c.consentimento && c.consentimento.whatsapp), c]).filter(([t]) => t));
  const clientes = [...mapa.values()].map((x) => {
    x.pedidos.sort((a, b) => a.data.localeCompare(b.data) || a.numero - b.numero);
    const datas = x.pedidos.map((p) => p.data);
    const intervalos = datas.slice(1).map((d, i) => Math.max(1, difDias(datas[i], d)));
    x.primeira = datas[0];
    x.ultima = datas[datas.length - 1];
    x.dias = difDias(x.ultima, hoje);
    x.intervalo = intervalos.length ? Math.round(intervalos.reduce((t, n) => t + n, 0) / intervalos.length) : null;
    x.dominante = Object.entries(x.perfilQtd).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
    x.extra = extras[x.id] || {};
    // conta do site: a que o painel vinculou, ou a que informou o mesmo WhatsApp
    const vinculada = x.extra.conta_sub && porSub.get(x.extra.conta_sub);
    x.conta = vinculada || (x.tel && porTel.get(x.tel)) || null;
    x.contaVinculada = Boolean(vinculada);
    if (x.conta) enriquecer(x, x.conta, porId);
    return x;
  });
  // quem tem conta, aceitou contato e ainda não comprou entra como "contato" (sem pedido)
  const jaTem = new Set(clientes.map((c) => c.conta && c.conta.sub).filter(Boolean));
  for (const conta of contas) {
    const tel = digitosTel(conta.consentimento && conta.consentimento.whatsapp);
    if (jaTem.has(conta.sub) || !tel || !(conta.consentimento && conta.consentimento.marketing)) continue;
    const id = 'c' + crypto.createHash('sha1').update(`t:${tel}`).digest('hex').slice(0, 8);
    const x = { id, nome: conta.nome, telefone: conta.consentimento.whatsapp, tel, pedidos: [], gasto: 0, perfilQtd: {}, notaQtd: {}, compras: new Map(), vetor: {}, comprou: new Set(),
      primeira: null, ultima: null, dias: Math.max(0, difDias(String(conta.criado).slice(0, 10), hoje)), intervalo: null, dominante: null,
      extra: extras[id] || {}, conta, contaVinculada: Boolean(extras[id] && extras[id].conta_sub), lead: true };
    enriquecer(x, conta, porId);
    clientes.push(x);
  }
  return clientes;
}

const digitosTel = (t) => String(t || '').replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '');

// o que a pessoa declarou na conta entra no gosto (com peso menor que uma compra real)
function enriquecer(x, conta, porId) {
  const g = conta.gosto || {};
  for (const p of g.perfis || []) x.vetor[`perfil:${p}`] = (x.vetor[`perfil:${p}`] || 0) + 1.5;
  for (const p of g.publicos || []) x.vetor[`publico:${p}`] = (x.vetor[`publico:${p}`] || 0) + 1;
  for (const n of g.notas || []) x.vetor[`nota:${n}`] = (x.vetor[`nota:${n}`] || 0) + 1;
  for (const id of conta.usou || []) { const p = porId.get(id); if (p) { soma(x.vetor, featuresProduto(p), 1); x.comprou.add(id); } }
  for (const id of conta.desejos || []) { const p = porId.get(id); if (p) soma(x.vetor, featuresProduto(p), 0.8); }
  if (!x.dominante && (g.perfis || []).length === 1) x.dominante = g.perfis[0];
}

// consentimento para receber promoções: com conta, vale o que a pessoa marcou; sem conta, não há registro
const consentDe = (c) => (!c.conta ? 'nao_registrado' : c.conta.consentimento && c.conta.consentimento.marketing ? 'aceitou' : 'sem_aceite');

function vendavel(e, p) {
  const st = e.catalogo.status[p.id];
  if (st === 'oculto' || st === 'esgotado') return false;
  const item = e.produtos[p.id];
  return item ? e.tamanhos.some((s) => disponivel(item, s) > 0) : true;
}

// 0 a 100: o quanto a fragrância combina com o gosto da pessoa.
// Mede quanto das características do perfume a pessoa já aprecia (e não a "distância" entre dois vetores):
// quem curte várias famílias não pode ser punido por isso, senão ninguém passa de 30.
const DIMENSOES = [['perfil:', 0.5], ['publico:', 0.2], ['nota:', 0.3]];
function conteudoDe(c, alvo) {
  const maior = Math.max(0, ...Object.values(c.vetor));
  if (!maior) return 0;
  const ref = maior * 0.5; // gostar pelo menos da metade do que ela mais gosta já conta como gostar
  let soma = 0, peso = 0;
  for (const [pref, w] of DIMENSOES) {
    const doProduto = Object.entries(alvo).filter(([f]) => f.startsWith(pref));
    const temDado = Object.keys(c.vetor).some((f) => f.startsWith(pref) && c.vetor[f] > 0);
    if (!doProduto.length || !temDado) continue; // sem informação nesse quesito: não conta contra
    let tot = 0, ok = 0;
    for (const [f, v] of doProduto) {
      let gosto = Math.min(1, (c.vetor[f] || 0) / ref);
      if (f === 'publico:compartilhavel') gosto = Math.max(gosto, 0.7); // unissex serve para qualquer pessoa
      tot += v; ok += v * gosto;
    }
    soma += w * (ok / tot); peso += w;
  }
  return peso ? soma / peso : 0;
}
function pontuar(c, todosClientes, alvo, prodId) {
  const conteudo = conteudoDe(c, alvo);
  let colab = 0;
  if (prodId) {
    const outros = todosClientes.filter((o) => o.id !== c.id && o.comprou.has(prodId));
    if (outros.length) colab = outros.reduce((t, o) => t + cosseno(c.vetor, o.vetor), 0) / outros.length;
  }
  let pts = 100 * Math.min(1, conteudo + 0.15 * colab);
  if (prodId && c.comprou.has(prodId)) pts *= 0.5;
  return Math.round(pts);
}
const rotuloPts = (c, pts) => (!Object.keys(c.vetor).length ? 'sem dados' : pts >= 60 ? 'alta' : pts >= 35 ? 'media' : 'baixa');

function motivosDe(c, alvo) {
  return Object.entries(alvo)
    .map(([f, v]) => [f, (c.vetor[f] || 0) * v])
    .filter(([, s]) => s > 0).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([f]) => rotuloDe(f));
}

function recomendar(e, c, todosClientes, n = 3) {
  return todos(e).filter((p) => p.category === 'perfumes').map((p) => {
    const alvo = featuresProduto(p);
    const pts = pontuar(c, todosClientes, alvo, p.id);
    return { id: p.id, nome: p.name, inspirado: p.inspired_by || '', perfil: p.profile || '', afinidade: pts, rotulo: rotuloPts(c, pts), motivos: motivosDe(c, alvo), disponivel: vendavel(e, p), ja_comprou: c.comprou.has(p.id) };
  }).filter((r) => r.afinidade > 0).sort((a, b) => (b.disponivel - a.disponivel) || (a.ja_comprou - b.ja_comprou) || (b.afinidade - a.afinidade)).slice(0, n);
}

// os gostos mais fortes, de 0 a 100 (o mais forte vale 100)
function gostosDe(c) {
  const itens = Object.entries(c.vetor).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const maior = itens.length ? itens[0][1] : 1;
  return itens.slice(0, 8).map(([f, v]) => ({ chave: f, rotulo: rotuloDe(f), pct: Math.round((v / maior) * 100) }));
}

const nomesDe = (e, ids) => (ids || []).map((id) => todos(e).find((p) => p.id === id)?.name).filter(Boolean);

function resumo(e, c, todosClientes) {
  return {
    id: c.id, nome: c.nome, telefone: c.telefone,
    n_pedidos: c.pedidos.length, gasto: Math.round(c.gasto * 100) / 100,
    primeira: c.primeira, ultima: c.ultima, dias: c.dias, intervalo: c.intervalo,
    perfil: c.perfilQtd, dominante: c.dominante,
    perfis_todos: [...new Set([...Object.keys(c.perfilQtd), ...(((c.conta && c.conta.gosto && c.conta.gosto.perfis) || []))])],
    notas: Object.entries(c.notaQtd).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([t, n]) => ({ tag: t, rotulo: rotuloDe(`nota:${t}`), n })),
    compras: [...c.compras.values()].sort((a, b) => b.ultima.localeCompare(a.ultima) || b.qtd - a.qtd).slice(0, 24),
    gostos: gostosDe(c),
    pedidos: c.pedidos.slice().reverse().slice(0, 12),
    recomendacoes: recomendar(e, c, todosClientes, 5),
    consent: consentDe(c), lead: Boolean(c.lead),
    conta: c.conta ? {
      nome: c.conta.nome, email: c.conta.email, vinculada: c.contaVinculada, whatsapp: (c.conta.consentimento && c.conta.consentimento.whatsapp) || '',
      aceite_em: (c.conta.consentimento && c.conta.consentimento.data) || null,
      gosto: c.conta.gosto || {}, usou: nomesDe(e, c.conta.usou), desejos: nomesDe(e, c.conta.desejos), sub: c.conta.sub,
    } : null,
    contato: { ultimo: c.extra.ultimo_contato || null, notas: c.extra.notas || '', nao_chamar: Boolean(c.extra.nao_chamar), historico: (c.extra.contatos || []).slice(-6).reverse() },
  };
}

// quem vale chamar agora: passou do ritmo habitual de compra, com a melhor sugestão para cada um
function paraChamar(e, internos, resumos) {
  const hoje = hojeSP();
  return internos.map((c, i) => {
    const r = resumos[i];
    const ritmo = c.intervalo || INTERVALO_PADRAO;
    const atraso = c.dias / Math.max(30, ritmo);
    const chamadoHa = c.extra.ultimo_contato ? difDias(c.extra.ultimo_contato, hoje) : null;
    if (c.lead || consentDe(c) === 'sem_aceite' || c.extra.nao_chamar || atraso < 1 || (chamadoHa !== null && chamadoHa < CARENCIA_CONTATO)) return null;
    const melhor = r.recomendacoes.find((x) => x.disponivel) || null;
    return { id: c.id, nome: c.nome, telefone: c.telefone, dias: c.dias, ritmo, atraso: Math.round(atraso * 10) / 10, n_pedidos: c.pedidos.length, sugestao: melhor, prioridade: atraso * (0.5 + (melhor ? melhor.afinidade : 0) / 100) };
  }).filter(Boolean).sort((a, b) => b.prioridade - a.prioridade).slice(0, 20);
}

export function painelClientes(e, contas = []) {
  const internos = clientesInternos(e, contas);
  const resumos = internos.map((c) => resumo(e, c, internos));
  return {
    lista: resumos.sort((a, b) => (b.ultima || '0').localeCompare(a.ultima || '0')),
    chamar: paraChamar(e, internos, internos.map((c) => resumos.find((r) => r.id === c.id))),
  };
}

// Simulador de lançamento: quem tem mais chance de comprar, e por tipo de cliente
export function lancamento(e, alvoPedido, contas = []) {
  let alvo = {};
  let prodId = null;
  let nome = '';
  if (alvoPedido.produto_id) {
    const p = todos(e).find((x) => x.id === alvoPedido.produto_id && x.category === 'perfumes');
    if (!p) throw erro('Perfume não encontrado.', 404);
    alvo = featuresProduto(p); prodId = p.id; nome = p.name;
  } else {
    if (PERFIS.includes(alvoPedido.perfil)) alvo[`perfil:${alvoPedido.perfil}`] = 2;
    if (PUBLICOS.includes(alvoPedido.publico)) alvo[`publico:${alvoPedido.publico}`] = 1.5;
    for (const t of String(alvoPedido.notas || '').split(',').map(normal).filter(Boolean).slice(0, 8)) alvo[`nota:${t.replace(/\s+/g, '')}`] = 1;
    nome = limpar(alvoPedido.nome, 80);
  }
  if (!Object.keys(alvo).length) throw erro('Escolha um perfume ou descreva o perfil (perfil, público ou notas).');
  const internos = clientesInternos(e, contas);
  const hoje = hojeSP();
  const ranking = internos.map((c) => {
    const pts = pontuar(c, internos, alvo, prodId);
    return { id: c.id, nome: c.nome, telefone: c.telefone, afinidade: pts, rotulo: rotuloPts(c, pts), motivos: motivosDe(c, alvo), ja_comprou: prodId ? c.comprou.has(prodId) : false,
      dias: c.dias, n_pedidos: c.pedidos.length, dominante: c.dominante, ultimo_contato: c.extra.ultimo_contato || null, nao_chamar: Boolean(c.extra.nao_chamar), consent: consentDe(c), lead: Boolean(c.lead),
      chamado_ha: c.extra.ultimo_contato ? difDias(c.extra.ultimo_contato, hoje) : null };
  }).sort((a, b) => b.afinidade - a.afinidade || b.dias - a.dias);
  const grupos = new Map();
  for (const r of ranking) {
    const g = r.dominante || 'sem perfil';
    const x = grupos.get(g) || { perfil: g, clientes: 0, soma: 0, altas: 0 };
    x.clientes++; x.soma += r.afinidade; if (r.rotulo === 'alta') x.altas++;
    grupos.set(g, x);
  }
  const segmentos = [...grupos.values()].map((g) => ({ perfil: g.perfil, clientes: g.clientes, media: Math.round(g.soma / g.clientes), altas: g.altas })).sort((a, b) => b.media - a.media);
  return { nome, produto_id: prodId, ranking, segmentos, total: ranking.length };
}

function achaCliente(e, id, contas = []) {
  if (!clientesInternos(e, contas).some((c) => c.id === id)) throw erro('Cliente não encontrado.', 404);
}

// "Chamei": guarda a data para não sugerir a mesma pessoa de novo logo em seguida
export function registrarContato(e, id, nota, contas = []) {
  achaCliente(e, id, contas);
  e.clientes_extra ??= {};
  const x = (e.clientes_extra[id] ??= {});
  const data = hojeSP();
  x.ultimo_contato = data;
  x.contatos = [...(x.contatos || []), { data, nota: limpar(nota, 200) }].slice(-50);
}

export function dadosCliente(e, id, d, contas = []) {
  achaCliente(e, id, contas);
  e.clientes_extra ??= {};
  const x = (e.clientes_extra[id] ??= {});
  if ('notas' in d) x.notas = limpar(d.notas, 600);
  if ('nao_chamar' in d) x.nao_chamar = Boolean(d.nao_chamar);
}

// O cliente só vê os próprios pedidos na conta depois que o painel confirma que a conta é dele
export function vincularConta(e, id, sub, contas = []) {
  achaCliente(e, id, contas);
  if (!contas.some((c) => c.sub === sub)) throw erro('Conta não encontrada.', 404);
  e.clientes_extra ??= {};
  (e.clientes_extra[id] ??= {}).conta_sub = sub;
}
export function desvincularConta(e, id, contas = []) {
  achaCliente(e, id, contas);
  if (e.clientes_extra && e.clientes_extra[id]) delete e.clientes_extra[id].conta_sub;
}
