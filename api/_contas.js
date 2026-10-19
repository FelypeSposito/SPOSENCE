// Contas dos clientes (login com Google), no mesmo banco do painel.
//
// - O login usa o "Entrar com Google" (Google Identity Services). O navegador recebe um token (JWT)
//   assinado pelo Google; aqui conferimos a assinatura com as chaves públicas do Google, o público
//   (GOOGLE_CLIENT_ID), o emissor e a validade. A senha do Google nunca passa por aqui.
// - A sessão é um cookie assinado (HMAC com SESSION_SECRET), HttpOnly, válido por 30 dias.
// - Cada conta guarda: consentimento de contato (com data e versão da política), gosto declarado,
//   perfumes que já usou e lista de desejos. Nada de senha, CPF ou endereço.
import crypto from 'node:crypto';
import { lerJSON, gravarJSON, apagar } from './_redis.js';
import { todos } from './_estoque.js';

export const VERSAO_POLITICA = '2026-10-19';
const COOKIE = 'sp_conta';
const DURACAO = 30 * 24 * 3600;
const INDICE = 'contas:indice';
const PERFIS = ['frescos', 'doces', 'noturnos', 'elegantes'];
const PUBLICOS = ['feminino', 'masculino', 'compartilhavel'];
const erro = (msg, status = 400) => Object.assign(new Error(msg), { status });
const agora = () => new Date().toLocaleString('sv-SE', { timeZone: 'America/Sao_Paulo' }).slice(0, 16);

/* ---------- Google ---------- */
let cacheChaves = null;
async function chavesGoogle() {
  if (cacheChaves && cacheChaves.ate > Date.now()) return cacheChaves.chaves;
  const url = process.env.GOOGLE_JWKS_URL || 'https://www.googleapis.com/oauth2/v3/certs';
  const r = await fetch(url, { signal: AbortSignal.timeout(4000) });
  if (!r.ok) throw erro('Não consegui falar com o Google agora. Tente de novo.', 503);
  const { keys } = await r.json();
  cacheChaves = { chaves: keys, ate: Date.now() + 3600 * 1000 };
  return keys;
}

export async function verificarGoogle(credencial) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) throw erro('O login com Google ainda não foi configurado.', 503);
  const [h64, p64, s64] = String(credencial || '').split('.');
  if (!s64) throw erro('Credencial inválida.', 401);
  let cab, pay;
  try { cab = JSON.parse(Buffer.from(h64, 'base64url')); pay = JSON.parse(Buffer.from(p64, 'base64url')); } catch (_) { throw erro('Credencial inválida.', 401); }
  if (cab.alg !== 'RS256') throw erro('Credencial inválida.', 401);
  const chave = (await chavesGoogle()).find((k) => k.kid === cab.kid);
  if (!chave) throw erro('Credencial inválida.', 401);
  const assinaturaOk = crypto.verify('RSA-SHA256', Buffer.from(`${h64}.${p64}`), crypto.createPublicKey({ key: chave, format: 'jwk' }), Buffer.from(s64, 'base64url'));
  const emissorOk = ['accounts.google.com', 'https://accounts.google.com'].includes(pay.iss);
  if (!assinaturaOk || pay.aud !== clientId || !emissorOk || !(pay.exp * 1000 > Date.now()) || !pay.sub) throw erro('Não consegui confirmar o login. Tente de novo.', 401);
  if (pay.email_verified === false) throw erro('O e-mail dessa conta Google não está verificado.', 401);
  return { sub: String(pay.sub), email: String(pay.email || ''), nome: String(pay.name || pay.email || 'Cliente'), foto: String(pay.picture || '') };
}

/* ---------- sessão ---------- */
const segredo = () => {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) throw erro('Falta configurar SESSION_SECRET na Vercel (pelo menos 16 caracteres).', 500);
  return s;
};
const assinar = (texto) => crypto.createHmac('sha256', segredo()).update(texto).digest('base64url');
const seguro = () => (process.env.ESTOQUE_LOCAL ? '' : '; Secure');
export function criarCookie(sub) {
  const pay = Buffer.from(JSON.stringify({ s: sub, e: Math.floor(Date.now() / 1000) + DURACAO })).toString('base64url');
  return `${COOKIE}=${pay}.${assinar(pay)}; Path=/api; HttpOnly; SameSite=Lax; Max-Age=${DURACAO}${seguro()}`;
}
export const limparCookie = () => `${COOKIE}=; Path=/api; HttpOnly; SameSite=Lax; Max-Age=0${seguro()}`;
export function subDaSessao(req) {
  const m = String(req.headers.cookie || '').match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  if (!m) return null;
  const [pay, sig] = m[1].split('.');
  if (!pay || !sig) return null;
  const a = Buffer.from(sig), b = Buffer.from(assinar(pay));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try { const d = JSON.parse(Buffer.from(pay, 'base64url')); return d.e > Date.now() / 1000 ? d.s : null; } catch (_) { return null; }
}

/* ---------- contas ---------- */
const chaveConta = (sub) => `conta:${sub}`;
export const lerConta = (sub) => lerJSON(chaveConta(sub));
export async function listarContas() {
  const ids = (await lerJSON(INDICE)) || [];
  return (await Promise.all(ids.map(lerConta))).filter(Boolean);
}
async function gravarConta(c) {
  await gravarJSON(chaveConta(c.sub), c);
  const ids = (await lerJSON(INDICE)) || [];
  if (!ids.includes(c.sub)) { ids.push(c.sub); await gravarJSON(INDICE, ids); }
}
export async function excluirConta(sub) {
  await apagar(chaveConta(sub));
  await gravarJSON(INDICE, ((await lerJSON(INDICE)) || []).filter((x) => x !== sub));
}

export async function entrar(info) {
  const existente = await lerConta(info.sub);
  const conta = existente || {
    sub: info.sub, criado: agora(),
    consentimento: { marketing: false, whatsapp: '', data: null, versao: null },
    gosto: { perfis: [], publicos: [], notas: [] }, usou: [], desejos: [], naocurte: [],
  };
  Object.assign(conta, { email: info.email, nome: info.nome, foto: info.foto, ultimo_acesso: agora() });
  await gravarConta(conta);
  return conta;
}

// o que o próprio cliente pode ver da conta (sem o identificador interno)
export const contaPublica = (c) => ({ nome: c.nome, email: c.email, foto: c.foto, criado: c.criado, consentimento: c.consentimento, gosto: c.gosto, usou: c.usou, desejos: c.desejos, naocurte: c.naocurte || [], carrinho: c.carrinho || [], politica_atual: VERSAO_POLITICA });

const digitos = (t) => String(t || '').replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '');
export async function salvarPreferencias(e, conta, corpo) {
  const notasValidas = new Set(todos(e).filter((p) => p.category === 'perfumes').flatMap((p) => p.tags || []).filter((t) => !PERFIS.includes(t) && !PUBLICOS.includes(t)));
  const idsPerfumes = new Set(todos(e).filter((p) => p.category === 'perfumes').map((p) => p.id));
  const lista = (v, validos, max) => [...new Set((Array.isArray(v) ? v : []).map(String).filter((x) => validos.has(x)))].slice(0, max);
  if (corpo.gosto) {
    conta.gosto = { perfis: lista(corpo.gosto.perfis, new Set(PERFIS), 4), publicos: lista(corpo.gosto.publicos, new Set(PUBLICOS), 3), notas: lista(corpo.gosto.notas, notasValidas, 12) };
  }
  if (Array.isArray(corpo.usou)) conta.usou = lista(corpo.usou, idsPerfumes, 40);
  if (Array.isArray(corpo.desejos)) conta.desejos = lista(corpo.desejos, idsPerfumes, 40);
  if (Array.isArray(corpo.carrinho)) conta.carrinho = lista(corpo.carrinho, idsPerfumes, 12);
  if (Array.isArray(corpo.naocurte)) conta.naocurte = lista(corpo.naocurte, idsPerfumes, 40);
  // quem não curte um perfume não o tem na lista de usados nem de desejos
  if (conta.naocurte && conta.naocurte.length) { const fora = new Set(conta.naocurte); conta.usou = (conta.usou || []).filter((x) => !fora.has(x)); conta.desejos = (conta.desejos || []).filter((x) => !fora.has(x)); }
  if (corpo.consentimento) {
    const marketing = Boolean(corpo.consentimento.marketing);
    const tel = digitos(corpo.consentimento.whatsapp);
    if (marketing && (tel.length < 10 || tel.length > 11)) throw erro('Para receber novidades, informe o WhatsApp com DDD.');
    const mudou = marketing !== Boolean(conta.consentimento.marketing);
    conta.consentimento = { marketing, whatsapp: tel ? String(corpo.consentimento.whatsapp).slice(0, 30) : '', data: mudou || !conta.consentimento.data ? agora() : conta.consentimento.data, versao: mudou || !conta.consentimento.versao ? VERSAO_POLITICA : conta.consentimento.versao };
  }
  await gravarConta(conta);
}
