// Regras do estoque e do catálogo online da Sposence (usadas pelo painel e pelo site público).
//
// Estado guardado:
//   tamanhos              tamanhos de perfume controlados ("30ml", "50ml")
//   produtos              { id: { granel_ml, unidades: { "30ml": n } } }
//   catalogo.status       { id: "oculto" | "esgotado" }     (sem registro = visível)
//   catalogo.precos       { id: { "30ml": 90 } }            (muda o preço de um produto do site)
//   catalogo.extras       produtos criados pelo painel
//   historico             movimentos de estoque, para desfazer
//
// Cada baixa usa primeiro os frascos prontos do tamanho e, se não houver, tira do granel.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { lerJSON, gravarJSON } from './_redis.js';

const RAIZ = process.cwd();
const CHAVE = 'sposence:estoque';
const MAX_HISTORICO = 200;
// Insumos: o que se usa para fazer e embalar (quantidades iniciais informadas em 19/10/2026).
// rende: quanto de cada unidade vira um produto (ex.: 95 g de base por creme de 100 g).
export const INSUMOS_PADRAO = [
  { id: 'base-creme', nome: 'Base de creme', unidade: 'g', qtd: 1200, minimo: 200, rende: { por: 95, rotulo: 'cremes de 100 g' } },
  { id: 'saquinho', nome: 'Saquinhos de algodão', unidade: 'un', qtd: 30, minimo: 10 },
  { id: 'etiqueta', nome: 'Etiquetas', unidade: 'un', qtd: 80, minimo: 20, aprox: true },
  { id: 'vidro-30ml', nome: 'Vidros de 30 ml', unidade: 'un', qtd: 11, minimo: 5 },
  { id: 'vidro-50ml', nome: 'Vidros de 50 ml', unidade: 'un', qtd: 6, minimo: 3 },
];
// O que cada perfume vendido consome (um vidro do tamanho, uma etiqueta e um saquinho).
export const RECEITA_FRASCO = {
  '30ml': { 'vidro-30ml': 1, etiqueta: 1, saquinho: 1 },
  '50ml': { 'vidro-50ml': 1, etiqueta: 1, saquinho: 1 },
};

export const PERFIS = ['frescos', 'doces', 'noturnos', 'elegantes'];
export const GENEROS = ['feminino', 'masculino', 'compartilhavel'];

let _catalogo;
export function catalogo() {
  if (!_catalogo) {
    const js = fs.readFileSync(path.join(RAIZ, 'js', 'data.js'), 'utf8');
    const D = vm.runInNewContext(`${js}\n;SPOSENCE_DATA`);
    _catalogo = [...D.perfumes, ...D.body_splashes, ...D.skincare, ...D.merchandise];
  }
  return _catalogo;
}

// Produtos do site (js/data.js) mais os criados pelo painel.
export const todos = (e) => [...catalogo(), ...(e.catalogo?.extras || [])];

export async function carregar() {
  let e = await lerJSON(CHAVE);
  if (!e) {
    e = JSON.parse(fs.readFileSync(path.join(RAIZ, 'tools', 'estoque.json'), 'utf8'));
    await gravarJSON(CHAVE, e);
  }
  e.catalogo ??= {};
  e.catalogo.status ??= {};
  e.catalogo.precos ??= {};
  e.catalogo.extras ??= [];
  e.insumos ??= structuredClone(INSUMOS_PADRAO);
  e.pedidos ??= [];
  e.proximo_pedido ??= 1;
  e.maturacao ??= [];
  return e;
}
export const salvar = (e) => gravarJSON(CHAVE, e);

const ml = (size) => parseInt(size, 10);
const normal = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const agora = () => new Date().toLocaleString('sv-SE', { timeZone: 'America/Sao_Paulo' }).slice(0, 16);

export function disponivel(item, size) {
  return (item.unidades?.[size] || 0) + Math.floor((item.granel_ml || 0) / ml(size));
}

// Todo o perfume que existe, em ml: granel + o que já está nos frascos.
export function mlTotal(item, tamanhos) {
  return (item.granel_ml || 0) + tamanhos.reduce((soma, s) => soma + (item.unidades?.[s] || 0) * ml(s), 0);
}

// O que o site público precisa: estoque por tamanho, status, preços e produtos novos.
export function publico(e) {
  const produtos = {};
  for (const [id, item] of Object.entries(e.produtos)) {
    produtos[id] = Object.fromEntries(e.tamanhos.map((s) => [s, disponivel(item, s)]));
  }
  return { produtos, status: e.catalogo.status, precos: e.catalogo.precos, extras: e.catalogo.extras };
}

const ROTULO = { perfumes: 'Perfume', body_splashes: 'Body splash', skincare: 'Creme', merchandise: 'Acessório' };

export function estado(e) {
  const lista = todos(e);
  const nomes = new Map(lista.map((p) => [p.id, p.name]));
  const produtos = Object.entries(e.produtos).map(([id, item]) => ({
    id,
    nome: nomes.get(id) || id,
    granel_ml: item.granel_ml || 0,
    unidades: Object.fromEntries(e.tamanhos.map((s) => [s, item.unidades?.[s] || 0])),
    vende: Object.fromEntries(e.tamanhos.map((s) => [s, disponivel(item, s)])),
    ml_total: mlTotal(item, e.tamanhos),
    status: e.catalogo.status[id] || 'visivel',
  }));
  const extras = new Set(e.catalogo.extras.map((p) => p.id));
  return {
    tamanhos: e.tamanhos,
    produtos,
    resumo: {
      ml_total: produtos.reduce((s, p) => s + p.ml_total, 0),
      frascos_prontos: produtos.reduce((s, p) => s + e.tamanhos.reduce((t, k) => t + p.unidades[k], 0), 0),
      esgotados: produtos.filter((p) => e.tamanhos.every((s) => p.vende[s] === 0)).length,
    },
    perfumes: lista.filter((p) => p.category === 'perfumes').map((p) => ({ id: p.id, nome: p.name })),
    catalogo: lista.map((p) => ({
      id: p.id,
      nome: p.name,
      categoria: p.category,
      rotulo: ROTULO[p.category] || p.category,
      status: e.catalogo.status[p.id] || 'visivel',
      criado_no_painel: extras.has(p.id),
      controlado: Boolean(e.produtos[p.id]),
      variantes: precosDe(e, p),
      dados: extras.has(p.id) ? dadosEditaveis(p) : undefined,
    })),
    hoje: hojeSP(),
    maturacao: lotesParaTela(e),
    pedidos: [...e.pedidos].reverse().slice(0, 300).map(pedidoParaTela),
    formas_pagamento: FORMAS,
    etapas_pedido: STATUS_PEDIDO,
    insumos: e.insumos.map((i) => ({ ...i, acabando: i.qtd <= (i.minimo ?? 0) })),
    historico: e.historico.slice(-30).reverse().map((h) => ({ id: h.id, data: h.data, tipo: h.tipo, descricao: h.descricao })),
  };
}

// Preço atual de cada variante (com o ajuste do painel, se houver).
function precosDe(e, p) {
  const ajuste = e.catalogo.precos[p.id] || {};
  if (p.variants?.length) {
    // tamanhos fora de linha (sem contagem de estoque, como o 100ml) não entram
    return p.variants.filter((v) => !((v.outOfStock || v.available === false) && typeof v.stock !== 'number'))
      .map((v) => ({ tamanho: v.size, preco: ajuste[v.size] ?? v.price }));
  }
  return [{ tamanho: 'unico', preco: ajuste.unico ?? p.price }];
}

function dadosEditaveis(p) {
  const preco = (s) => p.variants?.find((v) => v.size === s)?.price;
  return {
    tipo: p.category === 'perfumes' ? 'perfume' : 'creme',
    nome: p.name,
    inspirado: p.inspired_by || '',
    perfil: p.profile || '',
    genero: GENEROS.find((g) => p.tags?.includes(g)) || '',
    topo: p.notes?.top || '',
    coracao: p.notes?.heart || '',
    base: p.notes?.base || '',
    descricao: p.description || '',
    imagem: p.image || '',
    preco30: preco('30ml'),
    preco50: preco('50ml'),
    preco: p.category === 'skincare' ? p.variants?.[0]?.price : undefined,
  };
}

// ---------- Catálogo: criar, editar, status, preços ----------
const erro = (msg, status = 400) => Object.assign(new Error(msg), { status });
const limpar = (s, max = 300) => String(s ?? '').replace(/[<>"`\\]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
const slug = (s) => normal(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function preco(v, nome) {
  const n = Number(String(v).replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0 || n > 9999) throw erro(`Preço inválido em ${nome}.`);
  return Math.round(n * 100) / 100;
}

function imagem(v) {
  const s = limpar(v, 500);
  if (!s) return undefined;
  if (!/^(https:\/\/[^\s']+|img\/[^\s'"]+)$/.test(s)) throw erro('A foto precisa ser um link https:// ou um caminho img/…');
  return s;
}

function montarProduto(d, id) {
  const nome = limpar(d.nome, 80);
  if (!nome) throw erro('Dê um nome ao produto.');
  const descricao = limpar(d.descricao, 400);
  const foto = imagem(d.imagem);
  if (d.tipo === 'perfume') {
    const perfil = PERFIS.includes(d.perfil) ? d.perfil : 'elegantes';
    const genero = GENEROS.includes(d.genero) ? d.genero : 'compartilhavel';
    const p = {
      id,
      name: nome,
      inspired_by: limpar(d.inspirado, 80),
      profile: perfil,
      notes: { top: limpar(d.topo, 120), heart: limpar(d.coracao, 120), base: limpar(d.base, 120) },
      description: descricao,
      category: 'perfumes',
      concentration: '27%',
      variants: [{ size: '30ml', price: preco(d.preco30, '30 ml') }, { size: '50ml', price: preco(d.preco50, '50 ml') }],
      tags: [perfil, genero],
    };
    if (foto) p.image = foto;
    return p;
  }
  if (d.tipo === 'creme') {
    const p = {
      id,
      name: nome,
      type: 'Creme Corporal',
      volume: '100g',
      description: descricao,
      category: 'skincare',
      variants: [{ size: '100g', price: preco(d.preco, 'preço') }],
      tags: ['hidratação', 'corpo'],
    };
    if (foto) p.image = foto;
    return p;
  }
  throw erro('Escolha se é perfume ou creme.');
}

export function criarProduto(e, d) {
  const base = slug(d.nome) || 'produto';
  let id = base;
  for (let i = 2; todos(e).some((p) => p.id === id); i++) id = `${base}-${i}`;
  const p = montarProduto(d, id);
  e.catalogo.extras.push(p);
  // perfume novo entra no controle de estoque e fica esgotado até a primeira entrada
  if (p.category === 'perfumes') e.produtos[id] = { granel_ml: 0, unidades: {} };
  return p;
}

export function editarProduto(e, id, d) {
  const i = e.catalogo.extras.findIndex((p) => p.id === id);
  if (i < 0) throw erro('Só dá pra editar produtos criados pelo painel.');
  e.catalogo.extras[i] = montarProduto({ ...d, tipo: e.catalogo.extras[i].category === 'perfumes' ? 'perfume' : 'creme' }, id);
  delete e.catalogo.precos[id];
}

export function removerProduto(e, id) {
  const i = e.catalogo.extras.findIndex((p) => p.id === id);
  if (i < 0) throw erro('Só dá pra remover produtos criados pelo painel. Os outros você pode ocultar.');
  e.catalogo.extras.splice(i, 1);
  delete e.catalogo.status[id];
  delete e.catalogo.precos[id];
  delete e.produtos[id];
}

export function definirStatus(e, id, status) {
  if (!todos(e).some((p) => p.id === id)) throw erro('Produto não encontrado.');
  if (status === 'visivel') delete e.catalogo.status[id];
  else if (status === 'oculto' || status === 'esgotado') e.catalogo.status[id] = status;
  else throw erro('Status inválido.');
}

export function definirPrecos(e, id, precos) {
  const p = todos(e).find((x) => x.id === id);
  if (!p) throw erro('Produto não encontrado.');
  const validos = new Set(precosDe(e, p).map((v) => v.tamanho));
  const novo = {};
  for (const [tam, valor] of Object.entries(precos || {})) {
    if (!validos.has(tam)) throw erro(`Tamanho inválido: ${tam}`);
    novo[tam] = preco(valor, tam === 'unico' ? 'preço' : tam);
  }
  if (Object.keys(novo).length) e.catalogo.precos[id] = novo;
  else delete e.catalogo.precos[id];
}

// ---------- Pedidos e estoque ----------
// Linhas do pedido do site: "- 2x Light Blue (30ml) | R$ 170,00" (no WhatsApp podem vir com *negrito*)
export function itensDoPedido(texto) {
  const itens = [];
  for (const linha of String(texto).replace(/\*/g, '').split(/\r?\n/)) {
    const m = linha.match(/^\s*-\s*(\d+)x\s+(.+?)\s+\(([^)]+)\)\s*\|\s*(?:R\$)?\s*([\d.,]+)?/);
    if (m) itens.push({ qtd: Number(m[1]), nome: m[2].trim(), variante: m[3].trim(), total: valorBR(m[4]) });
  }
  return itens;
}

export const hashDoPedido = (texto) =>
  crypto.createHash('sha1').update(String(texto).replace(/\s+/g, ' ').trim()).digest('hex').slice(0, 12);

function somarMovs(movs) {
  const soma = new Map();
  for (const m of movs) {
    const k = `${m.id}|${m.campo}`;
    soma.set(k, { ...m, delta: (soma.get(k)?.delta || 0) + m.delta });
  }
  return [...soma.values()];
}

// Simula a baixa sem gravar nada. Devolve as linhas para mostrar, os problemas e os movimentos.
export function simularBaixa(e, itens) {
  const copia = structuredClone(e.produtos);
  const linhas = [];
  const problemas = [];
  const movs = [];
  const usoInsumo = {};   // insumo -> quanto o pedido precisa
  for (const it of itens) {
    const produto = todos(e).find((p) => normal(p.name) === normal(it.nome));
    const item = produto && copia[produto.id];
    // todo perfume que sai leva um vidro do tamanho, uma etiqueta e um saquinho
    const receita = produto?.category === 'perfumes' ? RECEITA_FRASCO[it.variante] : null;
    if (receita) for (const [iid, por] of Object.entries(receita)) usoInsumo[iid] = (usoInsumo[iid] || 0) + it.qtd * por;
    if (!item || !e.tamanhos.includes(it.variante)) {
      linhas.push({ ok: null, texto: receita
        ? `${it.qtd}x ${it.nome} (${it.variante}): sem controle de ml, só desconta vidro, etiqueta e saquinho`
        : `${it.qtd}x ${it.nome} (${it.variante}): sem controle de estoque, nada a descontar` });
      continue;
    }
    for (let i = 0; i < it.qtd; i++) {
      if ((item.unidades?.[it.variante] || 0) > 0) {
        item.unidades[it.variante]--;
        movs.push({ id: produto.id, campo: it.variante, delta: -1 });
        linhas.push({ ok: true, texto: `${it.nome} ${it.variante}: −1 frasco pronto` });
      } else if ((item.granel_ml || 0) >= ml(it.variante)) {
        item.granel_ml -= ml(it.variante);
        movs.push({ id: produto.id, campo: 'granel_ml', delta: -ml(it.variante) });
        linhas.push({ ok: true, texto: `${it.nome} ${it.variante}: −${ml(it.variante)} ml do granel (sobram ${item.granel_ml} ml)` });
      } else {
        problemas.push(`${it.nome} ${it.variante}: não tem estoque suficiente`);
        break;
      }
    }
  }
  // Insumos: a venda já aconteceu, então nunca bloqueia; se faltar, a contagem vai a zero e avisa.
  if (!problemas.length) {
    const gastos = [];
    for (const [iid, preciso] of Object.entries(usoInsumo)) {
      const ins = e.insumos.find((i) => i.id === iid);
      if (!ins) continue;
      const aplicado = Math.min(preciso, Math.max(ins.qtd, 0));
      if (aplicado > 0) { movs.push({ id: iid, campo: 'insumo', delta: -aplicado }); gastos.push(`${aplicado} × ${ins.nome.toLowerCase()}`); }
      if (aplicado < preciso) linhas.push({ ok: null, texto: `Faltou ${ins.nome.toLowerCase()}: precisava de ${preciso} e havia ${ins.qtd}. A contagem foi a zero; corrija em Insumos.` });
    }
    if (gastos.length) linhas.push({ ok: true, texto: `Insumos: −${gastos.join(', −')}` });
  }
  return { linhas, problemas, movs: somarMovs(movs) };
}

function aplicarMov(e, m, sinal = 1) {
  if (m.campo === 'insumo') {
    const ins = e.insumos.find((i) => i.id === m.id);
    if (ins) ins.qtd += sinal * m.delta;
    return;
  }
  const item = (e.produtos[m.id] ??= { granel_ml: 0, unidades: {} });
  item.unidades ??= {};
  if (m.campo === 'granel_ml') item.granel_ml = (item.granel_ml || 0) + sinal * m.delta;
  else item.unidades[m.campo] = (item.unidades[m.campo] || 0) + sinal * m.delta;
}

export function registrar(e, { tipo, descricao, movs, hash, meta }) {
  for (const m of movs) aplicarMov(e, m);
  const id = crypto.randomBytes(4).toString('hex');
  e.historico.push({ id, data: agora(), tipo, descricao, movs, hash, meta });
  e.historico = e.historico.slice(-MAX_HISTORICO);
  return id;
}

export function desfazerUltimo(e) {
  const h = e.historico[e.historico.length - 1];
  if (!h) throw erro('Não há nada para desfazer.');
  for (const m of h.movs) aplicarMov(e, m, -1);
  // o movimento criou, aumentou ou cancelou um pedido: desfaz isso também
  const meta = h.meta || {};
  const lote = meta.maturacao && e.maturacao.find((l) => l.id === meta.maturacao);
  if (lote) { lote.status = 'maturando'; delete lote.concluido_em; delete lote.ml_entrada; delete lote.destino_id; }
  const pedido = meta.pedido && e.pedidos.find((p) => p.id === meta.pedido);
  if (pedido && meta.item) {
    if (pedido.itens.length - 1 === meta.item.indice) {
      pedido.itens.pop();
      pedido.total = arred(pedido.total - meta.item.total);
      pedido.movs = (pedido.movs || []).slice(0, Math.max(0, (pedido.movs || []).length - meta.item.movs.length));
      recalcularParcelas(pedido);
    }
  } else if (pedido && meta.cancelamento) {
    pedido.status = meta.cancelamento.anterior;
    delete pedido.cancelado_em; delete pedido.devolvido;
  } else if (pedido) {
    e.pedidos = e.pedidos.filter((p) => p.id !== meta.pedido);
  }
  e.historico.pop();
  return h;
}

export function movimentosDeEntrada(e, { id, ml: granel, tamanho, qtd }) {
  if (!todos(e).some((p) => p.id === id && p.category === 'perfumes')) throw erro(`Perfume "${id}" não existe no catálogo.`);
  if (granel) return [{ id, campo: 'granel_ml', delta: granel }];
  if (!e.tamanhos.includes(tamanho)) throw erro(`Tamanho inválido: ${tamanho}`);
  return [{ id, campo: tamanho, delta: qtd }];
}

// Vários tamanhos de uma vez ({ "30ml": 5, "50ml": 3 }).
// envasar: transforma granel em frascos, então os ml usados saem do granel.
export function movimentosDeUnidades(e, { id, unidades, envasar }) {
  if (!todos(e).some((p) => p.id === id && p.category === 'perfumes')) throw erro(`Perfume "${id}" não existe no catálogo.`);
  const movs = [];
  const partes = [];
  let usado = 0;
  for (const s of e.tamanhos) {
    const n = Number(unidades?.[s] || 0);
    if (!Number.isInteger(n) || n < 0 || n > 100000) throw erro('Número inválido.');
    if (!n) continue;
    movs.push({ id, campo: s, delta: n });
    partes.push(`${n} × ${s}`);
    usado += n * ml(s);
  }
  if (!movs.length) throw erro('Informe pelo menos um frasco.');
  if (envasar) {
    const granel = e.produtos[id]?.granel_ml || 0;
    if (usado > granel) throw erro(`Para envasar ${partes.join(' e ')} precisa de ${usado} ml, e só há ${granel} ml a granel.`);
    movs.push({ id, campo: 'granel_ml', delta: -usado });
  }
  return { movs, partes, usado };
}

// ---------- Insumos ----------
const achaInsumo = (e, id) => {
  const i = e.insumos.find((x) => x.id === id);
  if (!i) throw erro('Insumo não encontrado.');
  return i;
};
const quantidade = (v, max = 1000000) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0 || n > max) throw erro('Número inválido.');
  return n;
};

// tipo "entrada" soma (comprou); "uso" subtrai (gastou)
export function movimentoDeInsumo(e, { id, qtd, tipo }) {
  const i = achaInsumo(e, id);
  const n = quantidade(qtd);
  if (!n) throw erro('Informe uma quantidade maior que zero.');
  if (tipo === 'uso' && n > i.qtd) throw erro(`Só há ${i.qtd} ${i.unidade} de ${i.nome}.`);
  return { movs: [{ id, campo: 'insumo', delta: tipo === 'uso' ? -n : n }], insumo: i, n };
}

export function movimentoDeAjusteInsumo(e, { id, qtd }) {
  const i = achaInsumo(e, id);
  const novo = quantidade(qtd);
  return { movs: novo === i.qtd ? [] : [{ id, campo: 'insumo', delta: novo - i.qtd }], insumo: i, novo };
}

export function criarInsumo(e, d) {
  const nome = limpar(d.nome, 60);
  if (!nome) throw erro('Dê um nome ao insumo.');
  if (!['un', 'g', 'ml'].includes(d.unidade)) throw erro('Escolha a unidade.');
  const base = slug(nome) || 'insumo';
  let id = base;
  for (let k = 2; e.insumos.some((i) => i.id === id); k++) id = `${base}-${k}`;
  const novo = { id, nome, unidade: d.unidade, qtd: quantidade(d.qtd), minimo: quantidade(d.minimo || 0) };
  e.insumos.push(novo);
  return novo;
}

export function removerInsumo(e, id) {
  achaInsumo(e, id);
  e.insumos = e.insumos.filter((i) => i.id !== id);
}

// ---------- Pedidos ----------
// Cada baixa (pedido colado ou venda avulsa) vira um pedido: itens, cliente, etapa, pagamento
// (à vista ou em parcelas) e observações. Os movimentos de estoque ficam guardados para poder
// devolver ao estoque se o pedido for cancelado.
export const STATUS_PEDIDO = ['novo', 'separando', 'pronto', 'entregue'];
export const FORMAS = ['pix', 'dinheiro', 'cartao', 'outro'];
const arred = (n) => Math.round(n * 100) / 100;
const valorBR = (t) => { const n = Number(String(t ?? '').replace(/[^\d,]/g, '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };

export const clienteDe = (d) => ({ nome: limpar(d?.nome, 80), telefone: limpar(d?.telefone, 30), recebimento: limpar(d?.recebimento, 200) });

// A mensagem do site traz "Nome:", "WhatsApp:" e "Recebimento:"
export function clienteDoTexto(texto) {
  const limpo = String(texto).replace(/\*/g, '');
  const pega = (rotulo) => (limpo.match(new RegExp(`^\\s*${rotulo}\\s*:\\s*(.+)$`, 'mi')) || [])[1] || '';
  return clienteDe({ nome: pega('Nome'), telefone: pega('WhatsApp'), recebimento: pega('Recebimento') });
}

export function precoUnitario(e, produto, variante) {
  const ajuste = e.catalogo.precos[produto.id] || {};
  if (variante in ajuste) return ajuste[variante];
  const v = produto.variants?.find((x) => x.size === variante);
  return v?.price ?? ajuste.unico ?? produto.price ?? 0;
}

// Itens do pedido com o valor de cada linha (usa o preço do site se a linha não trouxe)
export function itensParaPedido(e, itens) {
  return itens.map((i) => {
    const prod = todos(e).find((p) => normal(p.name) === normal(i.nome));
    const total = i.total || (prod ? arred(precoUnitario(e, prod, i.variante) * i.qtd) : 0);
    return { nome: i.nome, variante: i.variante, qtd: i.qtd, total, produto_id: prod?.id };
  });
}

export function planoParcelas(total, modo, n) {
  if (modo === 'pago') return [{ n: 1, valor: total, pago: true, data: agora() }];
  const qtd = modo === 'parcelado' ? Math.min(Math.max(Math.floor(Number(n) || 2), 2), 12) : 1;
  const base = Math.floor((total / qtd) * 100) / 100;
  const lista = Array.from({ length: qtd }, (_, i) => ({ n: i + 1, valor: base, pago: false }));
  lista[qtd - 1].valor = arred(total - base * (qtd - 1));
  return lista;
}

// Quando o total muda, as parcelas já pagas ficam como estão e o resto é redistribuído
function recalcularParcelas(p) {
  const pagas = p.parcelas.filter((x) => x.pago);
  const abertas = p.parcelas.filter((x) => !x.pago);
  const restante = arred(p.total - pagas.reduce((t, x) => t + x.valor, 0));
  let lista;
  if (restante <= 0) lista = pagas;
  else if (!abertas.length) lista = [...pagas, { n: 0, valor: restante, pago: false }];
  else {
    const base = Math.floor((restante / abertas.length) * 100) / 100;
    abertas.forEach((x, i) => { x.valor = i === abertas.length - 1 ? arred(restante - base * (abertas.length - 1)) : base; });
    lista = [...pagas, ...abertas];
  }
  lista.sort((a, b) => (a.n || 999) - (b.n || 999));
  lista.forEach((x, i) => { x.n = i + 1; });
  p.parcelas = lista;
}

export function criarPedido(e, { origem, itens, cliente, pagamento, movs, hash, texto }) {
  const total = arred(itens.reduce((t, i) => t + i.total, 0));
  const numero = e.proximo_pedido++;
  const p = {
    id: `p${numero}`, numero, criado: agora(), origem, cliente, itens, total,
    forma: FORMAS.includes(pagamento?.forma) ? pagamento.forma : 'pix',
    parcelas: planoParcelas(total, pagamento?.modo, pagamento?.parcelas),
    status: 'novo', observacoes: [], movs, hash,
  };
  if (texto) p.texto = String(texto).slice(0, 2500);
  e.pedidos.push(p);
  return p;
}

const achaPedido = (e, id) => {
  const p = e.pedidos.find((x) => x.id === id);
  if (!p) throw erro('Pedido não encontrado.', 404);
  return p;
};
const abertoParaMudar = (p) => { if (p.status === 'cancelado') throw erro('Esse pedido está cancelado.'); return p; };

export function pedidoParaTela(p) {
  const pago = arred(p.parcelas.filter((x) => x.pago).reduce((t, x) => t + x.valor, 0));
  return { ...p, texto: undefined, movs: undefined, estoque_movido: (p.movs || []).length > 0, pago, falta: arred(Math.max(p.total - pago, 0)) };
}

export function statusPedido(e, id, status) {
  const p = abertoParaMudar(achaPedido(e, id));
  if (!STATUS_PEDIDO.includes(status)) throw erro('Etapa inválida.');
  p.status = status;
  if (status === 'entregue') p.entregue_em = agora(); else delete p.entregue_em;
}

export function observacaoPedido(e, id, texto) {
  const p = achaPedido(e, id);
  const t = limpar(texto, 500);
  if (!t) throw erro('Escreva a observação.');
  p.observacoes.push({ data: agora(), texto: t });
}

export function clientePedido(e, id, d) { achaPedido(e, id).cliente = clienteDe(d); }

export function formaPedido(e, id, forma) {
  if (!FORMAS.includes(forma)) throw erro('Forma de pagamento inválida.');
  achaPedido(e, id).forma = forma;
}

export function parcelaPedido(e, id, n, pago) {
  const p = abertoParaMudar(achaPedido(e, id));
  const parcela = p.parcelas.find((x) => x.n === Number(n));
  if (!parcela) throw erro('Parcela não encontrada.');
  parcela.pago = Boolean(pago);
  if (parcela.pago) parcela.data = agora(); else delete parcela.data;
}

export function quitarPedido(e, id) {
  const p = abertoParaMudar(achaPedido(e, id));
  for (const x of p.parcelas) if (!x.pago) { x.pago = true; x.data = agora(); }
}

export function parcelamentoPedido(e, id, modo, n) {
  const p = abertoParaMudar(achaPedido(e, id));
  if (p.parcelas.some((x) => x.pago)) throw erro('Já há parcela paga. Desmarque as pagas antes de mudar o parcelamento.');
  if (!['pago', 'pendente', 'parcelado'].includes(modo)) throw erro('Escolha como será o pagamento.');
  p.parcelas = planoParcelas(p.total, modo, n);
}

// Item novo no pedido. Perfume de 30/50 ml desconta do estoque e dos insumos, como uma baixa.
export function adicionarItemPedido(e, id, d) {
  const p = abertoParaMudar(achaPedido(e, id));
  const qtd = quantidade(d.qtd, 1000);
  if (!qtd) throw erro('Informe a quantidade.');
  let item;
  let movs = [];
  if (d.produto_id) {
    const prod = todos(e).find((x) => x.id === d.produto_id);
    if (!prod) throw erro('Produto não encontrado.');
    const variante = d.tamanho || prod.variants?.[0]?.size || '';
    const unit = d.preco != null && String(d.preco).trim() !== '' ? preco(d.preco, 'preço') : precoUnitario(e, prod, variante);
    item = { nome: prod.name, variante, qtd, total: arred(unit * qtd), produto_id: prod.id };
    const sim = simularBaixa(e, [{ qtd, nome: prod.name, variante }]);
    if (sim.problemas.length) throw erro(sim.problemas.join('; '), 409);
    movs = sim.movs;
  } else {
    const nome = limpar(d.nome, 80);
    if (!nome) throw erro('Dê um nome ao item.');
    item = { nome, variante: '', qtd, total: arred(preco(d.preco, 'preço') * qtd) };
  }
  p.itens.push(item);
  p.total = arred(p.total + item.total);
  recalcularParcelas(p);
  if (movs.length) {
    p.movs = [...(p.movs || []), ...movs];
    registrar(e, {
      tipo: 'pedido-item',
      descricao: `Pedido #${p.numero}: +${qtd}x ${item.nome}${item.variante ? ` (${item.variante})` : ''}`,
      movs,
      meta: { pedido: p.id, item: { indice: p.itens.length - 1, total: item.total, movs } },
    });
  }
}

export function cancelarPedido(e, id, devolver) {
  const p = abertoParaMudar(achaPedido(e, id));
  const anterior = p.status;
  p.status = 'cancelado';
  p.cancelado_em = agora();
  if (devolver && p.movs?.length) {
    registrar(e, {
      tipo: 'cancelamento',
      descricao: `Pedido #${p.numero} cancelado: devolveu ao estoque`,
      movs: p.movs.map((m) => ({ ...m, delta: -m.delta })),
      meta: { pedido: p.id, cancelamento: { anterior } },
    });
    p.devolvido = true;
  }
}

// ---------- Maturação ----------
// Lotes de perfume que estão maturando: quanto, desde quando e por quantos dias. Servem de base
// para saber quando lançar. Ao ficar pronto, o lote vai para o estoque como granel.
export const hojeSP = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
const dataOk = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s)) && !Number.isNaN(Date.parse(s));
const somaDias = (s, n) => { const [a, m, d] = s.split('-').map(Number); return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10); };
const difDias = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

function dadosLote(e, d) {
  const prod = d.produto_id ? todos(e).find((p) => p.id === d.produto_id && p.category === 'perfumes') : null;
  if (d.produto_id && !prod) throw erro('Perfume não encontrado.');
  const nome = prod ? prod.name : limpar(d.nome, 80);
  if (!nome) throw erro('Escolha o perfume ou digite o nome.');
  const ml = quantidade(d.ml, 100000);
  if (!ml) throw erro('Informe quantos ml estão maturando.');
  const dias = quantidade(d.dias, 365);
  if (!dias) throw erro('Informe quantos dias de maturação.');
  const inicio = dataOk(d.inicio) ? d.inicio : hojeSP();
  return { produto_id: prod?.id, nome, ml, inicio, dias, previsto: somaDias(inicio, dias), obs: limpar(d.obs, 200) };
}

const achaLote = (e, id) => {
  const l = e.maturacao.find((x) => x.id === id);
  if (!l) throw erro('Lote não encontrado.', 404);
  return l;
};

export function criarLote(e, d) {
  const l = { id: 'm' + crypto.randomBytes(3).toString('hex'), status: 'maturando', criado: agora(), ...dadosLote(e, d) };
  e.maturacao.push(l);
  return l;
}

export function editarLote(e, id, d) {
  const l = achaLote(e, id);
  if (l.status === 'concluido') throw erro('Esse lote já foi para o estoque.');
  Object.assign(l, dadosLote(e, d));
}

export function removerLote(e, id) {
  achaLote(e, id);
  e.maturacao = e.maturacao.filter((l) => l.id !== id);
}

// Colocar no estoque: os ml entram como granel do perfume escolhido. Dá para desfazer.
export function concluirLote(e, id, d) {
  const l = achaLote(e, id);
  if (l.status === 'concluido') throw erro('Esse lote já foi para o estoque.');
  const produtoId = d.produto_id || l.produto_id;
  if (!produtoId) throw erro('Escolha em qual perfume do catálogo ele entra.');
  const ml = d.ml ? quantidade(d.ml, 100000) : l.ml;
  if (!ml) throw erro('Informe quantos ml entram no estoque.');
  const movs = movimentosDeEntrada(e, { id: produtoId, ml });
  const nome = todos(e).find((p) => p.id === produtoId).name;
  registrar(e, { tipo: 'entrada', descricao: `Maturação concluída: +${ml} ml de ${nome}`, movs, meta: { maturacao: l.id } });
  l.status = 'concluido';
  l.concluido_em = agora();
  l.destino_id = produtoId;   // para onde foi; o perfume original do lote não muda
  l.ml_entrada = ml;
}

export function lotesParaTela(e) {
  const hoje = hojeSP();
  const prontoEm = (l) => difDias(hoje, l.previsto);
  const ativos = e.maturacao.filter((l) => l.status === 'maturando')
    .sort((a, b) => a.previsto.localeCompare(b.previsto))
    .map((l) => ({ ...l, dias_restantes: prontoEm(l), progresso: Math.min(1, Math.max(0, difDias(l.inicio, hoje) / l.dias)) }));
  const feitos = e.maturacao.filter((l) => l.status === 'concluido')
    .sort((a, b) => String(b.concluido_em).localeCompare(String(a.concluido_em))).slice(0, 8)
    .map((l) => ({ ...l, dias_restantes: 0, progresso: 1 }));
  return [...ativos, ...feitos];
}

// Ajuste manual: define os valores certos e guarda só a diferença.
export function movimentosDeAjuste(e, { id, granel_ml, unidades }) {
  const atual = e.produtos[id] || { granel_ml: 0, unidades: {} };
  const movs = [];
  if (granel_ml != null && granel_ml !== (atual.granel_ml || 0)) movs.push({ id, campo: 'granel_ml', delta: granel_ml - (atual.granel_ml || 0) });
  for (const s of e.tamanhos) {
    const novo = unidades?.[s];
    const antes = atual.unidades?.[s] || 0;
    if (novo != null && novo !== antes) movs.push({ id, campo: s, delta: novo - antes });
  }
  return movs;
}
