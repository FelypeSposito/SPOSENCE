// Regras do estoque da Sposence (usadas pela API do admin e pela API pública).
//
// Estado guardado: { tamanhos, produtos: { id: { granel_ml, unidades: { "30ml": n } } }, historico }
// - granel_ml: perfume pronto ainda não envasado
// - unidades: frascos já envasados, por tamanho
// Cada baixa usa primeiro os frascos prontos do tamanho e, se não houver, tira do granel.
// Toda mudança vira uma lista de movimentos, que permite desfazer.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { lerJSON, gravarJSON } from './_redis.js';

const RAIZ = process.cwd();
const CHAVE = 'sposence:estoque';
const MAX_HISTORICO = 200;

let _catalogo;
export function catalogo() {
  if (!_catalogo) {
    const js = fs.readFileSync(path.join(RAIZ, 'js', 'data.js'), 'utf8');
    const D = vm.runInNewContext(`${js}\n;SPOSENCE_DATA`);
    _catalogo = [...D.perfumes, ...D.body_splashes, ...D.skincare, ...D.merchandise];
  }
  return _catalogo;
}

export async function carregar() {
  let e = await lerJSON(CHAVE);
  if (!e) {
    e = JSON.parse(fs.readFileSync(path.join(RAIZ, 'tools', 'estoque.json'), 'utf8'));
    await gravarJSON(CHAVE, e);
  }
  return e;
}
export const salvar = (e) => gravarJSON(CHAVE, e);

const ml = (size) => parseInt(size, 10);
const normal = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const agora = () => new Date().toLocaleString('sv-SE', { timeZone: 'America/Sao_Paulo' }).slice(0, 16);

export function disponivel(item, size) {
  return (item.unidades?.[size] || 0) + Math.floor((item.granel_ml || 0) / ml(size));
}

// O que o site público precisa saber: quantos frascos dá pra vender de cada tamanho.
export function publico(e) {
  const produtos = {};
  for (const [id, item] of Object.entries(e.produtos)) {
    produtos[id] = Object.fromEntries(e.tamanhos.map((s) => [s, disponivel(item, s)]));
  }
  return { produtos };
}

export function estado(e) {
  const nomes = new Map(catalogo().map((p) => [p.id, p.name]));
  return {
    tamanhos: e.tamanhos,
    produtos: Object.entries(e.produtos).map(([id, item]) => ({
      id,
      nome: nomes.get(id) || id,
      granel_ml: item.granel_ml || 0,
      unidades: Object.fromEntries(e.tamanhos.map((s) => [s, item.unidades?.[s] || 0])),
      vende: Object.fromEntries(e.tamanhos.map((s) => [s, disponivel(item, s)])),
    })),
    catalogo: catalogo().filter((p) => p.category === 'perfumes').map((p) => ({ id: p.id, nome: p.name })),
    historico: e.historico.slice(-30).reverse().map((h) => ({ id: h.id, data: h.data, tipo: h.tipo, descricao: h.descricao })),
  };
}

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
    const produto = catalogo().find((p) => normal(p.name) === normal(it.nome));
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
  if (!h) throw new Error('Não há nada para desfazer.');
  for (const m of h.movs) aplicarMov(e, m, -1);
  e.historico.pop();
  return h;
}

export function movimentosDeEntrada(e, { id, ml: granel, tamanho, qtd }) {
  if (!catalogo().some((p) => p.id === id)) throw new Error(`Produto "${id}" não existe no catálogo do site.`);
  if (granel) return [{ id, campo: 'granel_ml', delta: granel }];
  if (!e.tamanhos.includes(tamanho)) throw new Error(`Tamanho inválido: ${tamanho}`);
  return [{ id, campo: tamanho, delta: qtd }];
}

// Ajuste manual: define os valores certos e guarda só a diferença.
export function movimentosDeAjuste(e, { id, granel_ml, unidades }) {
  const atual = e.produtos[id] || { granel_ml: 0, unidades: {} };
  const movs = [];
  if (granel_ml !== atual.granel_ml && granel_ml != null) movs.push({ id, campo: 'granel_ml', delta: granel_ml - (atual.granel_ml || 0) });
  for (const s of e.tamanhos) {
    const novo = unidades?.[s];
    const antes = atual.unidades?.[s] || 0;
    if (novo != null && novo !== antes) movs.push({ id, campo: s, delta: novo - antes });
  }
  return movs;
}
