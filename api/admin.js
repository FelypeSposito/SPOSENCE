// POST /api/admin — painel da Sposence. Exige a senha (variável ADMIN_PASSWORD) no cabeçalho x-admin-senha.
//
// Corpo: { acao, ... }
//   estado
//   pedido          { texto, confirmar }                       baixa a partir da mensagem do pedido
//   venda           { itens: [{id, tamanho, qtd}], confirmar } venda avulsa
//   entrada         { id, ml }  ou  { id, tamanho, qtd }
//   ajustar         { id, granel_ml, unidades: { "30ml": n } }
//   desfazer
//   produto_status  { id, status: "visivel" | "esgotado" | "oculto" }
//   produto_precos  { id, precos: { "30ml": 90 } }
//   produto_criar   { tipo: "perfume" | "creme", nome, ... }
//   produto_editar  { id, nome, ... }                          só produtos criados pelo painel
//   produto_remover { id }                                     só produtos criados pelo painel
import crypto from 'node:crypto';
import {
  carregar, salvar, estado, todos, itensDoPedido, hashDoPedido, simularBaixa,
  registrar, desfazerUltimo, movimentosDeEntrada, movimentosDeAjuste,
  criarProduto, editarProduto, removerProduto, definirStatus, definirPrecos,
} from './_estoque.js';

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const digest = (s) => crypto.createHash('sha256').update(String(s)).digest();

function senhaCorreta(req) {
  const esperada = process.env.ADMIN_PASSWORD;
  if (!esperada) throw Object.assign(new Error('Falta configurar ADMIN_PASSWORD na Vercel.'), { status: 500 });
  return crypto.timingSafeEqual(digest(req.headers['x-admin-senha'] || ''), digest(esperada));
}

const inteiro = (v, max = 100000) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0 || n > max) throw Object.assign(new Error('Número inválido.'), { status: 400 });
  return n;
};

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method !== 'POST') return res.status(405).json({ erro: 'Use POST.' });
    if (!senhaCorreta(req)) {
      await dormir(600);
      return res.status(401).json({ erro: 'Senha incorreta.' });
    }
    const b = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    const e = await carregar();
    let extra = {};

    if (b.acao === 'estado') {
      // só devolve o estado
    } else if (b.acao === 'pedido' || b.acao === 'venda') {
      let itens, hash, tipo;
      if (b.acao === 'pedido') {
        itens = itensDoPedido(b.texto || '');
        if (!itens.length) return res.status(400).json({ erro: 'Não achei itens nessa mensagem. Copie a mensagem inteira do pedido.' });
        hash = hashDoPedido(b.texto);
        const repetido = e.historico.find((h) => h.hash === hash);
        if (repetido) return res.status(409).json({ erro: `Esse pedido já teve baixa em ${repetido.data}.` });
        tipo = 'pedido';
      } else {
        const nomes = new Map(todos(e).map((p) => [p.id, p.name]));
        itens = (b.itens || []).map((i) => {
          if (!nomes.has(i.id)) throw Object.assign(new Error(`Produto "${i.id}" não existe.`), { status: 400 });
          return { qtd: inteiro(i.qtd, 1000), nome: nomes.get(i.id), variante: i.tamanho };
        });
        if (!itens.length || itens.some((i) => !i.qtd)) return res.status(400).json({ erro: 'Escolha pelo menos um item.' });
        tipo = 'venda';
      }
      const descricao = itens.map((i) => `${i.qtd}x ${i.nome} (${i.variante})`).join(', ');
      const sim = simularBaixa(e, itens);
      if (sim.problemas.length) return res.status(409).json({ erro: 'Falta estoque, nada foi descontado.', linhas: sim.linhas, problemas: sim.problemas });
      if (!b.confirmar) return res.status(200).json({ previa: true, linhas: sim.linhas, descricao });
      if (sim.movs.length) {
        registrar(e, { tipo, descricao, movs: sim.movs, hash });
        await salvar(e);
      }
      extra = { feito: true, linhas: sim.linhas, nada_a_descontar: !sim.movs.length };
    } else if (b.acao === 'entrada') {
      const movs = movimentosDeEntrada(e, { id: b.id, ml: b.ml ? inteiro(b.ml) : 0, tamanho: b.tamanho, qtd: b.qtd ? inteiro(b.qtd) : 0 });
      if (!movs[0].delta) return res.status(400).json({ erro: 'Informe uma quantidade maior que zero.' });
      const nome = todos(e).find((p) => p.id === b.id).name;
      const quanto = movs[0].campo === 'granel_ml' ? `${movs[0].delta} ml a granel` : `${movs[0].delta} frasco(s) de ${movs[0].campo}`;
      registrar(e, { tipo: 'entrada', descricao: `+${quanto} de ${nome}`, movs });
      await salvar(e);
    } else if (b.acao === 'ajustar') {
      const unidades = Object.fromEntries(Object.entries(b.unidades || {}).map(([s, n]) => [s, inteiro(n)]));
      const movs = movimentosDeAjuste(e, { id: b.id, granel_ml: b.granel_ml == null ? null : inteiro(b.granel_ml), unidades });
      if (movs.length) {
        const nome = todos(e).find((p) => p.id === b.id)?.name || b.id;
        registrar(e, { tipo: 'ajuste', descricao: `Correção manual de ${nome}`, movs });
        await salvar(e);
      }
    } else if (b.acao === 'desfazer') {
      const h = desfazerUltimo(e);
      await salvar(e);
      extra = { desfeito: h.descricao };
    } else if (b.acao === 'produto_status') {
      definirStatus(e, b.id, b.status);
      await salvar(e);
    } else if (b.acao === 'produto_precos') {
      definirPrecos(e, b.id, b.precos);
      await salvar(e);
    } else if (b.acao === 'produto_criar') {
      extra = { criado: criarProduto(e, b).id };
      await salvar(e);
    } else if (b.acao === 'produto_editar') {
      editarProduto(e, b.id, b);
      await salvar(e);
    } else if (b.acao === 'produto_remover') {
      removerProduto(e, b.id);
      await salvar(e);
    } else {
      return res.status(400).json({ erro: 'Ação desconhecida.' });
    }

    res.status(200).json({ ok: true, estado: estado(e), ...extra });
  } catch (err) {
    res.status(err.status || 500).json({ erro: err.message || 'Erro inesperado.' });
  }
}
