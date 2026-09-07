// Categoria y slug de un producto a partir de su titulo.
//
// Es una adivinanza deliberadamente barata: sirve para que un producto recien
// importado no quede sin categoria el primer dia. En cuanto el verificador lo
// consulta, la categoria real que declara Mercado Libre pisa a esta (ver
// componer.mjs), asi que estas reglas no tienen que ser perfectas: tienen que
// ser razonables y no estorbar.
import { slugify } from './util.mjs';

// La primera regla que calza gana, asi que van de mas especifica a mas general.
export const REGLAS = [
  ['Bebés', /pa[nñ]al|beb[eé]|mudador|coche cuna|biberon|bibero|lactancia|chupete|nodriza|infanti|maternal|ba[nñ]era|tina beb|sonaj|espejo bebe|latidos fetales|cuna|colecho|mamadera|porta beb|test de ovulaci|embarazo/i],
  ['Mascotas', /perro|gato|mascota|felino|canin|alimento .*(perro|gato)|arena sanitaria|pipeta|antipulgas|anti pulgas|heno|bebedero|rascador|correa|collar .*(perro|gato)|jaula|feliway|tortuga|acuario|zupet|litter|sustrato .*(papel|mascota)|mazuri|comedero/i],
  ['Salud', /tensi[oó]metro|oxim|saturom|term[oó]metro (arteria|cl[ií]nic|digital|infrarrojo|ambiental)|gasa|sonda|tiras reactivas|cintas reactivas|glucos|nebulizador|silla de ruedas|andador|ortop[eé]dic|antiescara|tens 7000|tens ems|electrodo|electroterapia|masajeador|presi[oó]n digital|primeros auxilios|mascarilla|alcohol gel|torulas|jeringa|venda|curita|parche|littmann|estetoscop|colostom[ií]a|stomahesive|convatec|rodillera|tobillera|muñequera|faja lumbar|almohadilla el[eé]ctrica|optifree|lente de contacto|preservativo|lifestyles|nuda|kit de curaci[oó]n|guantes de nitrilo|cofia|higi[eé]nic|toalla fem|copa menstrual|protector diario/i],
  ['Belleza y Cuidado Personal', /pesta[nñ]as|maquillaje|r[ií]mel|m[aá]scara de pesta|labial|shampoo|acondicionador|crema facial|serum|s[eé]rum|perfume|edp|edt|depilad|alisador|secador de pelo|cepillo modelador|ondulador|texturizante|desodorante|jab[oó]n|eucerin|neutrogena|natura|esika|ésika|vichy|nutraisdin|swiss beauty|algod[oó]n multiuso|p[eé]talos de algod|cortapelo|afeitad|afeitar|barber|u[nñ]as|esmalte|delineador|maybelline|l'?or[eé]al|loreal|cejas|oral-?b|cepillo dental|dental|pa[nñ]uelos faciales|toallas h[uú]medas|sauna|aro de luz|quitapelusa|gillette|venus breeze|protex|bicarbonato|alta frecuencia/i],
  ['Herramientas', /taladro|atornillador|destornillador|sierra|caladora|amoladora|lijadora|fresadora|router tupi|soldar|soldadura|mig|alicate|crimpead|pelacable|llave inglesa|dados|compres[ií]metro|medidor de distancia|nivelador|cepillo el[eé]ctrico carpint|motosierra|podadora|ahoyador|barreno|escalera|caballete|hidrolavadora|soplador|pistola|masc(ara|arilla) soldar|bisagra|corredera|cerradura|tornill|broca|martillo|einhell|truper|black\+?decker|daewoo|engrapadora|grapa|tijera de poda|cortaseto|desmalezadora|desbrozadora|mezclador .*(cemento|pintura)|selladora|detector .*(metal|pared)|amarras|tapacanto|cola fr[ií]a|silicona|pegamento|tecle|gr[uú]a|cortador de alambre|llave .*(torque|tubo)|esmeril|taladro percutor|remachad|prensa|banco de trabajo|carretilla|serrucho|nivel l[aá]ser|huincha|flexometro|bomba de agua|motobomba|controlador .*presi[oó]n/i],
  ['Automotriz', /\bauto\b|neum[aá]tico|motor(?!izad)|aceite 10w|aceite .*sint|bater[ií]a .*(auto|ciclo|moto|bosch)|alfombra .*auto|radio .*(auto|din)|carplay|bocinas|parlante .*auto|\bmoto\b|cadena moto|limpiaparabrisas|port[oó]n|veloti|sensor oxigeno|kit seguridad auto|renovador de pl[aá]stico|cera .*auto|trasvasije|parafina|catalizador|embrague|peugeot|citroen|chevrolet|portaequipaje|barras transversales|tope de estacionamiento|grasa de litio|volante|logitech g|shifter|escobilla/i],
  ['Tecnología', /notebook|laptop|tablet|smartphone|celular|samsung galaxy|smart tv|monitor|teclado|mouse|rat[oó]n|hdmi|usb|cable .*(tipo c|carga|ethernet|red)|disco duro|ssd|pendrive|router|wifi|wi-fi|bam |impresora|tinta|t[oó]ner|playstation|ps4|ps5|xbox|consola|smartwatch|reloj smart|c[aá]mara|smarttag|smart tag|power bank|bater[ií]a externa|starlink|escaner|esc[aá]ner|lector .*c[oó]digo|soporte .*notebook|alcohol isoprop|papel t[eé]rmico|etiquetas t[eé]rmicas|termolamin|plastificad|control inal[aá]mbrico|audifon|aud[ií]fon|parlante|bluetooth|tarjeta (de )?video|radeon|geforce|nvidia|asus|hikvision|dvr\b|walkie|baofeng|cargador|pila|duracell|fuente de poder|adaptador|enchufe|alarma|citofono|portero el[eé]ct|presentador .*diapositiv|puntero l[aá]ser|tira de luces|led\b|cinta tze|brother|mercado pago|point smart|paymatic|memoria|micro sd/i],
  ['Electrodomésticos', /lavadora|refrigerador|fre[ií]dora|airfryer|air fryer|horno|microondas|cocina a gas|encimera|campana|termo el[eé]ctrico|calefont|estufa|aspiradora|licuadora|minipimer|batidora|juguera|cafetera|hervidor|molinillo|sandwichera|waffle|crepe|plancha a vapor|purificador|ventilador|extractor|climatiz|deshumidific|m[aá]quina de coser|lavavajilla|secadora|tostador|arrocera|picador|moledor|secador de mano|olla el[eé]ctrica|multiproces/i],
  ['Cocina', /olla|sart[eé]n|bater[ií]a de cocina|cacerola|tetera|tabla de picar|cuchill|contenedor|herm[eé]tico|vaso|plato|taza|tazon|taz[oó]n|termo\b|mug|utensilio|colador|bandeja|lavaplato|escurr|set .*(sartenes|ollas)|cocinilla|balanza .*(cocina|digital .*bandeja)|papel aluminio|film|bolsas .*(vac[ií]o|congel)|especier|condiment|filtro .*caf[eé]|lonchera|cubiert|copa|jarra|fuente .*horno/i],
  ['Limpieza', /clorogel|cloro|detergente|limpiador|desinfectante|trapero|mopa|escoba|papel higi[eé]nico|toalla de papel|toallita|servilleta|esponja|percarbonato|quitamanchas|sal .*lavavajilla|finish|harpic|repelente|fumigador|pulverizador|eliminador .*olores|desodorante ambient|bolsa de basura|basurero|canasto .*ropa|suavizante|comfort|disgregante|ba[nñ]o qu[ií]mico|virginia|guante .*(l[aá]tex|aseo)/i],
  ['Dormitorio', /colch[oó]n|almohada|s[aá]bana|plum[oó]n|cubrecama|cubre colch[oó]n|frazada|edred[oó]n|saco de dormir|respaldo de cama|somier/i],
  ['Baño', /ducha|wc\b|inodoro|taza de ba[nñ]o|asiento .*wc|grifo|llave .*(monomando|lavamanos)|toallero|cortina de ba[nñ]o|alfombra ba[nñ]o|dispensador .*(papel|jab[oó]n)|tina\b|lavamanos|flotador|estanque/i],
  ['Hogar y Muebles', /silla|mesa|escritorio|sof[aá]|sill[oó]n|mueble|estante|repisa|clos|cl[oó]set|c[oó]moda|cama\b|velador|espejo|cortina|alfombra|l[aá]mpara|ampolleta|foco|luminaria|piso de goma|toldo|parrilla|asador|lona|tendedero|perchero|carrito|organizador|caja de almacen|percha|pizarra|colgador|reloj de pared|guirnalda|vela|cera de soja|aislante de puerta|burlete|cuadro|maceter|alero|caja de seguridad|tirador|pomo|billetera|maleta|bolso|mochila|tote|cartera|cajas de cart[oó]n|bolsa de papel|saco|sublimaci[oó]n/i],
  ['Deportes', /trotadora|bicicleta|spinning|mancuerna|pesa .*(rusa|gimnas)|yoga|colchoneta|camping|carpa|caminadora|el[ií]ptica|f[uú]tbol|pelota|nataci[oó]n|gimnasio|abdominal|abs wheel|barra de ejercicio|dominadas|flexiones|raqueta|tenis|billar|taco de billar|patines|scooter|casco/i],
  ['Oficina y Papelería', /plotter|papel bond|hoja|impresi[oó]n|papel adhesivo|resma|carpeta|archivador|plum[oó]n|chapitas|album|sobres|l[aá]mina|cuaderno|lapiz|l[aá]piz|marcador|sharpie|corchete|clip|calculadora|agenda/i],
  ['Jardín y Exterior', /jard[ií]n|c[eé]sped|manguera|maceta|planta|fertilizante|panel solar|foco solar|estaci[oó]n de energ[ií]a|generador|bal[oó]n de gas|gas 227|extintor|pasto sint[eé]tico|fibra de coco|sustrato|reja|puntas reja|antip[aá]nico|barra de empuje|cable el[eé]ctrico|cord[oó]n el[eé]ctrico/i],
  ['Juguetes', /juguete|super zings|figura coleccion|cubos multiencaje|unifix|puzzle|lego|didactic|pok[eé]mon|cartas|guitarra|instrumento|atril|didact/i],
  ['Supermercado', /agua destilada|agua desmineralizada|arroz|az[uú]car|aceite .*(oliva|maravilla)|caf[eé] \d|t[eé] \d|snack|bebida|conserva|fideo|harina|sal fina/i],
  ['Vestuario', /calza|polera|poler[oó]n|chaqueta|panta[l][oó]n|zapatilla|zapato|calcetin|ropa interior|vestido|jeans|chiporro|polar|gorro|jockey|bufanda|pijama/i],
];

export const categoriaDe = (titulo = '') =>
  (REGLAS.find(([, re]) => re.test(titulo)) || ['Varios'])[0];

export const CATEGORIAS = [...new Set(REGLAS.map(([c]) => c)), 'Varios'];

// Palabras que no aportan nada a una URL.
const RUIDO = /^(pack|set|kit|nuevo|nueva|original|oferta|combo|caja|100|10|x2|el|la|los|las|de|del|para|con|y|a|en|un|una)$/i;

/**
 * Slug corto y legible. `usados` es un Set que se va llenando para garantizar
 * unicidad sin depender de que Mercado Libre no repita nombres.
 */
export function hacerSlug(titulo, id, usados = new Set()) {
  const palabras = slugify(titulo).split('-').filter((w) => w && !RUIDO.test(w));
  let base = palabras.slice(0, 6).join('-').slice(0, 60).replace(/-+$/, '');
  if (!base) base = 'producto';
  let slug = base;
  if (usados.has(slug)) slug = `${base}-${String(id || '').slice(-5).toLowerCase()}`;
  let n = 2;
  while (usados.has(slug)) slug = `${base}-${n++}`;
  usados.add(slug);
  return slug;
}
