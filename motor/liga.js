// Motor de puntuación de La Vuelta a TriSport, SIN capa de estrategia.
// SÍ está en producción: `npm run build:motor` lo copia a web/motor/liga.js y la PWA
// puntúa con él en el navegador. Tocar un peso aquí cambia la liga real.
//
// Diferencias con el modelo actual (src/model.mjs):
//   · No hay sprint, robo, duelo, escudo ni energía.
//   · La semana se puntúa por CUATRO PILARES: constancia, dedicación, desnivel y
//     tirada larga (+ variedad). El actual ignora el desnivel y capa el volumen a
//     45 min, así que una salida de 5 h valía lo mismo que una de 45 min.
//   · Esa puntuación semanal no va a un cofre acumulado: decide un ENFRENTAMIENTO
//     1v1 dentro de tu división. 3 puntos la victoria, 1 el empate, 0 la derrota.
//
// Por qué por divisiones: simulado sobre la temporada real, premiar desnivel y
// tiradas largas en una tabla única DISPERSA al pelotón (de 13 a 10 atletas dentro
// del 50% del líder). Repartiendo en grupos de 8 suben a 19 de 24.

/** Un día cuenta si llega al mínimo. Mismo anti-farmeo que el motor actual. */
export const diaValido = (d) => d.min >= 15 || d.km >= 3;

/**
 * Parámetros de la puntuación semanal. Todo tuneable desde aquí.
 *
 * ESCALA 30: una etapa vale como mucho 30 puntos y cada regla se dice en una frase.
 * La escala anterior llegaba a 185 por etapa y 1.600 por temporada: cifras que nadie
 * retiene ni comenta. Los rendimientos decrecientes de las horas ya no vienen de una
 * raiz cuadrada (que no hay forma de explicarle a un socio) sino de un tope que ademas
 * SI se alcanza: el 10% de las semanas del club pasan de 10 h, mientras que el tope
 * viejo de 25 h se toco una sola vez en toda la temporada.
 */
export const PILARES = {
  DIAS_TOPE: 5,          // 2 por dia hasta 5 dias                          -> 10
  PTS_DIA: 2,
  OBJETIVO_DIAS: 3,      // la "semana cumplida" del club
  BONUS_SEMANA: 3,       // +3 al llegar a 3 dias                           ->  3
  RACHA_DIAS: 5,
  BONUS_RACHA: 2,        // +2 mas al llegar a 5                            ->  2
  HORAS_POR_PUNTO: 2,    // 1 punto por cada 2 horas                        ->  5
  DED_TOPE: 5,
  DESNIVEL_POR_PUNTO: 600, // 1 punto por cada 600 m+                       ->  5
  DESNIVEL_TOPE: 5,
  // Un metro de desnivel a pie cuesta el doble que uno sobre la bici: medido sobre el
  // verano del club, la bici sube 194 m/h y la carrera 96 m/h. Con la vara unica, el
  // pilar regalaba 0,78 puntos por etapa a quien montaba en bici.
  DESNIVEL_FACTOR_PIE: 2,
  // Cada disciplina tiene su propia idea de "tirada larga": 90' corriendo lo son,
  // 90' en bici son un paseo, y 240' nadando no existen. Era el pilar mas sesgado de
  // los cinco (1,48 vs 0,40 por etapa) pese a parecer el mas inocente.
  TIRADA_POR_DISC: {
    b: [[120, 1], [210, 2], [300, 3]], // bici
    c: [[60, 1], [90, 2], [150, 3]],   // carrera
    n: [[30, 1], [45, 2], [75, 3]],    // natacion
    o: [[60, 1], [90, 2], [150, 3]],   // lo demas (fuerza, caminar...)
  },
  TIRADA: [[90, 1], [150, 2], [240, 3]], // respaldo: dias sin desglose por disciplina
  VARIEDAD: { 2: 1, 3: 2 },              // disciplinas distintas           ->  2
  MAXIMO: 30,
};

/** Reglas del enfrentamiento semanal. */
export const DUELO = {
  VICTORIA: 3,
  EMPATE: 1,
  // Diferencia semanal por debajo de la cual se considera empate.
  UMBRAL_EMPATE: 5,
  // Semana en blanco de los dos: NO es empate, es derrota doble. Sin esta regla,
  // dos socios que no entrenan se llevaban un punto cada uno.
  CERO_CERO_ES_DERROTA: true,
};

/** Puntuación de UNA semana de UN atleta, con su desglose. */
export function puntuarSemana(dias, P = PILARES) {
  const ds = dias.filter(diaValido);
  if (!ds.length) return { total: 0, dias: 0, constancia: 0, dedicacion: 0, desnivel: 0, tirada: 0, variedad: 0, horas: 0, metros: 0, masLarga: 0 };

  const horas = ds.reduce((s, d) => s + d.min, 0) / 60;
  const metros = ds.reduce((s, d) => s + d.elev, 0);
  const masLarga = Math.max(...ds.map((d) => d.maxmin));
  // Desnivel a pie, si el dia lo trae desglosado. Los simuladores offline no lo traen:
  // entonces vale 0 y todo el desnivel cuenta como el de la bici, igual que antes.
  const metrosPie = ds.reduce((s, d) => s + (d.elevPie || 0), 0);
  const discs = new Set(ds.flatMap((d) => [...d.discs]).filter((c) => c && c !== "o"));

  const constancia = Math.min(ds.length, P.DIAS_TOPE) * P.PTS_DIA
    + (ds.length >= P.OBJETIVO_DIAS ? P.BONUS_SEMANA : 0)
    + (ds.length >= P.RACHA_DIAS ? P.BONUS_RACHA : 0);
  // Enteros a proposito: "1 punto cada 2 horas" se entiende; "9 por la raiz de tus
  // horas" no. El truncado hacia abajo evita que 1h59 parezca una hora completa.
  const dedicacion = Math.min(Math.floor(horas / P.HORAS_POR_PUNTO), P.DED_TOPE);
  const metrosEq = metros + metrosPie * (P.DESNIVEL_FACTOR_PIE - 1);
  const desnivel = Math.min(Math.floor(metrosEq / P.DESNIVEL_POR_PUNTO), P.DESNIVEL_TOPE);
  // La mejor tirada de cada disciplina se mide con SU vara y se queda la mas valiosa.
  let tirada = 0;
  if (ds.some((d) => d.maxPorDisc)) {
    const mejor = {};
    for (const d of ds) for (const [disc, m] of Object.entries(d.maxPorDisc || {})) {
      mejor[disc] = Math.max(mejor[disc] || 0, m);
    }
    for (const [disc, m] of Object.entries(mejor)) {
      const escala = P.TIRADA_POR_DISC[disc] || P.TIRADA_POR_DISC.o;
      let p = 0;
      for (const [mins, pts] of escala) if (m >= mins) p = pts;
      tirada = Math.max(tirada, p);
    }
  } else {
    for (const [mins, pts] of P.TIRADA) if (masLarga >= mins) tirada = pts;
  }
  const variedad = P.VARIEDAD[Math.min(discs.size, 3)] || 0;

  const r1 = (n) => Math.round(n * 10) / 10;
  return {
    total: r1(constancia + dedicacion + desnivel + tirada + variedad),
    dias: ds.length, constancia, dedicacion: r1(dedicacion), desnivel: r1(desnivel),
    tirada, variedad, horas: r1(horas), metros: Math.round(metros), masLarga,
  };
}

/** Calendario round-robin (algoritmo del círculo). n par → n-1 jornadas. */
export function calendario(equipos) {
  const eq = equipos.slice();
  if (eq.length % 2) eq.push(null); // descansa
  const fijo = eq[0], rot = eq.slice(1), rondas = [];
  for (let r = 0; r < eq.length - 1; r++) {
    const pares = [[fijo, rot[rot.length - 1]]];
    for (let i = 0; i < (eq.length - 2) / 2; i++) pares.push([rot[i], rot[rot.length - 2 - i]]);
    rondas.push(pares.filter(([a, b]) => a && b));
    rot.unshift(rot.pop());
  }
  return rondas;
}

const filaVacia = () => ({ pj: 0, g: 0, e: 0, p: 0, pts: 0, favor: 0, contra: 0, racha: [] });

/**
 * Juega una división completa.
 * @param {string[]} equipos
 * @param {string[]} semanas  claves ISO ordenadas
 * @param {(atleta:string, semana:string)=>object} marcador  puntuarSemana ya aplicado
 */
export function jugarDivision(equipos, semanas, marcador, D = DUELO) {
  const cal = calendario(equipos);
  const tabla = new Map(equipos.map((n) => [n, filaVacia()]));
  const jornadas = [];

  semanas.forEach((w, i) => {
    const ronda = cal[i % cal.length];
    const partidos = [];
    for (const [a, b] of ronda) {
      const ma = marcador(a, w), mb = marcador(b, w);
      const ta = tabla.get(a), tb = tabla.get(b);
      ta.pj++; tb.pj++;
      ta.favor += ma.total; ta.contra += mb.total;
      tb.favor += mb.total; tb.contra += ma.total;

      let res;
      if (D.CERO_CERO_ES_DERROTA && ma.total === 0 && mb.total === 0) {
        ta.p++; tb.p++; ta.racha.push("P"); tb.racha.push("P"); res = "doble derrota";
      } else if (Math.abs(ma.total - mb.total) <= D.UMBRAL_EMPATE) {
        ta.e++; tb.e++; ta.pts += D.EMPATE; tb.pts += D.EMPATE;
        ta.racha.push("E"); tb.racha.push("E"); res = "empate";
      } else if (ma.total > mb.total) {
        ta.g++; tb.p++; ta.pts += D.VICTORIA; ta.racha.push("G"); tb.racha.push("P"); res = a;
      } else {
        tb.g++; ta.p++; tb.pts += D.VICTORIA; tb.racha.push("G"); ta.racha.push("P"); res = b;
      }
      partidos.push({ local: a, visitante: b, ma, mb, res });
    }
    jornadas.push({ semana: w, numero: i + 1, partidos, clasificacion: ordenar(tabla) });
  });

  return { tabla: ordenar(tabla), jornadas };
}

function ordenar(tabla) {
  return [...tabla.entries()]
    .map(([nombre, t]) => ({ nombre, ...t, dif: Math.round(t.favor - t.contra) }))
    .sort((a, b) => b.pts - a.pts || b.dif - a.dif || b.favor - a.favor);
}
