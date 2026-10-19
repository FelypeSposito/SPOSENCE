// /api/conta — conta do cliente no site (login com Google).
//   GET                          → { clientId, politica }   (o navegador usa para montar o botão do Google)
//   POST { acao: "entrar", credential }
//   POST { acao: "eu" } · "salvar" { gosto, usou, desejos, consentimento } · "exportar" · "excluir" · "sair"
import { contagem, contar } from './_redis.js';
import { carregar, salvar } from './_estoque.js';
import { clientesInternos } from './_clientes.js';
import {
  VERSAO_POLITICA, verificarGoogle, entrar, lerConta, excluirConta, salvarPreferencias,
  criarCookie, limparCookie, subDaSessao, contaPublica, listarContas,
} from './_contas.js';

const LIMITE_ENTRADAS = 30;   // tentativas de login por aparelho a cada 10 minutos

// pedidos que o painel confirmou como sendo desta conta
async function pedidosDaConta(sub) {
  const e = await carregar();
  const id = Object.entries(e.clientes_extra || {}).find(([, x]) => x.conta_sub === sub)?.[0];
  if (!id) return { e, pedidos: [] };
  const c = clientesInternos(e, await listarContas()).find((x) => x.id === id);
  return { e, pedidos: c ? c.pedidos.slice().reverse().map((p) => ({ numero: p.numero, data: p.data, total: p.total, status: p.status, itens: p.itens })) : [] };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method === 'GET') return res.status(200).json({ clientId: process.env.GOOGLE_CLIENT_ID || '', politica: VERSAO_POLITICA });
    if (req.method !== 'POST') return res.status(405).json({ erro: 'Use POST.' });
    // só aceita pedidos vindos do próprio site
    const origem = req.headers.origin;
    if (origem) { let host = ''; try { host = new URL(origem).host; } catch (_) {} if (host !== req.headers.host) return res.status(403).json({ erro: 'Origem não permitida.' }); }
    const b = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};

    if (b.acao === 'sair') { res.setHeader('Set-Cookie', limparCookie()); return res.status(200).json({ ok: true }); }

    if (b.acao === 'entrar') {
      const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || 'desconhecido';
      if ((await contagem(`rl:conta:${ip}`)) >= LIMITE_ENTRADAS) return res.status(429).json({ erro: 'Muitas tentativas. Aguarde alguns minutos.' });
      await contar(`rl:conta:${ip}`, 600);
      const info = await verificarGoogle(b.credential);
      const conta = await entrar(info);
      res.setHeader('Set-Cookie', criarCookie(conta.sub));
      const { pedidos } = await pedidosDaConta(conta.sub);
      return res.status(200).json({ conta: contaPublica(conta), pedidos });
    }

    const sub = subDaSessao(req);
    const conta = sub && (await lerConta(sub));
    if (!conta) { res.setHeader('Set-Cookie', limparCookie()); return res.status(401).json({ erro: 'Entre com o Google para continuar.' }); }

    if (b.acao === 'eu') {
      const { pedidos } = await pedidosDaConta(sub);
      return res.status(200).json({ conta: contaPublica(conta), pedidos });
    }
    if (b.acao === 'salvar') {
      const e = await carregar();
      await salvarPreferencias(e, conta, b);
      return res.status(200).json({ conta: contaPublica(conta) });
    }
    if (b.acao === 'exportar') {
      const { pedidos } = await pedidosDaConta(sub);
      return res.status(200).json({ exportado_em: new Date().toISOString(), conta: contaPublica(conta), pedidos });
    }
    if (b.acao === 'excluir') {
      const { e } = await pedidosDaConta(sub);
      for (const x of Object.values(e.clientes_extra || {})) if (x.conta_sub === sub) delete x.conta_sub;
      await salvar(e);
      await excluirConta(sub);
      res.setHeader('Set-Cookie', limparCookie());
      return res.status(200).json({ ok: true });
    }
    return res.status(400).json({ erro: 'Ação desconhecida.' });
  } catch (err) {
    res.status(err.status || 500).json({ erro: err.message || 'Erro inesperado.' });
  }
}
