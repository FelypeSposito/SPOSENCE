// ============================================================
// SPOSENCE · Abertura
// Carregado no <head> (síncrono) de todas as páginas.
// Aparece na primeira página da visita e sempre que a pessoa clica no logo SPOSENCE do topo.
// As 4 pétalas do símbolo chegam de uma órbita maior, desfocadas, e se fecham no centro;
// o símbolo nasce inclinado e gira até o lugar com um encaixe elástico; um brilho dourado
// passa por ele; o nome abre do centro; por fim o painel sobe de baixo para cima.
// Expõe window.spLoaded: a abertura de cada página (GSAP) espera essa promessa.
// ============================================================
(function () {
  var root = document.documentElement;
  var REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var SYMBOL = 'img/simbolo-loader.png';
  var WORD = 'img/logo-navbar.png';
  var MIN = REDUCE ? 600 : 2400; // tempo para o símbolo e o nome se formarem
  var OUT = 1300;                // duração da saída

  // Na primeira página da visita (sessionStorage) e sempre que a pessoa clica no
  // logo SPOSENCE do topo (app.js marca 'sp-intro-force' antes de ir para a home)
  var show = false;
  try {
    var forced = sessionStorage.getItem('sp-intro-force') === '1';
    sessionStorage.removeItem('sp-intro-force');
    show = forced || !sessionStorage.getItem('sp-visited');
    sessionStorage.setItem('sp-visited', '1');
  } catch (e) {}

  // Quadrantes do símbolo: cada um contém uma pétala (cima, direita, baixo, esquerda)
  var QUADRANTS = [
    'polygon(50% 50%,0 0,100% 0)',
    'polygon(50% 50%,100% 0,100% 100%)',
    'polygon(50% 50%,100% 100%,0 100%)',
    'polygon(50% 50%,0 100%,0 0)',
  ];

  var css = '' +
    '.sp-intro{position:fixed;inset:0;z-index:9999;display:grid;place-items:center;background:#f5f0ea;' +
      'transition:transform 1s cubic-bezier(.76,0,.24,1);pointer-events:none}' +
    '.sp-intro__inner{display:grid;justify-items:center;gap:30px;transition:transform .8s cubic-bezier(.76,0,.24,1),opacity .6s ease}' +
    '.sp-intro__seal{position:relative;width:112px;height:112px;display:grid;place-items:center}' +
    /* o símbolo nasce inclinado e gira até o lugar com um encaixe elástico */
    '.sp-intro__mark{position:relative;width:92px;height:92px;transform:rotate(-45deg);' +
      'animation:spLock .8s cubic-bezier(.34,1.56,.64,1) 1.05s forwards}' +
    '@keyframes spLock{to{transform:rotate(0deg)}}' +
    /* pétalas: chegam de uma órbita maior, desfocadas, e se fecham no centro */
    '.sp-intro__petal{position:absolute;inset:0;background:url(' + SYMBOL + ') center/contain no-repeat;opacity:0;' +
      'animation:spOrbit 1.15s cubic-bezier(.16,1,.3,1) forwards}' +
    '.sp-intro__petal.p1{clip-path:' + QUADRANTS[0] + ';animation-delay:.05s}' +
    '.sp-intro__petal.p2{clip-path:' + QUADRANTS[1] + ';animation-delay:.14s}' +
    '.sp-intro__petal.p3{clip-path:' + QUADRANTS[2] + ';animation-delay:.23s}' +
    '.sp-intro__petal.p4{clip-path:' + QUADRANTS[3] + ';animation-delay:.32s}' +
    '@keyframes spOrbit{0%{opacity:0;transform:rotate(-150deg) scale(1.9);filter:blur(7px)}45%{opacity:1}100%{opacity:1;transform:none;filter:blur(0)}}' +
    /* brilho dourado que passa por dentro do símbolo (a máscara é o próprio símbolo) */
    '.sp-intro__shine{position:absolute;inset:0;-webkit-mask:url(' + SYMBOL + ') center/contain no-repeat;mask:url(' + SYMBOL + ') center/contain no-repeat;' +
      'background:linear-gradient(115deg,transparent 35%,rgba(236,201,140,.95) 50%,transparent 65%) 0 0/300% 100% no-repeat;background-position:120% 0;' +
      'animation:spShine 1.7s cubic-bezier(.45,0,.2,1) 1.7s infinite}' +
    '@keyframes spShine{0%{background-position:120% 0}60%,100%{background-position:-20% 0}}' +
    /* nome da marca: abre do centro para as bordas */
    '.sp-intro__word{width:min(196px,54vw);clip-path:inset(0 50% 0 50%);opacity:.5;transform:scaleX(1.08);' +
      'animation:spWord 1s cubic-bezier(.76,0,.24,1) 1.45s forwards}' +
    '.sp-intro__word img{display:block;width:100%;height:auto}' +
    '@keyframes spWord{to{clip-path:inset(0 0 0 0);opacity:1;transform:none}}' +
    /* saída: símbolo e nome sobem e somem, e o painel sobe de baixo para cima */
    '.sp-intro.is-out .sp-intro__inner{transform:translateY(-28px) scale(.96);opacity:0}' +
    '.sp-intro.is-out{transform:translateY(-100%);transition-delay:.18s}' +
    '@media (prefers-reduced-motion:reduce){.sp-intro__mark,.sp-intro__petal,.sp-intro__word{animation:spFade .4s ease forwards;transform:none;filter:none;clip-path:none}' +
      '.sp-intro__petal:not(.p1){display:none}.sp-intro__shine{display:none}' +
      '@keyframes spFade{to{opacity:1}}' +
      '.sp-intro.is-out{transform:none;opacity:0;transition:opacity .5s ease}}';

  var html =
    '<div class="sp-intro__inner">' +
      '<div class="sp-intro__seal">' +
        '<div class="sp-intro__mark">' +
          '<i class="sp-intro__petal p1"></i><i class="sp-intro__petal p2"></i><i class="sp-intro__petal p3"></i><i class="sp-intro__petal p4"></i>' +
          '<span class="sp-intro__shine"></span>' +
        '</div>' +
      '</div>' +
      '<div class="sp-intro__word"><img src="' + WORD + '" alt=""></div>' +
    '</div>';

  // A abertura da página (GSAP) espera esta promessa
  window.spLoaded = new Promise(function (resolve) {
    if (!show) { resolve(); return; }

    var style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);

    var intro = document.createElement('div');
    intro.className = 'sp-intro';
    intro.setAttribute('aria-hidden', 'true');
    intro.innerHTML = html;
    // o <body> ainda não existe: o painel entra direto no <html> e cobre a página desde o primeiro quadro
    root.appendChild(intro);

    var start = Date.now();
    var done = false;
    function finish() {
      if (done) return;
      done = true;
      setTimeout(function () {
        intro.classList.add('is-out');
        resolve();
        setTimeout(function () { intro.remove(); style.remove(); }, OUT);
      }, Math.max(250, MIN - (Date.now() - start)));
    }
    window.addEventListener('load', finish);
    setTimeout(finish, MIN + 1700);
  });

  // Esconde a abertura até o GSAP montar o intro. Sem JS, sem GSAP ou com reduced-motion, a página aparece normal.
  if (!REDUCE) {
    root.classList.add('js-anim');
    setTimeout(function () { root.classList.remove('js-anim'); }, show ? 8000 : 3500);
  }
})();
