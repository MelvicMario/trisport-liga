// Carga las actividades de Supabase y corre LA MISMA maquinaria que el sync, pero en
// el navegador. No hay un JSON intermedio ni un segundo juego de reglas: si se cambia
// un peso en src/liga.mjs, la app lo aplica en la siguiente recarga.
//
// Puede hacerse en cliente porque el motor (fechas/liga/vuelta) no depende de Node. Las
// actividades de otros socios no se leen: llegan solo los totales por dia (RPC vuelta_dias).

import { isoWeek } from "./motor/fechas.js";
import { diaValido } from "./motor/liga.js";
import { correrVuelta } from "./motor/vuelta.js";

/** Primera etapa de la temporada nueva. Antes de esto es la liga vieja. */
export const INICIO_VUELTA = "2026-09-08"; // lunes, semana ISO 2026-W37

/**
 * Trae las actividades que puntúan y las agrupa por atleta y semana, en la forma
 * exacta que espera correrVuelta().
 */
export async function cargarVuelta(sb, { desde = INICIO_VUELTA } = {}) {
  // Solo corren los socios de ALTA. Sin esto, los entrenos de quien se ha dado de baja
  // seguirian puntuando: la Vuelta agrupa por atleta_nombre, no por la tabla de atletas.
  const { data: plantilla } = await sb.from("atletas").select("nombre,activo");
  const enActivo = new Set((plantilla || []).filter((a) => a.activo !== false).map((a) => a.nombre));

  // Totales por atleta y día, ya agregados en el servidor (el motor razona en días, no en
  // actividades sueltas). Ver supabase/actividades-solo-propias.sql.
  const { data, error } = await sb.rpc("vuelta_dias", { p_desde: desde });
  if (error) throw new Error("No se pudieron leer las actividades: " + error.message);

  const porAtleta = new Map();
  for (const f of data || []) {
    if (enActivo.size && !enActivo.has(f.atleta_nombre)) continue; // de baja, no puntua
    if (!porAtleta.has(f.atleta_nombre)) porAtleta.set(f.atleta_nombre, new Map());
    porAtleta.get(f.atleta_nombre).set(f.fecha, {
      date: f.fecha, ts: new Date(f.fecha + "T12:00:00"),
      min: Number(f.min), km: Number(f.km), elev: Number(f.elev), maxmin: Number(f.maxmin),
      discs: f.discs,
      // Desglose que necesitan las varas por deporte: desnivel hecho a pie y la
      // sesion mas larga DE CADA disciplina (no vale el maximo del dia a secas).
      elevPie: Number(f.elev_pie), maxPorDisc: f.max_por_disc,
    });
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
