// Pantallas de La Vuelta dentro de la PWA. Devuelven HTML; quien las llama decide
// dónde pintarlas. No tocan Supabase: reciben ya el resultado de cargarVuelta().
//
// A diferencia del prototipo, aquí NO hay selector de corredor: la app sabe quién
// eres por el login, así que "Mi carrera" es directamente la tuya.

const r0 = (n) => Math.round(n || 0);
const num = (n) => (n || 0).toLocaleString("es-ES");

const COLOR = { rojo:"#D7263D", montana:"#E8E4DA", verde:"#00A758", fondo:"#F47A20", blanco:"#FFFFFF" };
const TERRENO = { llana:"#7C93B0", montana:"#D7263D", fondo:"#F47A20",
                  triatleta:"#00A758", contrarreloj:"#6E5AA8" };

/** Camiseta de cada clasificación, dibujada (nada de emojis). */
export function maillotSVG(id, alto = 44) {
  const lunares = id === "montana"
    ? `<g fill="#D7263D">${[[22,26],[38,20],[30,38],[44,34],[24,46],[40,50]]
        .map(([x,y]) => `<circle cx="${x}" cy="${y}" r="3.1"/>`).join("")}</g>` : "";
  return `<svg viewBox="0 0 64 64" width="${alto}" height="${alto}" aria-hidden="true">
    <path d="M22 10 L14 15 L8 24 L16 29 L18 24 V54 H46 V24 L48 29 L56 24 L50 15 L42 10
             C40 15 36 17 32 17 C28 17 24 15 22 10 Z"
      fill="${COLOR[id]}" stroke="rgba(0,0,0,.35)" stroke-width="1.1" stroke-linejoin="round"/>
    ${lunares}</svg>`;
}

/** Portada: qué toca esta semana, quién lleva cada maillot y cómo va la etapa. */
/**
 * Atribucion a Strava. Sus brand guidelines la exigen en CADA pantalla donde se
 * muestren sus datos, y todo lo que pinta la Vuelta (puntos, dias, desnivel, tiradas)
 * sale de actividades de Strava. Faltaba en las tres vistas: es motivo de rechazo
 * directo en la revision con la que se pide ampliar el cupo de atletas.
 */
export function marcaStrava() {
  return `<p style="margin:18px 0 0;text-align:center">
    <img src="./img/strava-powered.svg" alt="Powered by Strava"
         style="height:16px;opacity:.75"></p>`;
}

export function vistaVuelta(V, etapaSel) {
  if (!V) return vacio();
  const p = V.proxima;
  const e = V.etapas[etapaSel ?? V.etapas.length - 1];
  const podio = e.marcas.filter((m) => m.total > 0).slice(0, 5);

  return `
  <div class="vBanda" style="--t:${TERRENO[p.terreno]}">
    <div class="vBandaK">Próxima etapa · para ${p.quien}</div>
    <div class="vBandaT">Etapa ${p.numero} · ${p.nombre}</div>
    <div class="vBandaD">${p.desc}</div>
    ${p.especialistas?.length ? `<div class="vBandaE">Las anteriores de este terreno las
      ganaron ${p.especialistas.slice(0,3).join(", ")}.</div>` : ""}
  </div>

  <h2 class="section">Los maillots</h2>
  <div class="vMaillots">
    ${V.maillots.map((m) => `<div class="vMaillot" style="--c:${COLOR[m.id]}">
      ${maillotSVG(m.id, 38)}
      <div><div class="vQue">${m.que}</div>
        <div class="vQuien">${m.portador}</div>
        <div class="vVal">${num(m.valor)} ${m.unidad}</div></div>
    </div>`).join("")}
  </div>

  <h2 class="section">Etapa ${e.numero} · ${e.nombre}</h2>
  <p class="hint" style="margin-top:0">Semana ${e.semana}. ${e.desc}</p>
  <ol class="vPodio">
    ${podio.length ? podio.map((m, i) => `<li>
      <span class="p">${i + 1}</span><span class="n">${m.nombre}</span>
      <span class="t">${r0(m.total)}</span></li>`).join("")
      : `<li class="vacio">Todavía no hay marcas en esta etapa.</li>`}
  </ol>` + marcaStrava();
}

/** Mi carrera: dónde voy en las cinco clasificaciones, mi equipo y mi rival. */
export function vistaMiCarrera(V, miNombre) {
  if (!V) return vacio();
  const f = V.fichas.find((x) => x.nombre === miNombre);
  if (!f) return `<div class="card"><p class="hint" style="margin:0">Todavía no tienes
    actividades en esta Vuelta. En cuanto entrenes y se sincronice, aparecerás aquí.</p></div>`;

  const maxE = Math.max(1, ...f.porEtapa);
  const clas = f.clasificaciones.map((c) => {
    const lider = c.puesto === 1;
    const estado = lider ? "llevas el maillot"
      : c.falta === 0 ? `empatado con ${c.sobre}`
      : `a ${num(c.falta)} de ${c.sobre}`;
    return `<div class="vClas${lider ? " lider" : ""}">
      <span class="pu">${c.puesto}º</span>
      <span>${c.que} <span class="dim">· ${num(c.valor)}</span></span>
      <span class="st">${estado}</span></div>`;
  }).join("");

  return `
  <div class="card vDorsal">
    <div class="d"><span class="p">${f.puesto}</span><span class="n">${f.nombre}</span></div>
    <p class="hint" style="margin:6px 0 0">${num(f.puntos)} puntos · ${f.dias} días ·
      ${num(f.metros)} m+${f.victorias ? ` · ${f.victorias} etapa${f.victorias > 1 ? "s" : ""} ganada${f.victorias > 1 ? "s" : ""}` : ""}</p>
    ${f.deDelante
      ? `<div class="vGap">Tienes a <b>${f.deDelante}</b> a <b>${f.alDeDelante}</b> puntos.
          ${f.alDeDelante <= 6 ? "Eso es una etapa buena." : "Duro, pero quedan etapas."}</div>`
      : `<div class="vGap">Vas <b>líder de la general</b>.</div>`}
    <div class="vMini" role="img" aria-label="Tus puntos etapa a etapa">
      ${f.porEtapa.map((v, i) => `<i style="height:${Math.max(2, (v / maxE) * 40)}px"
        title="Etapa ${i + 1}: ${v} puntos"></i>`).join("")}
    </div>
    <p class="hint" style="margin:6px 0 0;font-size:12px">Etapa a etapa</p>
  </div>

  <div class="card">
    <h2 class="section" style="margin-top:0">Tus cinco carreras</h2>
    ${clas}
  </div>

  ${f.rival ? `<div class="card vRival">
    <div class="k">Tu rival</div>
    <div class="n">${f.rival.nombre}</div>
    <p class="hint" style="margin:6px 0 0">Vais <b>${f.rival.mias}-${f.rival.suyas}</b> en etapas
      ganadas, y <b>${f.rival.ajustadas}</b> se han decidido por 2 puntos o menos.
      Nadie te ha rozado tantas veces.</p></div>` : ""}

  ${f.equipo ? `<div class="card">
    <h2 class="section" style="margin-top:0">Tu equipo</h2>
    <p style="margin:0"><b>${f.equipo.nombre}</b> — ${f.equipo.puesto}º de ${V.equipos.length},
      con ${f.equipo.companeros.join(" y ")}.</p>
    <p class="hint" style="margin:6px 0 0">Tu semana suma a la de ellos. Si faltas, se nota.</p>
  </div>` : ""}` + marcaStrava();
}

/** Clasificación: general y liga de equipos. */
export function vistaClasificacion(V, modo = "general", etapaSel) {
  if (!V) return vacio();
  if (modo === "equipos") {
    const L = V.ligaEquipos;
    const j = L.jornadas[etapaSel ?? L.jornadas.length - 1];
    return `
    <div class="tablabox"><table class="vTabla">
      <thead><tr><th></th><th>Equipo</th><th>G</th><th>E</th><th>P</th><th>Dif</th><th>Pts</th></tr></thead>
      <tbody>${L.clasificacion.map((e, i) => `<tr>
        <td class="pos">${i + 1}</td>
        <td><b>${e.nombre}</b><span class="sub">${e.miembros.join(" · ")}</span></td>
        <td>${e.g}</td><td>${e.e}</td><td>${e.p}</td>
        <td class="dim">${e.dif > 0 ? "+" : ""}${e.dif}</td>
        <td class="pts">${e.pts}</td></tr>`).join("")}</tbody>
    </table></div>
    <h2 class="section">Jornada ${j.etapa}</h2>
    ${j.partidos.map((p) => `<div class="vDuelo">
      <span class="l ${p.gana === p.local ? "g" : ""}">${p.local}</span>
      <span class="res">${p.sa} – ${p.sb}</span>
      <span class="${p.gana === p.visitante ? "g" : ""}">${p.visitante}</span></div>`).join("")}`;
  }
  const lider = V.general[0]?.general || 0;
  const deQuien = {};
  for (const m of V.maillots) deQuien[m.portador] = m.id;
  return `<div class="tablabox"><table class="vTabla">
    <thead><tr><th></th><th>Corredor</th><th>Días</th><th>Dif</th><th>Pts</th></tr></thead>
    <tbody>${V.general.map((a, i) => `<tr>
      <td class="pos">${i + 1}</td>
      <td>${a.nombre}${deQuien[a.nombre]
        ? `<span class="vJersey" style="background:${COLOR[deQuien[a.nombre]]}"></span>` : ""}</td>
      <td>${a.dias}</td>
      <td class="dim">${i === 0 ? "—" : "+" + num(lider - a.general)}</td>
      <td class="pts">${a.general}</td></tr>`).join("")}</tbody>
  </table></div>` + marcaStrava();
}

const DISC_NOMBRE = { c: "correr", b: "bici", n: "nadar", o: "otros" };

/** Reglamento, generado desde los parametros REALES del motor. */
export function vistaReglamento(PILARES, TERRENOS) {
  const P = PILARES;
  const filas = [
    ["Días", `${P.PTS_DIA} por día entrenado, hasta ${P.DIAS_TOPE} días`, P.DIAS_TOPE * P.PTS_DIA],
    ["Premios de semana", `+${P.BONUS_SEMANA} al llegar a ${P.OBJETIVO_DIAS} días · +${P.BONUS_RACHA} más al llegar a ${P.RACHA_DIAS}`,
      P.BONUS_SEMANA + P.BONUS_RACHA],
    ["Horas", `1 punto por cada ${P.HORAS_POR_PUNTO} horas`, P.DED_TOPE],
    ["Desnivel", `1 punto por cada ${P.DESNIVEL_POR_PUNTO} m+ en bici · cada ${
      P.DESNIVEL_POR_PUNTO / P.DESNIVEL_FACTOR_PIE} m+ a pie`, P.DESNIVEL_TOPE],
    ["Tirada larga", `Solo tu sesión más larga, y cada deporte tiene su vara: ${
      ["c", "b", "n"].map((d) => `${DISC_NOMBRE[d]} ${
        P.TIRADA_POR_DISC[d].map(([m, pt]) => `${m}′ +${pt}`).join("/")}`).join(" · ")}`,
      P.TIRADA_POR_DISC.c[P.TIRADA_POR_DISC.c.length - 1][1]],
    ["Variedad", `Dos disciplinas +${P.VARIEDAD[2]}, las tres +${P.VARIEDAD[3]}`, P.VARIEDAD[3]],
  ];
  return `
  <h2 class="section" style="margin-top:0">Cómo se puntúa tu semana</h2>
  <div class="tablabox"><table class="vTabla">
    <thead><tr><th></th><th>Concepto</th><th>Máx</th></tr></thead>
    <tbody>${filas.map(([t, q, max]) => `<tr><td></td>
      <td><b>${t}</b><span class="sub">${q}</span></td><td class="pts">${max}</td></tr>`).join("")}
      <tr><td></td><td><b>Total de una etapa</b></td><td class="pts">${P.MAXIMO}</td></tr>
    </tbody></table></div>

  <h2 class="section">Lo que NO puntúa</h2>
  <div class="card"><ul style="margin:0;padding-left:18px;line-height:1.8">
    <li>Un día de menos de <b>15 minutos</b> y menos de <b>3 km</b>: no cuenta como día.</li>
    <li>El día <b>${P.DIAS_TOPE + 1}º</b> de la semana. Esto premia aparecer, no machacarse.</li>
    <li>Las horas a partir de la <b>${P.HORAS_POR_PUNTO * P.DED_TOPE}ª</b> y el desnivel por encima
      de <b>${(P.DESNIVEL_POR_PUNTO * P.DESNIVEL_TOPE).toLocaleString("es-ES")} m+</b> en bici
      (<b>${(P.DESNIVEL_POR_PUNTO * P.DESNIVEL_TOPE / P.DESNIVEL_FACTOR_PIE).toLocaleString("es-ES")} m+</b> a pie).</li>
    <li>Tu <b>segunda</b> sesión larga: solo cuenta la más larga.</li>
    <li>Las actividades que tengas en <b>privado</b> en Strava. No las vemos, y es a propósito.</li>
  </ul></div>

  <h2 class="section">Por qué cada deporte tiene su vara</h2>
  <div class="card" style="line-height:1.7">Una hora en bici y una hora corriendo no
    cuestan lo mismo, y el desnivel tampoco: sobre los datos del club, en bici se suben
    <b>194 m por hora</b> y corriendo <b>96</b>. Con un único listón para los tres deportes,
    quien montaba en bici sacaba <b>más de 4 puntos por etapa</b> sin entrenar mejor.
    Por eso 90′ corriendo valen lo que 210′ en bici o 45′ nadando: el listón cambia,
    el esfuerzo que pide es el mismo.</div>

  <h2 class="section">El terreno de cada etapa</h2>
  <div class="card">${Object.values(TERRENOS).map((t) => `<div class="vClas">
    <span></span><span><b>${t.nombre}</b> — para ${t.quien}<span class="sub"
      style="display:block;opacity:.7">${t.desc}</span></span><span></span></div>`).join("")}</div>

  <h2 class="section">Por equipos</h2>
  <div class="card"><p style="margin:0">Cada jornada te toca un rival. <b>3 puntos</b> la victoria,
    <b>1</b> el empate si la diferencia es de 2 o menos. La puntuación del equipo es la suma de
    sus tres corredores: si faltas, se nota.</p></div>`;
}

function vacio() {
  return `<div class="card"><p class="hint" style="margin:0">La Vuelta todavía no tiene
    datos. Aparecerán en cuanto se sincronicen los primeros entrenos de la temporada.</p></div>`;
}
