// GET /api/catalogo.js — o que mudou no catálogo e no estoque, como script.
// Cada página carrega isto antes do app.js (script comum, sem async), então o site já
// se desenha com os produtos, preços e quantidades certos, sem piscar.
// Se der erro, devolve null e o site segue com o que está em js/data.js.
import { carregar, publico } from './_estoque.js';

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  try {
    res.setHeader('Cache-Control', 's-maxage=10, stale-while-revalidate=60');
    const json = JSON.stringify(publico(await carregar())).replace(/</g, '\\u003c');
    res.status(200).send(`window.SP_REMOTO=${json};`);
  } catch (err) {
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).send('window.SP_REMOTO=null;');
  }
}
