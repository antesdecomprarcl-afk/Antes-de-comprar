# Antes de comprar

Sitio de guias de compra con links de afiliado de Mercado Libre Chile.
Estatico, sin dependencias, se despliega en Netlify.

---

## Lo unico que tenes que entender

Todo el sitio sale de **un solo archivo**: `data/productos.json`.
Agregas un producto ahi, corres un comando, y el sitio genera solo:

- la ficha del producto con SEO y datos estructurados,
- la pagina de su categoria,
- el sitemap,
- y **el link corto para compartir**.

```
data/productos.json  ->  npm run build  ->  dist/  ->  Netlify
```

---

## El link corto: por que importa

Cada producto genera automaticamente un link en **tu propio dominio**:

```
https://antesdecomprar.cl/ir/<slug>
```

Ese es el link que compartis en TikTok, Instagram, WhatsApp, comentarios, donde sea.
No compartas nunca el link crudo de Mercado Libre. Razones:

1. **Es tuyo.** Si Mercado Libre cambia el formato de sus links, o queres cambiar el
   producto que promocionas, editas el JSON y todos los links ya publicados apuntan
   al nuevo destino. No tenes que volver a editar un solo video.
2. **No lo bloquean.** Las plataformas filtran links de afiliado directos. Un link a
   tu dominio pasa limpio.
3. **Es legible.** `antesdecomprar.cl/ir/audifonos-sony` genera mas clics que
   `mercadolibre.com/sec/2xK9fQ`.
4. **Se puede medir.** Ver abajo.

Usa `302` (redireccion temporal) a proposito: si fuera `301`, el navegador se
quedaria pegado con el destino viejo para siempre y no podrias cambiarlo.

### Medir por canal

Genera un link de afiliado distinto por canal en el panel de Mercado Libre y
mapealos asi:

```json
"linkAfiliado": "https://mercadolibre.com/sec/AAA",
"linksPorCanal": {
  "tiktok":    "https://mercadolibre.com/sec/BBB",
  "instagram": "https://mercadolibre.com/sec/CCC"
}
```

Eso te da:

| Compartis en | Link que usas                              |
|--------------|--------------------------------------------|
| TikTok       | `antesdecomprar.cl/ir/<slug>/tiktok`       |
| Instagram    | `antesdecomprar.cl/ir/<slug>/instagram`    |
| Cualquier otro lado | `antesdecomprar.cl/ir/<slug>`       |

Y el panel de Mercado Libre te dice **que canal te esta generando ventas de verdad**,
sin que tengas que pagar ninguna herramienta de analitica.

Canales soportados: `tiktok`, `instagram`, `youtube`, `whatsapp`, `facebook`, `x`,
`bio`, `newsletter`. Un canal sin link propio cae automaticamente al link principal.

---

## Agregar un producto

Abri `data/productos.json` y agrega un objeto al arreglo:

```json
{
  "slug": "audifonos-sony-wh-ch720n",
  "titulo": "Sony WH-CH720N",
  "categoria": "Audio y Video",
  "resumen": "Una linea que responda: por que este y no otro.",
  "linkAfiliado": "https://mercadolibre.com/sec/TU-LINK",
  "imagen": "https://http2.mlstatic.com/...",
  "precio": 89990,
  "precioAntes": 129990,
  "puntaje": 8.4,
  "veredicto": "Tu opinion real, en 2 o 3 frases.",
  "paraQuien": "A quien le sirve y a quien no.",
  "pros": ["Algo que puedas justificar", "Otro"],
  "contras": ["Se honesto: esto es lo que genera confianza"],
  "specs": { "Marca": "Sony", "Modelo": "WH-CH720N", "Garantia": "12 meses" },
  "actualizado": "2026-09-07",
  "publicado": true
}
```

| Campo | Obligatorio | Nota |
|---|---|---|
| `slug` | si | Unico. Sin espacios ni acentos. Define la URL. |
| `titulo` | si | |
| `linkAfiliado` | si | Sin esto el link corto no redirige. |
| `publicado` | no | `false` genera la pagina pero la deja fuera del sitemap y del inicio. |
| `puntaje` + `veredicto` | no | Si estan **ambos**, se emiten datos estructurados de review para Google. |
| el resto | no | Cada bloque aparece solo si tiene contenido. |

Despues:

```bash
npm run build     # construye dist/
npm run dev       # construye y sirve en http://localhost:4321
```

El build **falla** si hay slugs duplicados, y **avisa** si a un producto le falta el
link de afiliado o si todavia esta marcado como ejemplo.

---

## Publicar

```bash
git add -A
git commit -m "Agrego ficha: Sony WH-CH720N"
git push
```

Si Netlify esta conectado a este repo, despliega solo. La configuracion ya esta en
`netlify.toml` (`npm run build` -> `dist`).

---

## Regla editorial

No publiques fichas de productos que no conoces. Un sitio de recomendaciones vive
de una sola cosa: que te crean. Las contras honestas venden mas que el entusiasmo,
y las reviews inventadas son exactamente lo que Google penaliza desde las
actualizaciones de contenido util.

---

## Estructura

```
data/config.json      Nombre, dominio, analytics, disclosure, redes
data/productos.json   Unica fuente de verdad del catalogo
src/build.mjs         Generador (Node puro, sin dependencias)
public/estilos.css    Estilos (claro y oscuro automatico)
dist/                 Salida generada. No la edites: se borra en cada build.
netlify.toml          Configuracion de despliegue
```
