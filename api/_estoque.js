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
// O que cada frasco envasado consome.
export const RECEITA_ENVASE = {
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
    insumos: e.insumos.map((i) => ({ ...i, acabando: i.qtd <= (i.minimo ?? 0) })),
    receita_envase: RECEITA_ENVASE,
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
    const m = linha.match(/^\s*-\s*(\d+)x\s+(.+?)\s+\(([^)]+)\)\s*\|/);
    if (m) itens.push({ qtd: Number(m[1]), nome: m[2].trim(), variante: m[3].trim() });
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
  for (const it of itens) {
    const produto = todos(e).find((p) => normal(p.name) === normal(it.nome));
    const item = produto && copia[produto.id];
    if (!item || !e.tamanhos.includes(it.variante)) {
      linhas.push({ ok: null, texto: `${it.qtd}x ${it.nome} (${it.variante}): sem controle de estoque, nada a descontar` });
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

export function registrar(e, { tipo, descricao, movs, hash }) {
  for (const m of movs) aplicarMov(e, m);
  e.historico.push({ id: crypto.randomBytes(4).toString('hex'), data: agora(), tipo, descricao, movs, hash });
  e.historico = e.historico.slice(-MAX_HISTORICO);
}

export function desfazerUltimo(e) {
  const h = e.historico[e.historico.length - 1];
  if (!h) throw erro('Não há nada para desfazer.');
  for (const m of h.movs) aplicarMov(e, m, -1);
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
    // cada frasco leva um vidro, uma etiqueta e um saquinho
    const uso = {};
    for (const s of e.tamanhos) {
      const n = Number(unidades?.[s] || 0);
      for (const [iid, por] of Object.entries(RECEITA_ENVASE[s] || {})) if (n) uso[iid] = (uso[iid] || 0) + n * por;
    }
    const faltas = [];
    for (const [iid, preciso] of Object.entries(uso)) {
      const ins = e.insumos.find((i) => i.id === iid);
      if (!ins) continue;
      if (ins.qtd < preciso) faltas.push(`${ins.nome} (precisa de ${preciso}, tem ${ins.qtd})`);
      else movs.push({ id: iid, campo: 'insumo', delta: -preciso });
    }
    if (faltas.length) throw erro(`Faltam insumos para envasar: ${faltas.join('; ')}. Se a contagem estiver errada, corrija em Insumos.`);
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
