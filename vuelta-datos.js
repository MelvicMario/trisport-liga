// Carga las actividades de Supabase y corre LA MISMA maquinaria que el sync, pero en
// el navegador. No hay un JSON intermedio ni un segundo juego de reglas: si se cambia
// un peso en src/liga.mjs, la app lo aplica en la siguiente recarga.
//
// Puede hacerse en cliente porque la RLS de 'actividades' deja leerlas a cualquier
// socio autenticado, y el motor (fechas/liga/vuelta) no depende de Node.

import { isoWeek } from "./motor/fechas.js";
import { diaValido } from "./motor/liga.js";
import { correrVuelta } from "./motor/vuelta.js";

/** Primera etapa de la temporada nueva. Antes de esto es la liga vieja. */
export const INICIO_VUELTA = "2026-09-08"; // lunes, semana ISO 2026-W37

/** Disciplina en la letra que espera el motor. */
function letra(deporte) {
  const d = String(deporte || "").toLowerCase();
  if (d.includes("swim")) return "n";
  if (d.includes("ride")) return "b";
  if (d.includes("run")) return "c";
  return "o";
}

/**
 * Trae las actividades que puntúan y las agrupa por atleta y semana, en la forma
 * exacta que espera correrVuelta().
 */
export async function cargarVuelta(sb, { desde = INICIO_VUELTA } = {}) {
  // Solo corren los socios de ALTA. Sin esto, los entrenos de quien se ha dado de baja
  // seguirian puntuando: la Vuelta agrupa por atleta_nombre, no por la tabla de atletas.
  const { data: plantilla } = await sb.from("atletas").select("nombre,activo");
  const enActivo = new Set((plantilla || []).filter((a) => a.activo !== false).map((a) => a.nombre));

  const { data, error } = await sb
    .from("actividades")
    .select("atleta_nombre,deporte,km,min,elev,fecha_actividad")
    // Fuera lo que no cuenta: filas sustituidas por su equivalente con fecha real y
    // refilas del recálculo de desnivel de Strava.
    .not("fuente", "in", "(club_obsoleto,duplicado_elev)")
    .gte("fecha_actividad", desde)
    .limit(20000);
  if (error) throw new Error("No se pudieron leer las actividades: " + error.message);

  // Agregar por atleta y día: el motor razona en días, no en actividades sueltas.
  const porAtleta = new Map();
  for (const a of data || []) {
    if (!a.atleta_nombre || !a.fecha_actividad) continue;
    if (enActivo.size && !enActivo.has(a.atleta_nombre)) continue; // de baja, no puntua
    if (!porAtleta.has(a.atleta_nombre)) porAtleta.set(a.atleta_nombre, new Map());
    const dias = porAtleta.get(a.atleta_nombre);
    if (!dias.has(a.fecha_actividad)) {
      dias.set(a.fecha_actividad, {
        date: a.fecha_actividad, ts: new Date(a.fecha_actividad + "T12:00:00"),
        min: 0, km: 0, elev: 0, maxmin: 0, discs: "",
        // Desglose que necesitan las varas por deporte: desnivel hecho a pie y la
        // sesion mas larga DE CADA disciplina (no vale el maximo del dia a secas).
        elevPie: 0, maxPorDisc: {},
      });
    }
    const d = dias.get(a.fecha_actividad);
    const min = Number(a.min) || 0;
    d.min += min;
    d.km += Number(a.km) || 0;
    d.elev += Number(a.elev) || 0;
    d.maxmin = Math.max(d.maxmin, Math.round(min));
    const l = letra(a.deporte);
    if (l !== "b") d.elevPie += Number(a.elev) || 0;
    d.maxPorDisc[l] = Math.max(d.maxPorDisc[l] || 0, Math.round(min));
    if (!d.discs.includes(l)) d.discs += l;
  }

  const semanas = new Set();
  const porSemanaDe = new Map();
  for (const [nombre, dias] of porAtleta) {
    const porSemana = new Map();
    for (const d of [...dias.values()].filter(diaValido)) {
      const w = isoWeek(d.ts);
      if (!porSemana.has(w)) porSemana.set(w, []);
      porSemana.get(w).push(d);
      semanas.add(w);
    }
    porSemanaDe.set(nombre, porSemana);
  }
  if (!semanas.size) return null; // temporada aún sin datos: la app lo dice, no revienta

  // Corren TODOS los socios de alta, entrenen o no. Si la plantilla saliera solo de
  // quien tiene actividades, un socio sin Strava conectado no existiria en la Vuelta,
  // y el dia que subiera su primer entreno entraria en el sorteo de equipos y se lo
  // cambiaria a todo el mundo a mitad de temporada. Quien no entrena sale con 0.
  const nombres = enActivo.size ? [...enActivo] : [...porSemanaDe.keys()];
  const atletas = nombres.map((nombre) => ({
    nombre, semanas: porSemanaDe.get(nombre) || new Map(),
  }));

  const SEMANAS = [...semanas].sort();
  const v = correrVuelta(atletas, SEMANAS);
  v.meta = { desde: SEMANAS[0], hasta: SEMANAS[SEMANAS.length - 1],
             etapas: SEMANAS.length, corredores: atletas.length };
  return v;
}
