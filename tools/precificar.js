// Calcula custo, lucro e margem dos produtos usando tools/custos.json e os preços do js/data.js.
//
//   node tools/precificar.js          tabela de custo x preço
//   node tools/precificar.js 180      também mostra como dividir um lote de 180 ml de perfume
//
// Os preços vêm sempre do site (js/data.js), então mudou lá, muda aqui.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const custos = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'custos.json'), 'utf8'));
const dataJs = fs.readFileSync(path.join(ROOT, 'js', 'data.js'), 'utf8');
const DATA = vm.runInNewContext(`${dataJs}\n;SPOSENCE_DATA`);

const brl = (n) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const porUnidade = (insumo, unidade = 'ml') =>
  insumo && insumo.preco != null ? insumo.preco / insumo[unidade] : null;

// Soma itens; o que estiver sem preço vai para a lista "falta".
function somar(itens) {
  let total = 0;
  const falta = [];
  for (const [nome, valor] of itens) {
    if (valor == null || Number.isNaN(valor)) falta.push(nome);
    else total += valor;
  }
  return { total, falta };
}

function embalagens(tipo, tamanho) {
  return custos.montagem[tipo].map((item) => {
    const chave = item === 'vidro' ? `vidro_${tamanho}` : item;
    return [chave, custos.embalagens[chave] ?? null];
  });
}

function custoPerfume(ml) {
  const conc = custos.concentracao.perfume;
  const ess = porUnidade(custos.insumos.essencia_perfume);
  const base = porUnidade(custos.insumos.base_perfume);
  return somar([
    ['essencia_perfume', ml * conc * ess],
    ['base_perfume', ml * (1 - conc) * base],
    ...embalagens('perfume', `${ml}ml`),
  ]);
}

function custoCreme(g) {
  const conc = custos.concentracao.creme;
  const ess = porUnidade(custos.insumos.essencia_creme);
  const base = porUnidade(custos.insumos.base_creme, 'g');
  return somar([
    ['concentracao.creme', conc == null ? null : 0],
    ['essencia_creme', conc == null ? 0 : g * conc * ess],
    ['base_creme', conc == null || base == null ? null : g * (1 - conc) * base],
    ...embalagens('creme'),
  ]);
}

function linha(nome, preco, { total, falta }) {
  if (falta.length) return `  ${nome.padEnd(31)} ${brl(preco).padStart(10)}   falta: ${falta.join(', ')}`;
  const lucro = preco - total;
  const margem = Math.round((lucro / preco) * 100);
  return `  ${nome.padEnd(31)} ${brl(preco).padStart(10)} ${brl(total).padStart(10)} ${brl(lucro).padStart(10)} ${String(margem).padStart(5)}%`;
}

const cabecalho = `  ${'Produto'.padEnd(31)} ${'Preço'.padStart(10)} ${'Custo'.padStart(10)} ${'Lucro'.padStart(10)} Margem`;

// Perfumes: agrupa por tamanho e preço, já que quase todos têm o mesmo.
const perfumes = new Map();
for (const p of DATA.perfumes) {
  for (const v of p.variants) {
    if (v.available === false) continue;
    const chave = `${v.size}|${v.price}`;
    perfumes.set(chave, (perfumes.get(chave) || 0) + 1);
  }
}

console.log('\nPERFUMES');
console.log(cabecalho);
for (const [chave, qtd] of perfumes) {
  const [size, price] = chave.split('|');
  console.log(linha(`Perfume ${size} (${qtd} itens)`, Number(price), custoPerfume(parseInt(size, 10))));
}

console.log('\nCREMES');
console.log(cabecalho);
for (const c of DATA.skincare) {
  if (c.on_request) continue;
  const g = parseInt(c.volume || '100', 10);
  console.log(linha(`${c.name} ${g}g`, c.variants[0].price, custoCreme(g)));
}

// Lote: todas as combinações de 50 ml e 30 ml que cabem no volume.
const lote = Number(process.argv[2]);
if (lote > 0) {
  const precos = {};
  for (const [chave] of perfumes) {
    const [size, price] = chave.split('|');
    precos[parseInt(size, 10)] ??= Number(price);
  }
  const c30 = custoPerfume(30), c50 = custoPerfume(50);
  const opcoes = [];
  for (let n50 = 0; n50 * 50 <= lote; n50++) {
    const n30 = Math.floor((lote - n50 * 50) / 30);
    const sobra = lote - n50 * 50 - n30 * 30;
    const receita = n50 * precos[50] + n30 * precos[30];
    const falta = [...new Set([...(n30 ? c30.falta : []), ...(n50 ? c50.falta : [])])];
    const lucro = falta.length ? null : receita - n50 * c50.total - n30 * c30.total;
    opcoes.push({ n50, n30, sobra, receita, lucro, falta });
  }
  console.log(`\nLOTE DE ${lote} ml (por essência)`);
  for (const o of opcoes) {
    const fim = o.lucro == null ? `falta: ${o.falta.join(', ')}` : `lucro ${brl(o.lucro)}`;
    console.log(`  ${o.n50}x 50ml + ${o.n30}x 30ml  sobra ${String(o.sobra).padStart(2)} ml  receita ${brl(o.receita).padStart(10)}  ${fim}`);
  }
}
console.log('');
