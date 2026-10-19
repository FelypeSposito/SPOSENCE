// Estoque ao vivo: ajusta as quantidades de js/data.js com o que o painel (admin.html) registrou.
// Carrega depois de data.js e antes de app.js.
//
// As páginas se desenham na hora, então usamos duas camadas:
//  1. a última resposta guardada no navegador é aplicada na hora (sem piscar);
//  2. em seguida buscamos a resposta nova, que vale para o carrinho e para a próxima página.
// Se a busca falhar, o site segue com os números do data.js.
(function () {
  if (typeof SPOSENCE_DATA === 'undefined') return;
  var CACHE = 'sp-estoque-v1';
  var base = /github\.io$/.test(location.hostname) || location.protocol === 'file:' ? 'https://sposence.com.br' : '';

  function aplicar(estoque) {
    if (!estoque || !estoque.produtos) return;
    var todos = [].concat(SPOSENCE_DATA.perfumes || [], SPOSENCE_DATA.body_splashes || [], SPOSENCE_DATA.skincare || []);
    todos.forEach(function (p) {
      var tamanhos = estoque.produtos[p.id];
      if (!tamanhos || !p.variants) return;
      p.variants.forEach(function (v) {
        if (!(v.size in tamanhos)) return;
        var n = tamanhos[v.size];
        v.stock = n;
        if (n > 0) { delete v.available; delete v.outOfStock; }
        else { v.available = false; v.outOfStock = true; }
      });
    });
  }

  try { aplicar(JSON.parse(localStorage.getItem(CACHE))); } catch (_) {}

  var limite = new AbortController();
  setTimeout(function () { limite.abort(); }, 5000);
  fetch(base + '/api/estoque', { signal: limite.signal, cache: 'no-store' })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (estoque) {
      if (!estoque) return;
      aplicar(estoque);
      try { localStorage.setItem(CACHE, JSON.stringify(estoque)); } catch (_) {}
    })
    .catch(function () {});
})();
