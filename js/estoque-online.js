// Aplica ao js/data.js o que o painel (admin.html) mudou: produtos novos, produtos ocultos
// ou esgotados, preços e quantidades em estoque.
// Roda de forma síncrona logo depois de /api/catalogo.js (que define window.SP_REMOTO) e
// antes do app.js, então as páginas já nascem certas. Sem SP_REMOTO, não faz nada.
(function () {
  var R = window.SP_REMOTO;
  if (!R || typeof SPOSENCE_DATA === 'undefined') return;

  var grupos = {
    perfumes: SPOSENCE_DATA.perfumes || [],
    skincare: SPOSENCE_DATA.skincare || [],
    body_splashes: SPOSENCE_DATA.body_splashes || [],
    merchandise: SPOSENCE_DATA.merchandise || [],
  };
  var status = R.status || {};
  var precos = R.precos || {};
  var estoque = R.produtos || {};

  // 1. produtos criados no painel
  (R.extras || []).forEach(function (p) {
    var lista = grupos[p.category];
    if (lista && !lista.some(function (x) { return x.id === p.id; })) lista.push(p);
  });

  Object.keys(grupos).forEach(function (chave) {
    var lista = grupos[chave];
    for (var i = lista.length - 1; i >= 0; i--) {
      var p = lista[i];

      // 2. oculto sai do site; esgotado fica visível, sem compra
      if (status[p.id] === 'oculto') { lista.splice(i, 1); continue; }
      if (status[p.id] === 'esgotado') { p.available = false; p.outOfStock = true; }

      // 3. preços ajustados no painel
      var ajuste = precos[p.id];
      if (ajuste) {
        if ('unico' in ajuste) p.price = ajuste.unico;
        (p.variants || []).forEach(function (v) { if (v.size in ajuste) v.price = ajuste[v.size]; });
      }

      // 4. quantidades em estoque (30 ml e 50 ml dos perfumes controlados)
      var tamanhos = estoque[p.id];
      if (tamanhos && p.variants) {
        p.variants.forEach(function (v) {
          if (!(v.size in tamanhos)) return;
          var n = tamanhos[v.size];
          v.stock = n;
          if (n > 0) { delete v.available; delete v.outOfStock; }
          else { v.available = false; v.outOfStock = true; }
        });
      }
    }
  });
})();
