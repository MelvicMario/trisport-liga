// Liga por equipos (temporada que arranca el 23/11/2026). Sustituye a la Vuelta.
//
// Reglas acordadas con Victor el 13/11 (ver docs/17-liga-equipos-normas.md). Todo lo
// que se puede discutir esta en NORMAS: cambiar una regla es cambiar un numero aqui, y
// el reglamento de la app se pinta desde estos mismos valores.
//
// Sin dependencias de Node: corre igual en Node (pruebas) y en la PWA (web/motor/).
// Reglas deterministas, sin IA.

import { isoWeek, lunesDe } from "./fechas.js";

export const NORMAS = {
  TEMPORADA: "liga-equipos-2026", // clave en vuelta_plantillas
  INICIO: "2026-11-23",           // lunes de la primera semana (puntos a cero)
  SEMANAS: 12,
  MIN_DIA: 20,        // minutos para que un dia cuente como dia activo
  PTS_DIA: 10,        // por dia activo...
  DIAS_TOPE: 5,       // ...hasta 5 dias por semana                    -> 50
  OBJETIVO_DIAS: 3,
  BONUS_SEMANA: 20,   // semana con 3 dias o mas                         -> 20
  MIN_POR_PUNTO: 30,  // volumen: 1 punto por cada 30 min de la semana...
  VOL_TOPE: 20,       // ...hasta 20 (10 horas)                          -> 20
  // Maximo individual por semana: 50 + 20 + 20 = 90.
  PLUS_TOPE: 50,      // lo que pasa de los topes suma solo al equipo, hasta 50 por persona
};

// Mismo orden que el reparto en serpiente (equipo 1 = Getafe Victorious). Perales
// Grenadiers se deshizo el 21/11 y sus cuatro pasaron a otros equipos. Ese mismo dia
// Buenavista Premier Tech se fusiono con Sector III Deceuninck y se reequilibro por
// horas de Strava: quedan 5 equipos de 4 a 7.
export const EQUIPOS = [
  "Getafe Victorious",
  "Alhóndiga Quick-Step",
  "Bercial-Trek",
  "Sector III Deceuninck",
  "Team Juan de la Cierva",
];

// Las cinco camisetas. El orden importa: se reparten de arriba abajo (nadie lleva dos).
export const MAILLOTS = [
  { id: "rojo",    nombre: "Maillot rojo",       que: "General",      campo: "total",       unidad: "puntos",
    como: "quien más puntos lleva en la liga" },
  { id: "verde",   nombre: "Maillot verde",      que: "Regularidad",  campo: "dias",        unidad: "días",
    como: "quien más días activos suma" },
  { id: "montana", nombre: "Maillot de lunares", que: "Montaña",      campo: "metros",      unidad: "m de desnivel",
    como: "quien más metros de desnivel acumula" },
  { id: "fondo",   nombre: "Maillot naranja",    que: "Fondo",        campo: "horas",       unidad: "horas",
    como: "quien más horas entrena" },
  { id: "blanco",  nombre: "Maillot blanco",     que: "Sprint",       campo: "mejorSemana", unidad: "puntos en una semana",
    como: "la mejor semana suelta, con su extra" },
];

export const maxIndividual =(N = NORMAS) =>
  N.DIAS_TOPE * N.PTS_DIA + N.BONUS_SEMANA + N.VOL_TOPE;

const r1 = (n) => Math.round(n * 10) / 10;

/** "2026-11-23" -> Date local (isoWeek trabaja con fecha local, no UTC). */
function fechaLocal(s) {
  const [y, m, d] = String(s).slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
}
const ymd = (d) => d.toISOString().slice(0, 10);

/**
 * Puntos de UNA persona en UNA semana.
 * @param dias [{fecha, min}] un registro por dia (varios entrenos el mismo dia ya sumados)
 */
export function puntuarSemana(dias, N = NORMAS) {
  const validos = dias.filter((d) => (Number(d.min) || 0) >= N.MIN_DIA);
  const n = validos.length;
  const minutos = Math.round(validos.reduce((s, d) => s + (Number(d.min) || 0), 0));
  const bloques = Math.floor(minutos / N.MIN_POR_PUNTO);

  const ptsDias = Math.min(n, N.DIAS_TOPE) * N.PTS_DIA;
  const bonus = n >= N.OBJETIVO_DIAS ? N.BONUS_SEMANA : 0;
  const volumen = Math.min(bloques, N.VOL_TOPE);
  const individual = ptsDias + bonus + volumen;

  // El sobrante entero (dias 6 y 7, y el volumen por encima de 10 h) solo para el equipo.
  const extraDias = Math.max(0, n - N.DIAS_TOPE) * N.PTS_DIA;
  const extraVol = Math.max(0, bloques - N.VOL_TOPE);
  const plus = Math.min(extraDias + extraVol, N.PLUS_TOPE);

  return { dias: n, minutos, ptsDias, bonus, volumen, individual, plus, paraEquipo: individual + plus };
}

/** Semanas de la temporada: [{semana, lunes, domingo, numero}] */
export function semanasTemporada(N = NORMAS) {
  const inicio = lunesDe(isoWeek(fechaLocal(N.INICIO)));
  return Array.from({ length: N.SEMANAS }, (_, i) => {
    const l = new Date(inicio);
    l.setUTCDate(inicio.getUTCDate() + i * 7);
    const dom = new Date(l);
    dom.setUTCDate(l.getUTCDate() + 6);
    return { numero: i + 1, semana: isoWeek(fechaLocal(ymd(l))), lunes: ymd(l), domingo: ymd(dom) };
  });
}

/**
 * Calcula la liga entera.
 * @param atletas    [{key, nombre, activo}]
 * @param plantillas [{equipo, atleta_key}]   reparto de esta temporada
 * @param dias       [{atleta_nombre, fecha, min}] salida del RPC vuelta_dias
 * @param hoy        "YYYY-MM-DD" (para saber que semanas han empezado)
 */
export function calcularLiga({ atletas = [], plantillas = [], dias = [], hoy, N = NORMAS }) {
  const hoyS = hoy || ymd(new Date());
  const todas = semanasTemporada(N);
  const jugadas = todas.filter((s) => s.lunes <= hoyS);
  const idxSemana = new Map(jugadas.map((s, i) => [s.semana, i]));
  const actual = jugadas.length ? jugadas.length - 1 : -1;

  // Solo socios de alta. Los de baja dejan de puntuar y salen de la media de su equipo.
  const activos = atletas.filter((a) => a.activo !== false);
  const porNombre = new Map(activos.map((a) => [a.nombre, a]));

  // dias -> persona -> semana -> [{fecha, min}]
  const cubo = new Map();
  for (const d of dias) {
    if (!porNombre.has(d.atleta_nombre)) continue;
    const f = String(d.fecha).slice(0, 10);
    if (f < N.INICIO || f > hoyS) continue;
    const i = idxSemana.get(isoWeek(fechaLocal(f)));
    if (i === undefined) continue;
    if (!cubo.has(d.atleta_nombre)) cubo.set(d.atleta_nombre, jugadas.map(() => []));
    cubo.get(d.atleta_nombre)[i].push({ fecha: f, min: Number(d.min) || 0, elev: Number(d.elev) || 0 });
  }

  const equipoDe = new Map(plantillas.map((p) => [p.atleta_key, p.equipo]));

  const personas = activos.map((a) => {
    const crudo = cubo.get(a.nombre) || jugadas.map(() => []);
    const semanas = crudo.map((ds) => puntuarSemana(ds, N));
    const todos = crudo.flat();
    return {
      metros: Math.round(todos.reduce((s, d) => s + d.elev, 0)),
      horas: r1(todos.reduce((s, d) => s + d.min, 0) / 60),
      mejorSemana: Math.max(0, ...semanas.map((x) => x.paraEquipo)),
      key: a.key,
      nombre: a.nombre,
      equipo: equipoDe.get(a.key) || null,
      semanas,
      total: semanas.reduce((s, x) => s + x.individual, 0),
      plus: semanas.reduce((s, x) => s + x.plus, 0),
      semanasBonus: semanas.filter((x) => x.bonus > 0).length,
      dias: semanas.reduce((s, x) => s + x.dias, 0),
    };
  });

  // Desempate: mas semanas con el +20, luego mas dias activos.
  const orden = (a, b) => b.total - a.total || b.semanasBonus - a.semanasBonus || b.dias - a.dias
    || a.nombre.localeCompare(b.nombre);
  const individual = [...personas].sort(orden);
  individual.forEach((p, i) => { p.puesto = i + 1; });

  // Equipos: la nota de la semana es la media de sus miembros (individual + plus).
  // Quien no tiene Strava conectado cuenta como 0: la media es sobre todos los del equipo (de 4 a 7).
  const nombresEq = [...new Set([...EQUIPOS, ...plantillas.map((p) => p.equipo)])]
    .filter((e) => plantillas.some((p) => p.equipo === e));
  const equipos = nombresEq.map((nombre) => {
    const miembros = personas.filter((p) => p.equipo === nombre);
    const porSemana = jugadas.map((_, i) => miembros.length
      ? r1(miembros.reduce((s, m) => s + m.semanas[i].paraEquipo, 0) / miembros.length) : 0);
    return {
      nombre,
      numero: EQUIPOS.indexOf(nombre) + 1,
      miembros: miembros
        .map((m) => ({ nombre: m.nombre, total: m.total, plus: m.plus,
                       semana: actual >= 0 ? m.semanas[actual] : null }))
        .sort((a, b) => b.total + b.plus - (a.total + a.plus)),
      porSemana,
      total: r1(porSemana.reduce((s, x) => s + x, 0)),
      semanaActual: actual >= 0 ? porSemana[actual] : 0,
      semanasBonus: miembros.reduce((s, m) => s + m.semanasBonus, 0),
      dias: miembros.reduce((s, m) => s + m.dias, 0),
    };
  }).sort((a, b) => b.total - a.total || b.semanasBonus - a.semanasBonus || b.dias - a.dias);
  equipos.forEach((e, i) => { e.puesto = i + 1; });

  // Maillots, como en la Vuelta: nadie luce dos. Si el lider de una clasificacion ya
  // lleva otro, lo viste el siguiente. Sin nada que medir (valor 0), no hay portador.
  const lucido = new Set();
  const maillots = MAILLOTS.map((m) => {
    const tabla = [...personas].filter((p) => p[m.campo] > 0)
      .sort((a, b) => b[m.campo] - a[m.campo] || orden(a, b));
    const lider = tabla.find((p) => !lucido.has(p.key)) || null;
    if (lider) lucido.add(lider.key);
    return { ...m, portador: lider ? lider.nombre : null, portadorKey: lider ? lider.key : null,
             valor: lider ? lider[m.campo] : 0,
             puesto: new Map(tabla.map((p, i) => [p.key, i + 1])),
             tabla: tabla.slice(0, 5).map((p) => ({ nombre: p.nombre, valor: p[m.campo] })) };
  });

  return {
    normas: N,
    hoy: hoyS,
    maillots,
    empezada: jugadas.length > 0,
    terminada: jugadas.length === todas.length && hoyS > todas[todas.length - 1].domingo,
    semanas: todas,
    actual,               // indice de la semana en curso dentro de "jugadas" (-1 si no ha empezado)
    individual,
    equipos,
  };
}
