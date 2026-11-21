// Carga de la liga por equipos. Lee lo mismo que la Vuelta (el RPC vuelta_dias, que
// solo da totales por dia: nadie ve los entrenos de otro) mas el reparto de equipos
// de vuelta_plantillas. El calculo se hace en el navegador con el mismo motor que las
// pruebas (motor/liga-equipos.js).
import { calcularLiga, NORMAS } from "./motor/liga-equipos.js";

export async function cargarLiga(sb, { hoy } = {}) {
  const [{ data: atletas, error: e1 }, { data: plantillas, error: e2 }, { data: dias, error: e3 }] =
    await Promise.all([
      sb.from("atletas").select("key,nombre,activo"),
      sb.from("vuelta_plantillas").select("equipo,atleta_key").eq("temporada", NORMAS.TEMPORADA),
      sb.rpc("vuelta_dias", { p_desde: NORMAS.INICIO }),
    ]);
  if (e1 || e3) throw new Error((e1 || e3).message);
  // Sin reparto cargado la liga individual funciona igual; los equipos salen vacios.
  if (e2) console.warn("vuelta_plantillas:", e2.message);
  return calcularLiga({ atletas: atletas || [], plantillas: plantillas || [], dias: dias || [], hoy });
}
