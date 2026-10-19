// POST /api/admin — painel da Sposence. Exige a senha (variável ADMIN_PASSWORD) no cabeçalho x-admin-senha.
//
// Corpo: { acao, ... }
//   estado
//   pedido          { texto, confirmar }                       baixa a partir da mensagem do pedido
//   venda           { itens: [{id, tamanho, qtd}], confirmar } venda avulsa
//   venda           também aceita { valor_total, obs }          valor combinado (desconto) e observação do pedido
//   saida_ml        { id, ml, motivo, obs, confirmar }          tira ml do granel sem venda (amostra, perda, presente)
//   entrada         { id, ml }  ou  { id, tamanho, qtd }  ou  { id, unidades: { "30ml": 5, "50ml": 3 } }
//   envasar         { id, unidades: { "30ml": 5, "50ml": 3 } }   tira os ml do granel
//   ajustar         { id, granel_ml, unidades: { "30ml": n } }
//   desfazer
//   cliente_vincular {id, sub} · cliente_desvincular {id}   (liga o cliente à conta do site; só então ele vê os pedidos)
//   clientes · cliente_contato {id, nota} · cliente_dados {id, notas, nao_chamar} · lancamento {produto_id | perfil, publico, notas, nome}
//   maturacao_criar {produto_id | nome, ml, inicio: "AAAA-MM-DD", dias, obs} · maturacao_editar {id, ...} · maturacao_remover {id}
//   maturacao_concluir {id, produto_id, ml}   os ml entram como granel; dá para desfazer
//   pedido_status {id, status} · pedido_obs {id, texto} · pedido_cliente {id, nome, telefone, recebimento}
//   pedido_forma {id, forma} · pedido_parcela {id, n, pago} · pedido_quitar {id}
//   pedido_parcelamento {id, modo, parcelas} · pedido_item {id, produto_id, tamanho, qtd, preco | nome} · pedido_cancelar {id, devolver}
//   (pedido e venda também aceitam { pagamento: {modo, parcelas, forma}, cliente } e criam o pedido ao confirmar)
//   insumo_entrada  { id, qtd }                                comprou mais
//   insumo_uso      { id, qtd }                                gastou
//   insumo_ajustar  { id, qtd }                                corrige a contagem
//   insumo_criar    { nome, unidade: "un" | "g" | "ml", qtd, minimo }
//   insumo_remover  { id }
//   produto_status  { id, status: "visivel" | "esgotado" | "oculto" }
//   produto_precos  { id, precos: { "30ml": 90 } }
//   produto_criar   { tipo: "perfume" | "creme", nome, ... }
//   produto_editar  { id, nome, ... }                          só produtos criados pelo painel
//   produto_remover { id }                                     só produtos criados pelo painel
import crypto from 'node:crypto';
import { contagem, contar } from './_redis.js';
import { painelClientes, lancamento, registrarContato, dadosCliente, vincularConta, desvincularConta } from './_clientes.js';
import { listarContas } from './_contas.js';
import {
  carregar, salvar, estado, todos, itensDoPedido, hashDoPedido, simularBaixa,
  registrar, desfazerUltimo, movimentosDeEntrada, movimentosDeAjuste, movimentosDeUnidades,
  criarProduto, editarProduto, removerProduto, definirStatus, definirPrecos,
  movimentoDeInsumo, movimentoDeAjusteInsumo, criarInsumo, removerInsumo,
  clienteDe, clienteDoTexto, itensParaPedido, criarPedido, statusPedido, observacaoPedido, clientePedido,
  formaPedido, parcelaPedido, quitarPedido, parcelamentoPedido, adicionarItemPedido, cancelarPedido,
  criarLote, editarLote, removerLote, concluirLote, limpar,
} from './_estoque.js';
import { custoUnitario, sugerirDesconto } from './_custos.js';

const LIMITE_TENTATIVAS = 8;   // senhas erradas por aparelho...
const JANELA_SEGUNDOS = 600;  // ...a cada 10 minutos

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
    // Quem errou a senha muitas vezes espera, mesmo que a próxima esteja certa.
    const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || 'desconhecido';
    const chave = `rl:admin:${ip}`;
    if ((await contagem(chave)) >= LIMITE_TENTATIVAS) {
      return res.status(429).json({ erro: 'Muitas tentativas. Aguarde 10 minutos e tente de novo.' });
    }
    if (!senhaCorreta(req)) {
      const restantes = LIMITE_TENTATIVAS - (await contar(chave, JANELA_SEGUNDOS));
      await dormir(600);
      return res.status(401).json({
        erro: restantes > 0 && restantes <= 3 ? `Senha incorreta. Restam ${restantes} ${restantes === 1 ? 'tentativa' : 'tentativas'}.` : 'Senha incorreta.',
      });
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
        const repetido = e.historico.find((h) => h.hash === hash) || e.pedidos.find((p) => p.hash === hash);
        if (repetido) return res.status(409).json({ erro: `Esse pedido já foi lançado em ${repetido.data || repetido.criado}.` });
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
      const cliente = b.acao === 'pedido' ? clienteDoTexto(b.texto) : clienteDe(b.cliente);
      const descricao = itens.map((i) => `${i.qtd}x ${i.nome} (${i.variante})`).join(', ') + (cliente.nome ? ` · ${cliente.nome}` : '');
      const sim = simularBaixa(e, itens);
      if (sim.problemas.length) return res.status(409).json({ erro: 'Falta estoque, nada foi descontado.', linhas: sim.linhas, problemas: sim.problemas });
      const itensPedido = itensParaPedido(e, itens);
      const subtotal = Math.round(itensPedido.reduce((t, i) => t + i.total, 0) * 100) / 100;
      // valor combinado com a pessoa (desconto, arredondamento): vale no pedido e é rateado entre os itens
      let desconto;
      const valor = b.valor_total === undefined || b.valor_total === '' || b.valor_total === null ? null : Number(b.valor_total);
      if (valor !== null) {
        if (!Number.isFinite(valor) || valor <= 0 || valor > 100000) return res.status(400).json({ erro: 'O valor combinado precisa ser maior que zero.' });
        if (Math.abs(valor - subtotal) >= 0.01) {
          const razao = valor / (subtotal || 1);
          let resto = valor;
          itensPedido.forEach((i, k) => { const t = k === itensPedido.length - 1 ? Math.round(resto * 100) / 100 : Math.round(i.total * razao * 100) / 100; i.total = t; resto -= t; });
          desconto = { de: subtotal, para: valor };
        }
      }
      const custoDe = (i) => { const p = todos(e).find((x) => x.id === i.produto_id); return p ? custoUnitario(p, i.variante) : null; };
      const sugestao = b.acao === 'venda' ? sugerirDesconto(itensPedido.map((i) => ({ qtd: i.qtd, total: i.total, custo: custoDe(i) }))) : null;
      const custoTotal = itensPedido.every((i) => custoDe(i) != null) ? Math.round(itensPedido.reduce((t, i) => t + custoDe(i) * i.qtd, 0) * 100) / 100 : null;
      const resumoValor = { subtotal, total: valor !== null && desconto ? valor : subtotal, custo: custoTotal, lucro: custoTotal == null ? null : Math.round(((desconto ? valor : subtotal) - custoTotal) * 100) / 100 };
      if (!b.confirmar) return res.status(200).json({ previa: true, linhas: sim.linhas, descricao, valor: resumoValor, desconto_sugerido: sugestao && !desconto ? sugestao : null });
      const pagamento = { modo: ['pago', 'pendente', 'parcelado'].includes(b.pagamento?.modo) ? b.pagamento.modo : (b.acao === 'pedido' ? 'pendente' : 'pago'), parcelas: b.pagamento?.parcelas, forma: b.pagamento?.forma };
      const pedido = criarPedido(e, {
        origem: b.acao === 'pedido' ? 'site' : 'avulsa',
        itens: itensPedido, cliente,
        pagamento, movs: sim.movs, hash, texto: b.acao === 'pedido' ? b.texto : undefined,
        desconto, obs: b.obs,
      });
      if (sim.movs.length) registrar(e, { tipo, descricao, movs: sim.movs, hash, meta: { pedido: pedido.id } });
      await salvar(e);
      extra = { feito: true, linhas: sim.linhas, nada_a_descontar: !sim.movs.length, pedido: { id: pedido.id, numero: pedido.numero } };
    } else if (b.acao === 'entrada' && b.unidades) {
      const r = movimentosDeUnidades(e, { id: b.id, unidades: b.unidades });
      registrar(e, { tipo: 'entrada', descricao: `+${r.partes.join(' e ')} de ${todos(e).find((p) => p.id === b.id).name}`, movs: r.movs });
      await salvar(e);
    } else if (b.acao === 'envasar') {
      const r = movimentosDeUnidades(e, { id: b.id, unidades: b.unidades, envasar: true });
      registrar(e, { tipo: 'envase', descricao: `Envase de ${r.partes.join(' e ')} de ${todos(e).find((p) => p.id === b.id).name} (−${r.usado} ml do granel)`, movs: r.movs });
      await salvar(e);
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
    } else if (b.acao === 'saida_ml') {
      const prod = todos(e).find((p) => p.id === b.id && p.category === 'perfumes');
      if (!prod) return res.status(404).json({ erro: 'Perfume não encontrado.' });
      const ml = inteiro(b.ml, 5000);
      if (!ml) return res.status(400).json({ erro: 'Informe quantos ml saíram.' });
      const MOTIVOS = { amostra: 'amostra', perda: 'perda na produção', presente: 'presente', teste: 'teste', outro: 'outra saída' };
      const motivo = MOTIVOS[b.motivo] ? b.motivo : 'outro';
      const granel = e.produtos[prod.id]?.granel_ml || 0;
      if (ml > granel) return res.status(409).json({ erro: 'Falta granel, nada foi descontado.', linhas: [], problemas: [`${prod.name}: só há ${granel} ml a granel. Registre a entrada ou corrija o estoque.`] });
      const obs = limpar(b.obs, 200);
      const descricao = `−${ml} ml de ${prod.name}: ${MOTIVOS[motivo]}${obs ? ` (${obs})` : ''}`;
      const linhas = [{ ok: true, texto: `${prod.name}: −${ml} ml do granel (sobram ${granel - ml} ml)` }];
      if (!b.confirmar) return res.status(200).json({ previa: true, linhas, descricao });
      registrar(e, { tipo: 'saida', descricao, movs: [{ id: prod.id, campo: 'granel_ml', delta: -ml }] });
      await salvar(e);
      extra = { feito: true, linhas, nada_a_descontar: false };
    } else if (b.acao === 'desfazer') {
      const h = desfazerUltimo(e);
      await salvar(e);
      extra = { desfeito: h.descricao };
    } else if (b.acao === 'clientes') {
      extra = { clientes: painelClientes(e, await listarContas()) };
    } else if (b.acao === 'cliente_contato') {
      const contas = await listarContas();
      registrarContato(e, b.id, b.nota, contas); await salvar(e); extra = { clientes: painelClientes(e, contas) };
    } else if (b.acao === 'cliente_dados') {
      const contas = await listarContas();
      dadosCliente(e, b.id, b, contas); await salvar(e); extra = { clientes: painelClientes(e, contas) };
    } else if (b.acao === 'cliente_vincular') {
      const contas = await listarContas();
      vincularConta(e, b.id, b.sub, contas); await salvar(e); extra = { clientes: painelClientes(e, contas) };
    } else if (b.acao === 'cliente_desvincular') {
      const contas = await listarContas();
      desvincularConta(e, b.id, contas); await salvar(e); extra = { clientes: painelClientes(e, contas) };
    } else if (b.acao === 'lancamento') {
      extra = { lancamento: lancamento(e, b, await listarContas()) };
    } else if (b.acao === 'maturacao_criar') {
      extra = { criado: criarLote(e, b).id }; await salvar(e);
    } else if (b.acao === 'maturacao_editar') {
      editarLote(e, b.id, b); await salvar(e);
    } else if (b.acao === 'maturacao_concluir') {
      concluirLote(e, b.id, b); await salvar(e);
    } else if (b.acao === 'maturacao_remover') {
      removerLote(e, b.id); await salvar(e);
    } else if (b.acao === 'pedido_status') {
      statusPedido(e, b.id, b.status); await salvar(e);
    } else if (b.acao === 'pedido_obs') {
      observacaoPedido(e, b.id, b.texto); await salvar(e);
    } else if (b.acao === 'pedido_cliente') {
      clientePedido(e, b.id, b); await salvar(e);
    } else if (b.acao === 'pedido_forma') {
      formaPedido(e, b.id, b.forma); await salvar(e);
    } else if (b.acao === 'pedido_parcela') {
      parcelaPedido(e, b.id, b.n, b.pago); await salvar(e);
    } else if (b.acao === 'pedido_quitar') {
      quitarPedido(e, b.id); await salvar(e);
    } else if (b.acao === 'pedido_parcelamento') {
      parcelamentoPedido(e, b.id, b.modo, b.parcelas); await salvar(e);
    } else if (b.acao === 'pedido_item') {
      adicionarItemPedido(e, b.id, b); await salvar(e);
    } else if (b.acao === 'pedido_cancelar') {
      cancelarPedido(e, b.id, Boolean(b.devolver)); await salvar(e);
    } else if (b.acao === 'insumo_entrada' || b.acao === 'insumo_uso') {
      const tipo = b.acao === 'insumo_uso' ? 'uso' : 'entrada';
      const r = movimentoDeInsumo(e, { id: b.id, qtd: b.qtd, tipo });
      registrar(e, { tipo: 'insumo', descricao: tipo === 'uso' ? `Usou ${r.n} ${r.insumo.unidade} de ${r.insumo.nome}` : `Comprou ${r.n} ${r.insumo.unidade} de ${r.insumo.nome}`, movs: r.movs });
      await salvar(e);
    } else if (b.acao === 'insumo_ajustar') {
      const r = movimentoDeAjusteInsumo(e, { id: b.id, qtd: b.qtd });
      if (r.movs.length) {
        registrar(e, { tipo: 'insumo', descricao: `Correção de ${r.insumo.nome}: ${r.insumo.qtd} para ${r.novo} ${r.insumo.unidade}`, movs: r.movs });
        await salvar(e);
      }
    } else if (b.acao === 'insumo_criar') {
      extra = { criado: criarInsumo(e, b).id };
      await salvar(e);
    } else if (b.acao === 'insumo_remover') {
      removerInsumo(e, b.id);
      await salvar(e);
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
