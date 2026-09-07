/* =====================================================================
   Capturador del hub de afiliados de Mercado Libre
   =====================================================================

   COMO SE USA

   1. Entra al hub con tu sesion iniciada:
      https://www.mercadolibre.cl/afiliados/hub?is_affiliate=true

   2. Abri la consola del navegador:
      Chrome/Edge:  F12  -> pestaña "Console"
      Firefox:      F12  -> pestaña "Consola"
      Mac:          Cmd + Option + J

   3. Pega TODO este archivo en la consola y apreta Enter.
      (La primera vez Chrome puede pedirte que escribas "allow pasting")

   4. Escribi:   AC.auto()
      El script va a scrollear solo, cargando productos, y te va a ir
      diciendo cuantos lleva. Podes cortarlo cuando quieras con AC.parar()

   5. Cuando tengas suficientes:   AC.descargar()
      Te baja un archivo productos-hub.json

   6. Ese archivo va al repositorio:
      node src/importar.mjs productos-hub.json
      npm run verificar

   QUE HACE Y QUE NO HACE

   Solo lee lo que tu propia pagina ya cargo, con tu sesion, en tu navegador,
   y lo guarda en un archivo en tu disco. No manda nada a ningun lado.

   Funciona escuchando las respuestas que el hub le pide a su propio servidor
   mientras navegas, en vez de adivinar como esta armado el HTML. Por eso
   sigue funcionando aunque Mercado Libre le cambie el diseño a la pagina.
   ===================================================================== */

(function () {
  'use strict';

  const encontrados = new Map();   // link -> producto
  let corriendo = false;

  /* ---------- reconocer un producto dentro de cualquier JSON ---------- */

  const CLAVES_TITULO = ['title', 'titulo', 'name', 'nombre', 'product_name', 'item_title'];
  const CLAVES_LINK = ['permalink', 'link', 'url', 'short_link', 'shortLink', 'affiliate_link', 'affiliateLink', 'deeplink'];
  const CLAVES_PRECIO = ['price', 'precio', 'current_price', 'sale_price', 'amount'];
  const CLAVES_LISTA = ['original_price', 'list_price', 'regular_price', 'precio_lista', 'base_price'];
  const CLAVES_COMISION = ['commission', 'comision', 'commission_percentage', 'commissionPercentage', 'percentage', 'fee'];
  const CLAVES_CODIGO = ['code', 'codigo', 'tag', 'coupon', 'tracking_id'];
  const CLAVES_ID = ['id', 'item_id', 'itemId', 'product_id', 'mlItemId'];

  const val = (o, claves) => {
    for (const k of claves) {
      if (o[k] !== undefined && o[k] !== null && o[k] !== '') {
        const v = o[k];
        if (typeof v === 'object') {
          // A veces viene como { amount: 1234, currency: "CLP" }
          if (v.amount !== undefined) return v.amount;
          if (v.value !== undefined) return v.value;
          continue;
        }
        return v;
      }
    }
    return null;
  };

  const esId = (v) => typeof v === 'string' && /^ML[A-Z]{1,2}\d{6,}$/i.test(v);

  function comoProducto(o) {
    if (!o || typeof o !== 'object' || Array.isArray(o)) return null;
    const titulo = val(o, CLAVES_TITULO);
    const link = val(o, CLAVES_LINK);
    if (!titulo || typeof titulo !== 'string' || titulo.length < 6) return null;
    if (!link || typeof link !== 'string') return null;
    if (!/mercadolibre|meli\.la|mercadolivre/i.test(link)) return null;

    const idCrudo = val(o, CLAVES_ID);
    return {
      id: esId(idCrudo) ? String(idCrudo).toUpperCase() : (String(link).match(/\b(ML[A-Z]{1,2}\d{6,})\b/i) || [])[1] || null,
      titulo: titulo.trim(),
      link: link.trim(),
      precio: Number(val(o, CLAVES_PRECIO)) || null,
      precioLista: Number(val(o, CLAVES_LISTA)) || null,
      comision: Number(val(o, CLAVES_COMISION)) || 0,
      codigo: val(o, CLAVES_CODIGO),
    };
  }

  /** Recorre cualquier estructura buscando cosas que parezcan productos. */
  function rastrear(nodo, profundidad = 0) {
    if (!nodo || typeof nodo !== 'object' || profundidad > 12) return;
    const p = comoProducto(nodo);
    if (p && !encontrados.has(p.link)) encontrados.set(p.link, p);
    for (const v of Array.isArray(nodo) ? nodo : Object.values(nodo)) {
      if (v && typeof v === 'object') rastrear(v, profundidad + 1);
    }
  }

  /* ---------- escuchar lo que la pagina le pide a su servidor ---------- */

  const fetchOriginal = window.fetch;
  window.fetch = async function (...args) {
    const resp = await fetchOriginal.apply(this, args);
    resp.clone().json().then(rastrear).catch(() => {});
    return resp;
  };

  const abrirOriginal = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (...args) {
    this.addEventListener('load', function () {
      try { rastrear(JSON.parse(this.responseText)); } catch (e) {}
    });
    return abrirOriginal.apply(this, args);
  };

  /* ---------- barrido de lo que ya esta en la pagina ---------- */

  function barrerEstado() {
    for (const clave of ['__PRELOADED_STATE__', '__NEXT_DATA__', '__INITIAL_STATE__', '__APOLLO_STATE__']) {
      if (window[clave]) rastrear(window[clave]);
    }
    document.querySelectorAll('script[type="application/json"], script[type="application/ld+json"]')
      .forEach((s) => { try { rastrear(JSON.parse(s.textContent)); } catch (e) {} });
  }

  /** Ultimo recurso: leer las tarjetas del HTML. */
  function barrerHtml() {
    const antes = encontrados.size;
    document.querySelectorAll('a[href*="meli.la"], a[href*="/p/ML"], a[href*="articulo.mercadolibre"]').forEach((a) => {
      const link = a.href;
      if (encontrados.has(link)) return;
      // Subimos hasta un contenedor que tenga texto suficiente para ser la tarjeta.
      let caja = a, saltos = 0;
      while (caja.parentElement && caja.textContent.trim().length < 40 && saltos++ < 6) caja = caja.parentElement;
      // textContent pega el texto de spans vecinos sin espacio ("$74.990" + "11%"
      // queda "$74.99011%"), asi que el patron del precio tiene que cerrar solo:
      // o son miles separados por punto, o es un numero suelto.
      const texto = caja.textContent.replace(/\s+/g, ' ').trim();
      const precios = [...texto.matchAll(/\$\s?(\d{1,3}(?:\.\d{3})+|\d{3,8})/g)]
        .map((m) => Number(m[1].replace(/\./g, '')))
        .filter((n) => n >= 100 && n <= 50000000);
      const comision = (texto.match(/(\d{1,2})\s?%/) || [])[1];
      const titulo = (a.getAttribute('title') || a.textContent || texto).replace(/\s+/g, ' ').trim().slice(0, 200);
      if (titulo.length < 6) return;
      encontrados.set(link, {
        id: (link.match(/\b(ML[A-Z]{1,2}\d{6,})\b/i) || [])[1] || null,
        titulo, link,
        precio: precios[0] || null,
        precioLista: precios[1] && precios[1] > precios[0] ? precios[1] : null,
        comision: Number(comision) || 0,
        codigo: null,
      });
    });
    return encontrados.size - antes;
  }

  /* ---------- API para la consola ---------- */

  const AC = {
    /** Cuantos productos lleva capturados. */
    capturados() { return encontrados.size; },

    /** Los productos, como arreglo. */
    lista() { return [...encontrados.values()]; },

    /** Barre la pagina tal como esta ahora mismo. */
    barrer() {
      barrerEstado();
      const delHtml = barrerHtml();
      console.log(`Capturados: ${encontrados.size} productos (${delHtml} leidos del HTML)`);
      return encontrados.size;
    },

    /** Scrollea solo para que el hub vaya cargando mas productos. */
    async auto(maxVueltas = 400) {
      if (corriendo) return console.log('Ya esta corriendo. AC.parar() para cortarlo.');
      corriendo = true;
      console.log('Scrolleando... AC.parar() para cortar, AC.descargar() cuando tengas suficientes.');
      let quieto = 0, previo = 0;
      for (let i = 0; i < maxVueltas && corriendo; i++) {
        window.scrollTo(0, document.body.scrollHeight);
        // Muchos hubs cargan con un boton en vez de scroll infinito.
        const boton = [...document.querySelectorAll('button, a')].find((b) =>
          /ver m[aá]s|cargar m[aá]s|mostrar m[aá]s|siguiente/i.test(b.textContent || ''));
        if (boton) boton.click();
        await new Promise((r) => setTimeout(r, 1200));
        this.barrer();
        if (encontrados.size === previo) {
          if (++quieto >= 5) { console.log('No aparecen productos nuevos. Corto aca.'); break; }
        } else quieto = 0;
        previo = encontrados.size;
      }
      corriendo = false;
      console.log(`Listo: ${encontrados.size} productos. Ahora: AC.descargar()`);
      return encontrados.size;
    },

    parar() { corriendo = false; console.log('Cortado.'); },

    /** Baja el archivo para importar al repositorio. */
    descargar(nombre = 'productos-hub.json') {
      this.barrer();
      const lista = this.lista();
      if (!lista.length) {
        console.warn(`No capture ningun producto.

Proba esto:
  1. Scrollea la pagina a mano un poco y volve a correr AC.barrer()
  2. Si sigue en cero, abri la pestaña "Network" (Red) de las herramientas
     del navegador, recarga la pagina, busca la peticion que trae los
     productos, boton derecho -> "Copy response", y pega eso en un archivo.
     src/importar.mjs tambien acepta ese JSON crudo.`);
        return 0;
      }
      const blob = new Blob([JSON.stringify(lista, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = nombre;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      const conComision = lista.filter((p) => p.comision > 0).length;
      console.log(`Bajado ${nombre}: ${lista.length} productos (${conComision} con comision leida).`);
      console.log('En el repositorio:  node src/importar.mjs productos-hub.json');
      return lista.length;
    },
  };

  window.AC = AC;
  AC.barrer();
  console.log(`
Capturador listo.

  AC.auto()        scrollea solo y va capturando
  AC.barrer()      captura lo que hay en pantalla ahora
  AC.capturados()  cuantos lleva
  AC.descargar()   baja el archivo para importar
  AC.parar()       corta el scroll automatico
`);
})();
