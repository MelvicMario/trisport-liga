// "La Vuelta a TriSport" — PROTOTIPO. Formato de gran vuelta por etapas.
// Se apoya en los pilares de src/liga.mjs y añade las tres capas que salieron de la
// investigación de enganche:
//
//   1. EQUIPOS de 3 con reparto en serpiente. La evidencia dice que los retos en grupo
//      suben el enganche un 30-60% y que "la obligación social personal" (que dos
//      personas concretas dependan de ti) pesa más que salir en una tabla pública.
//   2. CINCO MAILLOTS simultáneos. Una sola clasificación desengancha a quien no puede
//      ganarla; con cinco frentes casi todo el mundo pelea por algo. Validado sobre la
//      temporada real: los ganarian cinco personas distintas.
//   3. ETAPAS CON TERRENO. Los retos con fecha son lo que recupera al que se ha caido,
//      y hacen que cada semana la gane un perfil distinto de atleta.

import { puntuarSemana, diaValido, calendario } from "./liga.js";

/** Terrenos de etapa. El multiplicador se aplica al pilar correspondiente. */
// Cada terreno tiene que decirle a alguien "esta semana va de lo tuyo". Una etapa sin
// caracter es una semana que nadie abre.
export const TERRENOS = {
  llana:        { nombre: "Transición",    quien: "los que no fallan",
                  desc: "Todo cuenta igual. Sin trucos: gana quien aparece." },
  montana:      { nombre: "Alta montaña",  quien: "los escaladores",
                  desc: "El desnivel cuenta DOBLE. Semana de buscar cuestas." },
  fondo:        { nombre: "Etapa reina",   quien: "los fondistas",
                  desc: "Tu tirada más larga cuenta DOBLE. Toca salir de verdad." },
  triatleta:    { nombre: "Triatlón",      quien: "los completos",
                  desc: "La variedad cuenta TRIPLE. Nadar, rodar y correr en la misma semana." },
  contrarreloj: { nombre: "Contrarreloj",  quien: "los constantes",
                  desc: "Solo cuentan los días. El volumen no suma: aparecer lo es todo." },
};

/** Rotación de terrenos de una vuelta. Se anuncia el lunes, nunca se improvisa. */
/** Diferencia por debajo de la cual un enfrentamiento de equipos es empate. */
export const EMPATE_EQ = 2;

export const ROTACION = ["llana", "montana", "fondo", "llana", "triatleta",
                         "montana", "contrarreloj", "llana", "fondo", "montana"];

export const terrenoDe = (i) => ROTACION[i % ROTACION.length];

/** Puntuación de una semana APLICANDO el terreno de la etapa. */
export function puntuarEtapa(dias, terreno) {
  const p = puntuarSemana(dias);
  if (!p.total) return { ...p, terreno, total: 0, extra: 0 };
  let extra = 0;
  if (terreno === "montana") extra = p.desnivel;            // x2 sobre el pilar de desnivel
  else if (terreno === "fondo") extra = p.tirada;           // x2 sobre la tirada larga
  else if (terreno === "triatleta") extra = p.variedad * 2; // x3 sobre variedad
  else if (terreno === "contrarreloj")
    // Solo constancia: se descuenta todo lo demás.
    extra = -(p.dedicacion + p.desnivel + p.tirada + p.variedad);
  const r1 = (n) => Math.round(n * 10) / 10;
  return { ...p, terreno, extra: r1(extra), total: r1(p.total + extra) };
}

/** Reparto en serpiente: equipos equilibrados por nivel, no por afinidad. */
export function repartirEquipos(ordenPorNivel, nEquipos) {
  const eq = Array.from({ length: nEquipos }, () => []);
  ordenPorNivel.forEach((n, i) => {
    const vuelta = Math.floor(i / nEquipos), pos = i % nEquipos;
    eq[vuelta % 2 ? nEquipos - 1 - pos : pos].push(n);
  });
  return eq;
}

/**
 * Corre la vuelta entera.
 * @param {{nombre:string, semanas:Map<string,object[]>}[]} atletas
 * @param {string[]} semanas claves ISO ordenadas
 */
export function correrVuelta(atletas, semanas, { nEquipos = 8 } = {}) {
  const r0 = (n) => Math.round(n);

  // --- Etapas: puntuación de cada atleta en cada semana, con su terreno.
  const etapas = semanas.map((w, i) => {
    const terreno = terrenoDe(i);
    const marcas = atletas.map((a) => ({
      nombre: a.nombre, ...puntuarEtapa(a.semanas.get(w) || [], terreno),
    })).sort((x, y) => y.total - x.total);
    return { numero: i + 1, semana: w, terreno, ...TERRENOS[terreno], marcas };
  });

  const marcaDe = (n, i) => etapas[i].marcas.find((m) => m.nombre === n);

  // --- Acumulados por atleta.
  const acum = new Map(atletas.map((a) => [a.nombre, {
    nombre: a.nombre, general: 0, metros: 0, semanasCumplidas: 0, dias: 0,
    largas: 0, serie: [], victorias: 0,
  }]));
  etapas.forEach((e, i) => {
    if (e.marcas.length && e.marcas[0].total > 0) acum.get(e.marcas[0].nombre).victorias++;
    for (const m of e.marcas) {
      const a = acum.get(m.nombre);
      a.general += m.total; a.metros += m.metros; a.dias += m.dias;
      if (m.dias >= 3) a.semanasCumplidas++;
      if (m.masLarga >= 150) a.largas++;
      a.serie.push(m.total);
    }
  });
  for (const a of acum.values()) {
    a.general = r0(a.general);
    const ini = a.serie.slice(0, 3).reduce((s, x) => s + x, 0) / 3;
    const fin = a.serie.slice(-3).reduce((s, x) => s + x, 0) / 3;
    // Revelacion. Dos cautelas, las dos aprendidas de un caso real:
    //  1. Presencia: hay que haber cumplido al menos un tercio de las etapas. Sin esto
    //     ganaba alguien con 11 dias en 14 semanas, que no es una revelacion.
    //  2. Amortiguacion: el cociente fin/ini explota cuando el arranque es casi cero
    //     ([2,0,0] contra [4,8,0] daba x6). Sumando una constante a los dos lados, una
    //     mejora real destaca y el ruido de los numeros pequenos no.
    const K = 3;
    const presencia = a.semanasCumplidas >= Math.ceil(semanas.length / 3);
    a.mejora = presencia ? Math.round(((fin + K) / (ini + K)) * 100) / 100 : 0;
  }
  const lista = [...acum.values()];

  // --- Maillots. Como en las grandes vueltas, nadie luce dos: si el líder de la general
  //     encabeza otra clasificación, el maillot lo lleva el siguiente.
  const clasif = [
    { id: "rojo",    nombre: "Maillot rojo",     que: "General",       campo: "general",          unidad: "pts" },
    { id: "montana", nombre: "Maillot de montaña", que: "Desnivel",    campo: "metros",           unidad: "m+" },
    { id: "verde",   nombre: "Maillot verde",    que: "Regularidad",   campo: "semanasCumplidas", unidad: `/${semanas.length} semanas` },
    { id: "fondo",   nombre: "Maillot de fondo", que: "Tiradas largas", campo: "largas",          unidad: "sesiones +150′" },
    { id: "blanco",  nombre: "Maillot blanco",   que: "Revelación",    campo: "mejora",           unidad: "× su inicio" },
  ];
  const lucido = new Set();
  const maillots = clasif.map((c) => {
    const tabla = [...lista].sort((a, b) => b[c.campo] - a[c.campo] ||
      (c.campo !== "general" ? b.general - a.general : 0)).slice(0, 5);
    const portador = tabla.find((t) => !lucido.has(t.nombre)) || tabla[0];
    lucido.add(portador.nombre);
    return { ...c, portador: portador.nombre, valor: portador[c.campo],
             tabla: tabla.map((t) => ({ nombre: t.nombre, valor: t[c.campo] })) };
  });

  // --- Equipos.
  const orden = [...lista].sort((a, b) => b.general - a.general).map((a) => a.nombre);
  const equipos = repartirEquipos(orden, nEquipos).map((miembros, i) => ({
    id: i + 1,
    nombre: NOMBRES_EQUIPO[i] || `Equipo ${i + 1}`,
    miembros,
    puntos: r0(miembros.reduce((s, n) => s + acum.get(n).general, 0)),
    porEtapa: etapas.map((_, j) => r0(miembros.reduce((s, n) => s + marcaDe(n, j).total, 0))),
  })).sort((a, b) => b.puntos - a.puntos);

  const general = [...lista].sort((a, b) => b.general - a.general);

  // --- Fichas personales. Lo que de verdad engancha no es la tabla: es verse uno.
  //     Cada corredor necesita saber donde va en las CINCO carreras, a cuanto esta del
  //     de delante (que casi siempre esta a tiro) y cual fue su mejor dia.
  const puestoEn = (campo) => {
    const orden = [...lista].sort((a, b) => b[campo] - a[campo]);
    return new Map(orden.map((a, i) => [a.nombre, { puesto: i + 1, valor: a[campo],
      anterior: i > 0 ? orden[i - 1] : null }]));
  };
  const rank = Object.fromEntries(clasif.map((c) => [c.id, puestoEn(c.campo)]));
  const equipoDe = new Map();
  for (const e of equipos) for (const m of e.miembros) equipoDe.set(m, e);

  // --- Liga de equipos: cada jornada te toca un rival concreto. Una tabla dice en que
  //     puesto vas; un enfrentamiento dice contra quien juegas ESTA semana, y eso es lo
  //     que genera pique. Round-robin: con 8 equipos son 7 jornadas que se repiten.
  const calEq = calendario(equipos.map((e) => e.nombre));
  const tablaEq = new Map(equipos.map((e) => [e.nombre, { pj:0,g:0,e:0,p:0,pts:0,favor:0,contra:0 }]));
  const puntosEq = (nombreEq, i) => {
    const eq = equipos.find((x) => x.nombre === nombreEq);
    return eq.miembros.reduce((s, n) => s + (marcaDe(n, i)?.total || 0), 0);
  };
  const jornadasEq = etapas.map((et, i) => {
    const partidos = calEq[i % calEq.length].map(([a, b]) => {
      const sa = r0(puntosEq(a, i)), sb = r0(puntosEq(b, i));
      const ta = tablaEq.get(a), tb = tablaEq.get(b);
      ta.pj++; tb.pj++; ta.favor += sa; ta.contra += sb; tb.favor += sb; tb.contra += sa;
      let gana = null;
      if (Math.abs(sa - sb) <= EMPATE_EQ) { ta.e++; tb.e++; ta.pts++; tb.pts++; }
      else if (sa > sb) { ta.g++; tb.p++; ta.pts += 3; gana = a; }
      else { tb.g++; ta.p++; tb.pts += 3; gana = b; }
      return { local: a, visitante: b, sa, sb, gana };
    });
    return { etapa: et.numero, partidos };
  });
  const clasifEq = [...tablaEq.entries()]
    .map(([nombre, t]) => ({ nombre, ...t, dif: r0(t.favor - t.contra),
      miembros: equipos.find((e) => e.nombre === nombre).miembros }))
    .sort((a, b) => b.pts - a.pts || b.dif - a.dif);

  // --- Tu rival: quien te ha rozado mas veces. No se inventa, se encuentra en los datos.
  const rivalDe = new Map();
  for (const a of lista) {
    let mejor = null;
    for (const b of lista) {
      if (a.nombre === b.nombre) continue;
      let ajustadas = 0, mias = 0, suyas = 0;
      for (let i = 0; i < etapas.length; i++) {
        const x = marcaDe(a.nombre, i)?.total || 0, y = marcaDe(b.nombre, i)?.total || 0;
        if (!x && !y) continue;
        if (Math.abs(x - y) <= EMPATE_EQ) ajustadas++;
        else if (x > y) mias++; else suyas++;
      }
      // Rival de verdad: muchas etapas rozandose y un balance parejo.
      if (mias + suyas + ajustadas < etapas.length / 2) continue;
      const equilibrio = 1 / (1 + Math.abs(mias - suyas));
      const nota = ajustadas * equilibrio;
      if (!mejor || nota > mejor.nota) mejor = { nombre: b.nombre, mias, suyas, ajustadas, nota };
    }
    if (mejor && mejor.ajustadas >= 3) rivalDe.set(a.nombre, mejor);
  }

  const fichas = general.map((a, i) => {
    const mias = etapas.map((e) => e.marcas.find((m) => m.nombre === a.nombre));
    const mejor = mias.reduce((b, m) => (m.total > (b?.total ?? -1) ? m : b), null);
    const mejorEtapa = etapas[mias.indexOf(mejor)];
    const eq = equipoDe.get(a.nombre);
    return {
      nombre: a.nombre,
      puesto: i + 1, puntos: a.general,
      alLider: r0(general[0].general - a.general),
      alDeDelante: i > 0 ? r0(general[i - 1].general - a.general) : 0,
      deDelante: i > 0 ? general[i - 1].nombre : null,
      dias: a.dias, metros: a.metros, victorias: a.victorias,
      semanasCumplidas: a.semanasCumplidas, largas: a.largas, mejora: a.mejora,
      clasificaciones: clasif.map((c) => {
        const r = rank[c.id].get(a.nombre);
        return { id: c.id, que: c.que, puesto: r.puesto, valor: r.valor, unidad: c.unidad,
          falta: r.anterior ? Math.round((r.anterior[c.campo] - r.valor) * 100) / 100 : 0,
          sobre: r.anterior ? r.anterior.nombre : null };
      }),
      equipo: eq ? { nombre: eq.nombre, puesto: equipos.indexOf(eq) + 1,
                     companeros: eq.miembros.filter((m) => m !== a.nombre) } : null,
      mejorEtapa: mejorEtapa ? { numero: mejorEtapa.numero, terreno: mejorEtapa.nombre,
                                 total: r0(mejor.total),
                                 puesto: mejorEtapa.marcas.findIndex((m) => m.nombre === a.nombre) + 1 } : null,
      porEtapa: mias.map((m) => r0(m.total)),
      rival: rivalDe.get(a.nombre) || null,
    };
  });

  // --- Momentos: una vuelta se cuenta, no solo se tabula.
  const momentos = [];
  const mejorMarca = etapas.flatMap((e) => e.marcas.map((m) => ({ ...m, e })))
    .sort((a, b) => b.total - a.total)[0];
  momentos.push({ titulo: "La mejor etapa de la vuelta",
    texto: `${mejorMarca.nombre} firmó ${r0(mejorMarca.total)} puntos en la etapa ${mejorMarca.e.numero} (${mejorMarca.e.nombre.toLowerCase()}), con ${mejorMarca.dias} días, ${mejorMarca.metros.toLocaleString("es-ES")} m+ y una tirada de ${mejorMarca.masLarga}′.` });
  const dura = [...etapas].sort((a, b) =>
    b.marcas.reduce((s, m) => s + m.metros, 0) - a.marcas.reduce((s, m) => s + m.metros, 0))[0];
  momentos.push({ titulo: "La etapa reina",
    texto: `La etapa ${dura.numero} acumuló ${dura.marcas.reduce((s, m) => s + m.metros, 0).toLocaleString("es-ES")} m+ entre todo el club. La ganó ${dura.marcas[0].nombre}.` });
  const remonta = [...fichas].filter((f) => f.mejora > 0).sort((a, b) => b.mejora - a.mejora)[0];
  if (remonta) momentos.push({ titulo: "La progresión",
    texto: `${remonta.nombre} acabó la vuelta rindiendo ${remonta.mejora}× lo que rendía en las tres primeras etapas. Nadie mejoró tanto.` });
  const apretado = equipos.length > 1
    ? { a: equipos[0], b: equipos[1], dif: equipos[0].puntos - equipos[1].puntos } : null;
  if (apretado) momentos.push({ titulo: "Los equipos, al sprint",
    texto: `${apretado.a.nombre} gana a ${apretado.b.nombre} por ${apretado.dif} puntos de ${apretado.a.puntos.toLocaleString("es-ES")}. Un día de más de cualquiera de los seis lo cambiaba.` });

  // --- La proxima etapa. Es el unico dato que mira hacia delante y probablemente el
  //     que mas trafico genera: la razon para abrir la app un lunes es saber que toca.
  const sig = terrenoDe(semanas.length);
  const proxima = {
    numero: semanas.length + 1, terreno: sig, ...TERRENOS[sig],
    // Quien gano las etapas anteriores de este mismo terreno. Es el aviso a navegantes.
    especialistas: [...new Set(etapas.filter((e) => e.terreno === sig && e.marcas[0]?.total > 0)
      .map((e) => e.marcas[0].nombre))],
    // Quien se juega que: los que estan a tiro de subir un puesto en la general.
    aTiro: general.slice(1, 6).map((a, i) => ({
      nombre: a.nombre, puesto: i + 2,
      sobre: general[i].nombre, faltan: r0(general[i].general - a.general),
    })).filter((x) => x.faltan <= 80),
  };

  return { etapas, maillots, equipos, general, fichas, momentos, proxima,
           ligaEquipos: { clasificacion: clasifEq, jornadas: jornadasEq } };
}

// Nombres de equipo: barrios y sitios de Getafe con el molde de un equipo World Tour.
// Se reconoce el formato (Bahrain Victorious, INEOS Grenadiers, Soudal Quick-Step...) y
// suena a escuadra de verdad, pero sin reirse de nadie: el reparto es en serpiente y a
// nadie le preguntan en que equipo cae, asi que el chiste no puede ir contra el que lo
// lleva. Si un equipo quiere ponerse otro nombre, mejor: que lo elijan ellos.
const NOMBRES_EQUIPO = [
  "Getafe Victorious",       // Bahrain Victorious
  "Perales Grenadiers",      // INEOS Grenadiers
  "Alhóndiga Quick-Step",    // Soudal Quick-Step
  "Bercial-Trek",            // Lidl-Trek
  "Buenavista Premier Tech", // Israel-Premier Tech
  "Sector III Deceuninck",   // Alpecin-Deceuninck
  "Team Juan de la Cierva",  // UAE Team Emirates
  "Vía Verde Racing",
];
