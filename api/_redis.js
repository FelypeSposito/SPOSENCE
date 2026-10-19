// Guarda o estoque num Redis da Upstash (integração gratuita da Vercel).
// As variáveis KV_REST_API_URL e KV_REST_API_TOKEN são criadas pela própria Vercel
// quando o banco é conectado ao projeto.
//
// Para testar no computador sem banco, defina ESTOQUE_LOCAL=1: o estoque vai para um
// arquivo temporário em vez do Redis.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const URL_BASE = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const ARQUIVO_LOCAL = path.join(os.tmpdir(), 'sposence-estoque-local.json');

async function comando(...args) {
  if (!URL_BASE || !TOKEN) throw new Error('Banco de dados não configurado (KV_REST_API_URL / KV_REST_API_TOKEN).');
  const r = await fetch(URL_BASE, {
    signal: AbortSignal.timeout(4000),
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  const corpo = await r.json();
  if (!r.ok || corpo.error) throw new Error(corpo.error || `Redis respondeu ${r.status}`);
  return corpo.result;
}

export async function lerJSON(chave) {
  if (process.env.ESTOQUE_LOCAL) {
    if (!fs.existsSync(ARQUIVO_LOCAL)) return null;
    return JSON.parse(fs.readFileSync(ARQUIVO_LOCAL, 'utf8'))[chave] ?? null;
  }
  const texto = await comando('GET', chave);
  return texto ? JSON.parse(texto) : null;
}

export async function gravarJSON(chave, valor) {
  if (process.env.ESTOQUE_LOCAL) {
    const tudo = fs.existsSync(ARQUIVO_LOCAL) ? JSON.parse(fs.readFileSync(ARQUIVO_LOCAL, 'utf8')) : {};
    tudo[chave] = valor;
    fs.writeFileSync(ARQUIVO_LOCAL, JSON.stringify(tudo));
    return;
  }
  await comando('SET', chave, JSON.stringify(valor));
}
