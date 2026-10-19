// Custo de cada produto (a partir de tools/custos.json) e sugestão de desconto quando a venda tem mais de um item.
// A ideia: o desconto é pequeno e redondo, nunca passa do que mantém a margem, e mostra quanto sobra de lucro.
import fs from 'node:fs';
import path from 'node:path';

let _c;
function custos() {
  if (_c === undefined) {
    try { _c = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'tools', 'custos.json'), 'utf8')); } catch (_) { _c = null; }
  }
  return _c;
}
const porUnidade = (ins, un = 'ml') => (ins && ins.preco != null && ins[un] ? ins.preco / ins[un] : null);
const arred = (n) => Math.round(n * 100) / 100;

// custo de uma unidade; null quando não dá para saber
export function custoUnitario(produto, variante) {
  const c = custos();
  if (!c || !produto) return null;
  const emb = (tipo, tam) => (c.montagem[tipo] || []).reduce((t, i) => t + (c.embalagens[i === 'vidro' ? `vidro_${tam}` : i] ?? 0), 0);
  if (produto.category === 'perfumes') {
    const ml = parseInt(variante, 10);
    const ess = porUnidade(c.insumos.essencia_perfume), base = porUnidade(c.insumos.base_perfume);
    if (!ml || ess == null || base == null) return null;
    const conc = c.concentracao.perfume;
    return arred(ml * conc * ess + ml * (1 - conc) * base + emb('perfume', `${ml}ml`));
  }
  if (produto.category === 'skincare') {
    const g = parseInt(produto.volume || '100', 10);
    const ess = porUnidade(c.insumos.essencia_creme), base = porUnidade(c.insumos.base_creme, 'g');
    const conc = c.concentracao.creme;
    if (ess == null || base == null || conc == null) return null;
    return arred(g * conc * ess + g * (1 - conc) * base + emb('creme'));
  }
  return null;
}

const MARGEM_MINIMA = 0.6;   // o desconto máximo nunca deixa a margem abaixo disso
const redondo = (v) => Math.round(v / 5) * 5;

// itens: [{ qtd, total, custo }]; devolve as opções de desconto (ou null quando só há um item)
export function sugerirDesconto(itens) {
  const unidades = itens.reduce((t, i) => t + i.qtd, 0);
  const subtotal = arred(itens.reduce((t, i) => t + i.total, 0));
  if (unidades < 2 || subtotal <= 0) return null;
  const conhecidos = itens.every((i) => i.custo != null);
  const custo = conhecidos ? arred(itens.reduce((t, i) => t + i.custo * i.qtd, 0)) : null;
  const tier = unidades === 2 ? 6 : unidades === 3 ? 9 : 12;
  // o máximo é o menor entre 20% e o que preserva a margem mínima
  const maxPct = custo == null ? tier * 1.5 : Math.max(0, Math.min(20, ((subtotal - custo / (1 - MARGEM_MINIMA)) / subtotal) * 100));
  const opcoes = [];
  const monta = (id, rotulo, pct, nota) => {
    const alvo = Math.min(pct, maxPct);
    if (alvo < 1) return;
    let total = redondo(subtotal * (1 - alvo / 100));
    if (total >= subtotal) total = subtotal - 5;
    if (custo != null && (total - custo) / total < MARGEM_MINIMA - 0.005) total = Math.ceil(custo / (1 - MARGEM_MINIMA));
    if (total >= subtotal || opcoes.some((o) => o.total === total)) return;
    const desconto = arred(subtotal - total);
    opcoes.push({ id, rotulo, nota, total, desconto, pct: Math.round((desconto / subtotal) * 1000) / 10,
      lucro: custo == null ? null : arred(total - custo), margem: custo == null ? null : Math.round(((total - custo) / total) * 100) });
  };
  monta('leve', 'Desconto leve', Math.round(tier / 2), 'agrada sem mexer muito no lucro');
  monta('recomendado', 'Desconto do combo', tier, `${unidades} itens: o ponto em que vale fechar`);
  monta('maximo', 'Máximo', maxPct, custo == null ? 'limite sugerido' : `ainda deixa ${Math.round(MARGEM_MINIMA * 100)}% de margem`);
  if (!opcoes.length) return { subtotal, custo, lucro: custo == null ? null : arred(subtotal - custo), unidades, opcoes: [], recomendada: null };
  const recomendada = (opcoes.find((o) => o.id === 'recomendado') || opcoes[0]).id;
  return { subtotal, custo, lucro: custo == null ? null : arred(subtotal - custo), unidades, opcoes, recomendada };
}
