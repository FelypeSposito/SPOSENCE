// GET /api/estoque — quanto dá pra vender de cada tamanho. Público: o site lê isso.
import { carregar, publico } from './_estoque.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=10, stale-while-revalidate=60');
  try {
    res.status(200).json(publico(await carregar()));
  } catch (err) {
    res.setHeader('Cache-Control', 'no-store');
    res.status(503).json({ erro: 'Estoque indisponível' });
  }
}
