// Feed vertical: una oferta por pantalla, como en TikTok.
//
// El scroll y el encaje los hace CSS (scroll-snap), que es mucho mas fluido en
// celular que cualquier cosa que uno escriba en JavaScript. Este archivo solo
// agrega tres cosas: la barra de avance, el teclado, y cargar el resto de las
// ofertas cuando el usuario se acerca al final.
(function () {
  'use strict';
  var feed = document.getElementById('feed');
  var avance = document.getElementById('feed-avance');
  if (!feed) return;

  var fin = document.getElementById('fd-fin');
  var cargando = false;
  var agotado = false;
  var yaEnPantalla = new Set();
  Array.prototype.forEach.call(feed.querySelectorAll('.fd[data-i]'), function (n) {
    yaEnPantalla.add(n.getAttribute('data-i'));
  });

  var clp = function (n) { return '$' + Number(n).toLocaleString('es-CL'); };
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };

  function progreso() {
    var total = feed.scrollHeight - feed.clientHeight;
    if (avance) avance.style.width = (total > 0 ? (feed.scrollTop / total) * 100 : 0) + '%';
  }

  function tarjeta(o, i) {
    var art = document.createElement('article');
    art.className = 'fd';
    art.setAttribute('data-i', String(i));
    var foto = o.imagen
      ? '<img src="' + esc(o.imagen) + '" alt="' + esc(o.titulo) + '" loading="lazy" decoding="async" referrerpolicy="no-referrer">'
      : '<span class="sin-foto" aria-hidden="true">' + esc((o.categoria || '?').slice(0, 2).toUpperCase()) + '</span>';
    art.innerHTML =
      '<div class="fd-in">' +
        '<div class="fd-media">' + foto + '</div>' +
        '<div class="fd-txt">' +
          '<div class="fd-tags"><span class="chip">' + esc(o.categoria) + '</span>' +
            '<span class="et ' + esc(o.etiqueta.clase) + '">' + esc(o.etiqueta.texto) + '</span></div>' +
          '<h2 class="fd-name">' + esc(o.titulo) + '</h2>' +
          (o.nota ? '<p class="fd-note">' + esc(o.nota) + '</p>' : '') +
          '<p class="fd-check">' + esc(o.etiqueta.detalle) + '</p>' +
          '<div class="fd-precio"><span class="fd-now">' + clp(o.precio) + '</span>' +
            (o.referencia ? '<s>' + clp(o.referencia) + '</s>' : '') + '</div>' +
          '<a class="fd-go" href="' + esc(o.ir) + '/tiktok" rel="sponsored nofollow noopener" target="_blank">Ver en Mercado Libre</a>' +
          (o.ficha ? '<a class="fd-mas" href="' + esc(o.ficha) + '">Leer nuestra opinion</a>' : '') +
        '</div>' +
      '</div>';
    return art;
  }

  function cargarResto() {
    if (cargando || agotado) return;
    cargando = true;
    fetch('/api/ofertas.json', { headers: { accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status)); })
      .then(function (data) {
        var nuevas = 0;
        (data.ofertas || []).forEach(function (o, i) {
          if (yaEnPantalla.has(String(i))) return;
          yaEnPantalla.add(String(i));
          feed.insertBefore(tarjeta(o, i), fin);
          nuevas++;
        });
        agotado = true;               // el JSON viene entero: una sola pasada basta
        if (!nuevas) return;
        progreso();
      })
      .catch(function () {
        // Sin conexion el feed se queda con lo que ya venia en el HTML, que es
        // suficiente para usarlo. No mostramos un error que no aporta nada.
        agotado = true;
      })
      .then(function () { cargando = false; });
  }

  var pendiente = false;
  feed.addEventListener('scroll', function () {
    if (pendiente) return;
    pendiente = true;
    requestAnimationFrame(function () {
      pendiente = false;
      progreso();
      if (feed.scrollTop + feed.clientHeight * 3 >= feed.scrollHeight) cargarResto();
    });
  }, { passive: true });

  // Teclado: flechas y espacio saltan de oferta en oferta.
  document.addEventListener('keydown', function (ev) {
    if (ev.target && /^(INPUT|TEXTAREA|SELECT)$/.test(ev.target.tagName)) return;
    var paso = feed.clientHeight;
    if (ev.key === 'ArrowDown' || ev.key === 'PageDown' || ev.key === ' ') {
      feed.scrollBy({ top: paso, behavior: 'smooth' }); ev.preventDefault();
    } else if (ev.key === 'ArrowUp' || ev.key === 'PageUp') {
      feed.scrollBy({ top: -paso, behavior: 'smooth' }); ev.preventDefault();
    }
  });

  progreso();
  // Si todo el feed cabe en pantalla no hay scroll que dispare la carga.
  if (feed.scrollHeight <= feed.clientHeight * 3) cargarResto();
})();
