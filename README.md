# Antes de comprar

Sitio de ofertas verificadas de Mercado Libre Chile. Estático, sin dependencias,
se despliega en Netlify.

La diferencia con cualquier otra página de ofertas está en una sola regla:

> **Solo decimos que algo está rebajado cuando podemos demostrarlo con nuestro
> propio historial de precios.**

El precio tachado que muestra una tienda es dato del vendedor, y el truco más
común del comercio online es subirlo dos semanas antes para poder "bajarlo".
Contra eso no sirve confiar: sirve haber estado mirando. Por eso el sistema
anota el precio de cada producto todos los días y compara contra lo que él mismo
midió.

---

## Cómo funciona, en una vuelta

```
  GitHub Actions (todos los días, 11:00 UTC)
        │
        │  1. consulta Mercado Libre producto por producto
        ▼
  src/verificar.mjs ──► data/estado.json      ¿sigue vivo? ¿a qué precio?
                   └──► data/historial.jsonl  una observación por día
        │
        │  2. commitea los datos → Netlify reconstruye
        ▼
  src/build.mjs ──► dist/   home, feed, fichas, categorías, /ir/<slug>
```

El verificador corre en GitHub Actions y **no** en Netlify a propósito: necesita
guardar lo que aprendió. Un build de Netlify es efímero; el historial acumulado
es justamente lo que después permite afirmar que una rebaja es real.

---

## Las etiquetas y qué significan

Cada producto se publica con una etiqueta que dice exactamente cuánto podemos
sostener de lo que estamos afirmando:

| Etiqueta | Qué significa |
|---|---|
| **-30%** | Rebaja comprobada. El precio de hoy está 30% bajo la mediana de lo que costó en los últimos 30 días, medido por nosotros. |
| **mínimo histórico** | Es el precio más bajo que le vimos en 90 días, y el producto tuvo variación real de precio (no es un precio plano que "toca su mínimo" todos los días). |
| **-40% de lista** | Descuento **declarado por la tienda**, no verificado. Aparece cuando el producto es nuevo y aún no tenemos historial propio. |
| **precio verificado** | No hay rebaja, pero hoy confirmamos precio y stock. |
| **sin verificar** | Producto recién agregado, todavía sin pasar por la revisión. |

Y lo que queda fuera:

- Si el precio tachado del vendedor es más alto que **cualquier** precio que le
  hayamos visto en 90 días, ese porcentaje no se publica.
- Si la publicación se pausa o se queda sin stock, sale del sitio ese día.
- Si un producto lleva más de 5 días sin poder confirmarse, deja de mostrarse.

Las reglas están en `src/lib/ofertas.mjs` y cada una tiene su test en
`test/ofertas.test.mjs`. Si cambiás un umbral, los tests te dicen qué se rompe.

---

## Comandos

```bash
npm run build         # genera dist/
npm run dev           # genera y sirve en http://localhost:4321
npm test              # 34 tests: motor de ofertas, cliente de ML, reglas de publicación

npm run verificar     # verifica precios contra Mercado Libre
npm run diagnostico   # prueba qué caminos de consulta funcionan hoy
```

Opciones útiles del verificador:

```bash
node src/verificar.mjs --limite 100    # corta después de 100 productos
node src/verificar.mjs --solo-fichas   # solo las 18 fichas destacadas
node src/verificar.mjs --todo          # el catálogo completo, sin límite
node src/verificar.mjs --dry-run       # muestra el resultado sin escribir nada
```

---

## Los archivos de datos

| Archivo | Qué es | Quién lo edita |
|---|---|---|
| `data/catalogo.json` | Los 892 productos con link de afiliado, comisión e ID de Mercado Libre. El universo monetizable. | Vos, al agregar productos |
| `data/productos.json` | Las 18 fichas con opinión propia. Son las únicas con página propia e indexable. | Vos |
| `data/estado.json` | Lo que el verificador confirmó por última vez de cada producto. | El verificador |
| `data/historial.jsonl` | Una línea por producto con su serie de precios diaria. | El verificador |
| `data/categorias.json` | Caché de nombres de categoría de Mercado Libre. | El verificador |
| `data/config.json` | Nombre, dominio, umbrales, analytics, disclosure. | Vos |

`historial.jsonl` es JSONL y no JSON a propósito: se reescribe todos los días y
vive en git. Con una línea por producto, cada commit guarda solo las pocas
letras que cambiaron en vez del archivo entero.

### Agregar un producto al catálogo

```json
{
  "id": "MLC12345678",
  "slug": "nombre-corto-y-legible",
  "titulo": "Nombre del producto",
  "categoria": "Cocina",
  "comision": 11,
  "link": "https://meli.la/TU-LINK",
  "codigo": "5NLLZK-XXXX",
  "hub": { "precio": 12990, "precioLista": 19990, "capturado": "2026-09-07" }
}
```

`id` es lo que permite verificarlo. Si no lo tenés, dejalo fuera de la ficha y
el verificador lo resuelve solo siguiendo el link corto la primera vez que corra.

### Convertir un producto del catálogo en ficha

Agregá una entrada en `data/productos.json` apuntando al mismo `mlId`. Con
`veredicto` y `puntaje` completos se emiten datos estructurados de review para
Google; sin ellos, no. **No los completes con opiniones inventadas**: son
exactamente lo que Google penaliza desde las actualizaciones de contenido útil,
y es el tipo de cosa que hunde un sitio entero.

---

## El link corto: por qué importa

Cada producto genera un link en tu propio dominio:

```
https://antesdecomprar.cl/ir/<slug>
```

Ese es el que compartís. Nunca el de Mercado Libre directo:

1. **Es tuyo.** Si cambia el formato de los links de ML, o querés cambiar el
   producto que promocionás, editás el JSON y todos los links ya publicados
   apuntan al destino nuevo. No tenés que volver a editar un solo video.
2. **No lo bloquean.** Las plataformas filtran links de afiliado directos.
3. **Se puede medir.** Ver abajo.

Usa `302` a propósito: con `301` el navegador se quedaría pegado con el destino
viejo para siempre.

### Medir por canal

Generá un link de afiliado distinto por canal en el panel de Mercado Libre:

```json
"linksPorCanal": {
  "tiktok":    "https://meli.la/AAA",
  "instagram": "https://meli.la/BBB"
}
```

| Compartís en | Link que usás |
|---|---|
| TikTok | `antesdecomprar.cl/ir/<slug>/tiktok` |
| Instagram | `antesdecomprar.cl/ir/<slug>/instagram` |
| Cualquier otro lado | `antesdecomprar.cl/ir/<slug>` |

El feed ya manda todos sus botones por `/tiktok`, así que el panel de Mercado
Libre te va a decir cuánto vende el feed sin que pagues ninguna herramienta.

Canales: `tiktok`, `instagram`, `youtube`, `whatsapp`, `facebook`, `x`, `bio`,
`newsletter`. Un canal sin link propio cae al link principal.

---

## Verificación: los tres caminos

El verificador no depende de un solo método, porque Mercado Libre cambia las
condiciones de su API cada cierto tiempo y el sitio no se puede caer por eso.
Intenta en orden y el primero que responde gana:

1. **API con token** — rápida, 20 productos por llamada, dato oficial.
2. **API sin token** — el mismo endpoint, mientras siga siendo público.
3. **Ficha pública** — lee los datos estructurados del HTML del producto.

Cada resultado queda anotado con su `fuente` en `data/estado.json`, así que
siempre se puede auditar de dónde salió un precio.

Para saber qué funciona hoy:

```bash
npm run diagnostico
```

### Token de Mercado Libre (opcional)

Sin token el sistema funciona. Si querés usar la API oficial, cargá estos
secretos en el repositorio (Settings → Secrets → Actions):

- `MELI_ACCESS_TOKEN` — token directo, dura 6 horas.
- `MELI_CLIENT_ID`, `MELI_CLIENT_SECRET`, `MELI_REFRESH_TOKEN` — para que se
  renueve solo.

**Ojo con el refresh token:** Mercado Libre lo rota en cada uso. El verificador
renueva el token dentro de la corrida, pero no puede reescribir el secreto del
repositorio por su cuenta. Si usás este modo, o actualizás el secreto a mano
cada tanto, o le agregás al workflow un paso que lo guarde con un PAT. Sin token
no existe este problema, y por eso es el modo por defecto.

---

## Publicar

Netlify ya está configurado en `netlify.toml` (`npm run build` → `dist`).
Conectalo al repositorio y despliega solo con cada push, incluidos los del
verificador.

### Conectar el dominio

1. En Netlify: **Domain settings → Add custom domain** → `antesdecomprar.cl`.
2. En tu registrador, apuntá los DNS a Netlify (te da los nameservers o un
   registro `A`/`CNAME`).
3. Activá HTTPS (Netlify emite el certificado gratis).
4. Verificá que `data/config.json` tenga el dominio correcto en `url`: de ahí
   salen el sitemap, los canonicals y los links cortos.

---

## Qué se indexa y qué no

Solo las 18 fichas con opinión propia entran al sitemap. Las categorías y el
feed llevan `noindex`.

No es un descuido: llenar Google de páginas de afiliado sin contenido propio es
la forma más rápida de que el sitio entero deje de posicionar. Las páginas que
tienen que ganar búsquedas son las que tienen algo que Google no encuentra en
otro lado — tu opinión y tu historial de precios.

Cuando escribas una ficha nueva con veredicto real, esa entra al índice también.

---

## Estructura

```
data/                 Los datos (ver tabla arriba)
src/build.mjs         Generador del sitio
src/verificar.mjs     Verificador diario
src/lib/ofertas.mjs   Motor de ofertas: qué es una rebaja real
src/lib/meli.mjs      Cliente de Mercado Libre (API + respaldo por HTML)
src/lib/componer.mjs  Reglas de publicación: qué entra al sitio
src/lib/historial.mjs Lectura y escritura del historial de precios
public/               Estilos, feed.js, favicon
test/                 Tests de todo lo anterior
.github/workflows/    Verificación diaria y CI
dist/                 Salida generada. No la edites: se borra en cada build.
```

---

## Regla editorial

No publiques fichas de productos que no conocés. Un sitio de recomendaciones
vive de una sola cosa: que te crean. Las contras honestas venden más que el
entusiasmo, y una rebaja inventada se nota.

Todo el sistema técnico de este repositorio existe para sostener esa regla
cuando el catálogo crece a un tamaño que ya no podés revisar a mano.
