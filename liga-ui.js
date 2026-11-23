// Pantallas de la liga por equipos. Devuelven HTML; no tocan Supabase (reciben el
// resultado de cargarLiga). Reutilizan las clases que ya existen (card, vTabla, vClas...):
// no hay estilos nuevos.
import { maxIndividual, MAILLOTS as L_MAILLOTS } from "./motor/liga-equipos.js";
import { marcaStrava, maillotSVG } from "./vuelta-ui.js";

// Mismos colores que los maillots de la Vuelta (vuelta-ui.js).
const COLOR = { rojo: "#D7263D", montana: "#E8E4DA", verde: "#00A758", fondo: "#F47A20", blanco: "#FFFFFF" };

function valorMaillot(m, v) {
  return `${num(v)} ${m.unidad}`;
}

/** Las cinco camisetas con quien las lleva. Antes del lunes, que mide cada una. */
function bloqueMaillots(L) {
  return `<h2 class="section">Los maillots</h2>
  <div class="vMaillots">
    ${L.maillots.map((m) => `<div class="vMaillot" style="--c:${COLOR[m.id]}">
      ${maillotSVG(m.id, 38)}
      <div><div class="vQue">${m.que}</div>
        <div class="vQuien">${m.portador ? esc(m.portador) : "Por estrenar"}</div>
        <div class="vVal">${m.portador ? valorMaillot(m, m.valor) : esc(m.como)}</div></div>
    </div>`).join("")}
  </div>`;
}

const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const num = (n) => (Math.round((n || 0) * 10) / 10).toLocaleString("es-ES");
const fecha = (s) => { const [, m, d] = s.split("-"); return `${Number(d)}/${Number(m)}`; };

function semanaEnCurso(L) {
  return L.actual >= 0 ? L.semanas[L.actual] : null;
}

function cabecera(L) {
  const s = semanaEnCurso(L);
  if (!L.empezada) {
    const ini = L.semanas[0];
    return `<div class="card hero"><div class="nm" style="margin-bottom:6px">La liga por equipos
      arranca el lunes ${fecha(ini.lunes)}</div>
      <p class="hint" style="margin:0">Todos empezamos a cero. Son ${L.normas.SEMANAS} semanas, de
      lunes a domingo. Puntúan los entrenos de Strava conectado a la app.</p></div>`;
  }
  if (L.terminada) return `<div class="card hero"><div class="nm">Liga terminada</div></div>`;
  return `<p class="hint" style="margin:0 0 8px">Semana <b>${s.numero}</b> de ${L.normas.SEMANAS} ·
    del ${fecha(s.lunes)} al ${fecha(s.domingo)}</p>`;
}

function tablaEquipos(L, { conMiembros = true } = {}) {
  if (!L.equipos.length) return `<div class="card"><p class="hint" style="margin:0">Los equipos
    todavía no están cargados. Mientras tanto cuenta la clasificación individual.</p></div>`;
  return `<div class="tablabox"><table class="vTabla">
    <thead><tr><th></th><th>Equipo</th><th>Semana</th><th>Pts</th></tr></thead>
    <tbody>${L.equipos.map((e) => `<tr>
      <td class="pos">${L.empezada ? e.puesto : ""}</td>
      <td><b>${esc(e.nombre)}</b>${conMiembros
        ? `<span class="sub">${e.miembros.map((m) => esc(m.nombre)).join(" · ")}</span>` : ""}</td>
      <td class="dim">${num(e.semanaActual)}</td>
      <td class="pts">${num(e.total)}</td></tr>`).join("")}</tbody>
  </table></div>`;
}

/** Portada: en qué semana vamos y cómo van los equipos. */
export function vistaLigaPortada(L) {
  if (!L) return vacio();
  return cabecera(L) + bloqueMaillots(L) + `<h2 class="section">Clasificación por equipos</h2>` +
    tablaEquipos(L, { conMiembros: false }) +
    `<p class="hint">La nota del equipo es la suma de sus miembros. Si faltas, se nota.</p>` +
    marcaStrava();
}

/** Mi liga: mi semana desglosada, lo que me falta y mi equipo. */
export function vistaMiLiga(L, miKey) {
  if (!L) return vacio();
  const yo = L.individual.find((p) => p.key === miKey);
  if (!yo) return `<div class="card"><p class="hint" style="margin:0">No estás en la liga.
    Si crees que es un error, díselo a Victor.</p></div>`;
  const N = L.normas;
  const s = L.actual >= 0 ? yo.semanas[L.actual] : null;
  const eq = L.equipos.find((e) => e.nombre === yo.equipo);

  let consejo = "";
  if (s) {
    if (s.dias < N.OBJETIVO_DIAS) {
      const faltan = N.OBJETIVO_DIAS - s.dias;
      consejo = `Te ${faltan === 1 ? "falta 1 día" : `faltan ${faltan} días`} de ${N.MIN_DIA} minutos
        para el <b>+${N.BONUS_SEMANA}</b> de esta semana.`;
    } else if (s.dias < N.DIAS_TOPE) {
      consejo = `Semana cumplida. Cada día más, hasta ${N.DIAS_TOPE}, son ${N.PTS_DIA} puntos.`;
    } else {
      consejo = `Semana completa. Lo que entrenes de más suma a tu equipo (hasta ${N.PLUS_TOPE}).`;
    }
  }

  const filas = s ? [
    ["Días activos", `${Math.min(s.dias, N.DIAS_TOPE)} de ${N.DIAS_TOPE}${s.dias > N.DIAS_TOPE
      ? ` (y ${s.dias - N.DIAS_TOPE} más para el equipo)` : ""}`, s.ptsDias],
    [`Semana de ${N.OBJETIVO_DIAS} días`, s.bonus ? "conseguido" : "todavía no", s.bonus],
    ["Volumen", `${Math.floor(s.minutos / 60)} h ${s.minutos % 60} min`, s.volumen],
  ] : [];

  return `
  <div class="card vDorsal">
    <div class="d"><span class="p">${L.empezada ? yo.puesto : ""}</span><span class="n">${esc(yo.nombre)}</span></div>
    <p class="hint" style="margin:6px 0 0">${num(yo.total)} puntos · ${yo.dias} días ·
      ${yo.semanasBonus} semana${yo.semanasBonus === 1 ? "" : "s"} con el +${N.BONUS_SEMANA}</p>
    ${consejo ? `<div class="vGap">${consejo}</div>` : ""}
  </div>

  ${s ? `<h2 class="section">Tu semana</h2>
    <div class="tablabox"><table class="vTabla"><tbody>
      ${filas.map(([t, q, p]) => `<tr><td></td><td><b>${t}</b><span class="sub">${q}</span></td>
        <td class="pts">${p}</td></tr>`).join("")}
      <tr><td></td><td><b>Total</b><span class="sub">máximo ${maxIndividual(N)}</span></td>
        <td class="pts">${s.individual}</td></tr>
      ${s.plus ? `<tr><td></td><td><b>Extra para el equipo</b><span class="sub">lo que pasa de los topes</span></td>
        <td class="pts">+${s.plus}</td></tr>` : ""}
    </tbody></table></div>` : cabecera(L)}

  ${L.empezada ? `<div class="card">
    <h2 class="section" style="margin-top:0">Tus maillots</h2>
    ${L.maillots.map((m) => {
      const pu = m.puesto.get(yo.key);
      const lleva = m.portadorKey === yo.key;
      const estado = lleva ? "lo llevas"
        : !m.portador ? "por estrenar"
        : `lo lleva ${esc(m.portador)}`;
      return `<div class="vClas${lleva ? " lider" : ""}">
        <span class="pu">${pu ? `${pu}º` : "-"}</span>
        <span>${m.que} <span class="dim">· ${valorMaillot(m, yo[m.campo])}</span></span>
        <span class="st">${estado}</span></div>`;
    }).join("")}
  </div>` : ""}

  ${eq ? `<div class="card">
    <h2 class="section" style="margin-top:0">${esc(eq.nombre)}</h2>
    <p class="hint" style="margin:0 0 8px">${L.empezada ? `${eq.puesto}º de ${L.equipos.length} · ` : ""}${num(eq.total)} puntos
      ${L.actual >= 0 ? ` · esta semana ${num(eq.semanaActual)}` : ""}</p>
    ${eq.miembros.map((m) => `<div class="vClas">
      <span></span><span>${esc(m.nombre)}${m.semana ? ` <span class="dim">· ${m.semana.dias} días</span>` : ""}</span>
      <span class="st">${m.semana ? m.semana.paraEquipo : 0}</span></div>`).join("")}
    <p class="hint" style="margin:8px 0 0">Puntos de cada uno esta semana, con su extra.
      El equipo puntúa la suma de todos.</p>
  </div>` : ""}` + marcaStrava();
}

/** Clasificación: por equipos o individual. */
export function vistaClasifLiga(L, modo = "equipos") {
  if (!L) return vacio();
  if (modo === "equipos") return tablaEquipos(L) + marcaStrava();
  const deQuien = {};
  for (const m of L.maillots) if (m.portadorKey) deQuien[m.portadorKey] = m.id;
  const camiseta = (p) => deQuien[p.key]
    ? `<span class="vJersey" style="background:${COLOR[deQuien[p.key]]}"></span>` : "";
  return `<div class="tablabox"><table class="vTabla">
    <thead><tr><th></th><th>Nombre</th><th>Días</th><th>Pts</th></tr></thead>
    <tbody>${L.individual.map((p) => `<tr>
      <td class="pos">${L.empezada ? p.puesto : ""}</td>
      <td>${esc(p.nombre)}${camiseta(p)}${p.equipo ? `<span class="sub">${esc(p.equipo)}</span>` : ""}</td>
      <td>${p.dias}</td><td class="pts">${p.total}</td></tr>`).join("")}</tbody>
  </table></div>` + marcaStrava();
}

/** Normas, pintadas desde los parámetros reales del motor. */
export function vistaNormasLiga(N) {
  const filas = [
    ["Días activos", `${N.PTS_DIA} por día con ${N.MIN_DIA} minutos o más, hasta ${N.DIAS_TOPE} días.
      Varios entrenos el mismo día cuentan como un día.`, N.DIAS_TOPE * N.PTS_DIA],
    ["Semana cumplida", `+${N.BONUS_SEMANA} si la semana tiene ${N.OBJETIVO_DIAS} días o más`, N.BONUS_SEMANA],
    ["Volumen", `1 punto por cada ${N.MIN_POR_PUNTO} minutos de la semana, hasta ${N.VOL_TOPE}
      (${N.VOL_TOPE * N.MIN_POR_PUNTO / 60} horas)`, N.VOL_TOPE],
  ];
  return `
  <h2 class="section" style="margin-top:0">Tu semana</h2>
  <div class="tablabox"><table class="vTabla">
    <thead><tr><th></th><th>Concepto</th><th>Máx</th></tr></thead>
    <tbody>${filas.map(([t, q, max]) => `<tr><td></td>
      <td><b>${t}</b><span class="sub">${q}</span></td><td class="pts">${max}</td></tr>`).join("")}
      <tr><td></td><td><b>Total de una semana</b></td><td class="pts">${maxIndividual(N)}</td></tr>
    </tbody></table></div>

  <h2 class="section">El equipo</h2>
  <div class="card" style="line-height:1.7">Cinco equipos, de cinco a seis. La nota del equipo cada
    semana es la <b>suma de sus miembros</b>: quien no entrena, no suma.
    Lo que pasa de tus topes (los días 6 y 7, y el volumen por encima de
    ${N.VOL_TOPE * N.MIN_POR_PUNTO / 60} horas) no te suma a ti, pero <b>sí a tu equipo</b>,
    hasta ${N.PLUS_TOPE} puntos por persona y semana.</div>

  <h2 class="section">Los maillots</h2>
  <div class="card"><ul style="margin:0;padding-left:18px;line-height:1.8">
    ${L_MAILLOTS.map((m) => `<li><b>${m.nombre}</b> (${m.que.toLowerCase()}): ${m.como}.</li>`).join("")}
  </ul>
  <p class="hint" style="margin:8px 0 0">Como en la Vuelta, nadie lleva dos: si el líder de
    una clasificación ya viste otro maillot, lo lleva el siguiente.</p></div>

  <h2 class="section">Temporada</h2>
  <div class="card"><ul style="margin:0;padding-left:18px;line-height:1.8">
    <li>${N.SEMANAS} semanas, de lunes a domingo. Todos empezamos a cero.</li>
    <li>Empate: gana quien tenga más semanas con el +${N.BONUS_SEMANA}; si sigue, más días activos.</li>
    <li>Solo cuentan los entrenos de Strava <b>conectado a la app</b>.</li>
    <li>Si entras tarde, puntúas desde que entras. Si te das de baja, dejas de sumar a tu equipo.</li>
  </ul></div>`;
}

function vacio() {
  return `<div class="card"><p class="hint" style="margin:0">La liga todavía no tiene datos.
    Aparecerán en cuanto se sincronicen los primeros entrenos.</p></div>`;
}
