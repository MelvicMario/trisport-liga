// TriSport Liga — lógica de la PWA. Consume web/data/season.json (generado por el motor real).
const KEY = "trisport-liga-state-v1";

let DATA, G;
let live = new Map(); // key -> atleta con cofre vivo
let state = { myKey: null, played: false, log: [] };
let sel = { escudo: false, sprint: false, robo: null, duelo: null };

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const fmt = (n) => Math.round(n).toLocaleString("es-ES");

init();

async function init() {
  DATA = await fetch("data/season.json").then((r) => r.json());
  G = DATA.meta.game;
  resetLive();
  loadState();
  wireNav();
  $("#metaLine").textContent =
    `Datos reales · ${DATA.athletes.length} atletas · ${DATA.meta.temporadaSemanas} semanas · semana jugable ${DATA.meta.currentWeek} · puntuación ${DATA.meta.presetScoring}.`;
  renderRank();
  renderBase();
  $$("#rankSeg button").forEach((b) =>
    b.addEventListener("click", () => {
      $$("#rankSeg button").forEach((x) => x.classList.toggle("active", x === b));
      renderRank(b.dataset.mode);
    })
  );
  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
}

function resetLive() {
  live = new Map();
  for (const a of DATA.athletes) live.set(a.key, { ...a, cofre: a.cofre });
}

function loadState() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && s.myKey) {
      state = s;
      if (s.cofres) for (const [k, v] of Object.entries(s.cofres)) if (live.has(k)) live.get(k).cofre = v;
    }
  } catch {}
}
function saveState() {
  const cofres = {};
  for (const [k, a] of live) cofres[k] = a.cofre;
  localStorage.setItem(KEY, JSON.stringify({ ...state, cofres }));
}

function ranked() {
  return [...live.values()].sort((a, b) => b.cofre - a.cofre);
}
function myPos() {
  return ranked().findIndex((a) => a.key === state.myKey) + 1;
}

// ---------- Navegación ----------
function wireNav() {
  $$("nav.tabs button").forEach((b) =>
    b.addEventListener("click", () => {
      $$("nav.tabs button").forEach((x) => x.classList.toggle("active", x === b));
      $$(".view").forEach((v) => v.classList.remove("active"));
      $(`#view-${b.dataset.view}`).classList.add("active");
    })
  );
}
function goBase() {
  $$("nav.tabs button").forEach((x) => x.classList.toggle("active", x.dataset.view === "base"));
  $$(".view").forEach((v) => v.classList.remove("active"));
  $("#view-base").classList.add("active");
}

// ---------- Clasificación ----------
function rowHTML(a, pos) {
  const cls = pos === 1 ? "top1" : pos === 2 ? "top2" : pos === 3 ? "top3" : "";
  const me = a.key === state.myKey ? " me" : "";
  return `<div class="row${me}">
    <div class="pos ${cls}">${pos}</div>
    <div class="who">
      <div class="nm">${a.name}${a.key === state.myKey ? " ·tú" : ""}</div>
      <div class="sub"><span>📅 ${a.activeDays}d</span><span>🔥 x${a.avgMult}</span>
        <span class="badge b-${a.division}">${a.division}</span></div>
    </div>
    <div class="cofre">${fmt(a.cofre)}<small>puntos</small></div>
  </div>`;
}
function renderRank(mode = "general") {
  const list = $("#rankList");
  if (mode === "div") {
    list.innerHTML = G.DIVISIONES.map((d) => {
      const rows = ranked().filter((a) => a.division === d);
      return `<h2 class="section">${d === "Oro" ? "🥇" : d === "Plata" ? "🥈" : "🥉"} División ${d}</h2>` +
        rows.map((a, i) => rowHTML(a, i + 1)).join("");
    }).join("");
  } else {
    list.innerHTML = `<h2 class="section">Clasificación general</h2>` +
      ranked().map((a, i) => rowHTML(a, i + 1)).join("");
  }
}

// ---------- Mi Base ----------
function renderBase() {
  const c = $("#baseContent");
  if (!state.myKey) {
    const opts = [...DATA.athletes].sort((a, b) => a.name.localeCompare(b.name))
      .map((a) => `<option value="${a.key}">${a.name} · ${a.division}</option>`).join("");
    c.innerHTML = `<h2 class="section">Elige tu atleta</h2>
      <div class="card">
        <p class="hint">Selecciona quién eres en el club para empezar a jugar tu semana.</p>
        <select id="pick">${opts}</select>
        <button class="btn" id="start">Entrar a mi base</button>
      </div>`;
    $("#start").addEventListener("click", () => {
      state.myKey = $("#pick").value;
      state.played = false; state.log = [];
      saveState(); renderBase(); renderRank($("#rankSeg .active").dataset.mode);
    });
    return;
  }

  const me = live.get(state.myKey);
  const energiaUsada = costeSel();
  const energiaLibre = me.semana.energia - energiaUsada;
  const pips = Array.from({ length: G.ENERGIA_MAX_SEMANA }, (_, i) =>
    `<div class="pip ${i < me.semana.energia ? "on" : ""}"></div>`).join("");

  c.innerHTML = `
    <div class="card hero">
      <div style="display:flex;justify-content:space-between;align-items:start">
        <div><div class="nm">${me.name}</div>
          <span class="badge b-${me.division}">División ${me.division}</span></div>
        <div style="text-align:right"><div style="font-size:26px;font-weight:900">#${myPos()}</div>
          <div class="k" style="font-size:10px;color:var(--muted)">posición</div></div>
      </div>
      <div class="stat-grid">
        <div class="stat"><div class="v">${fmt(me.cofre)}</div><div class="k">Cofre</div></div>
        <div class="stat"><div class="v">${me.activeDays}</div><div class="k">Días activos</div></div>
        <div class="stat"><div class="v orange">x${me.avgMult}</div><div class="k">Racha</div></div>
      </div>
    </div>

    <div class="card">
      <h2 class="section" style="margin-top:0">Semana ${DATA.meta.currentWeek}</h2>
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div class="hint">Ganarías <b style="color:#fff">${fmt(me.semana.pl)}</b> pts por entrenar (${me.semana.dias} días)</div>
      </div>
      <div class="energy" title="Energía">${pips}<span class="hint" style="margin-left:6px">${energiaLibre} energía libre</span></div>
      ${state.played ? "" : `<div class="actions" style="margin-top:14px">${actionsHTML(me, energiaLibre)}</div>`}
      ${state.played ? "" : targetsHTML(me)}
      ${state.played
        ? `<button class="btn ghost" id="newWeek">▶ Jugar otra semana</button>`
        : `<button class="btn" id="resolve">Resolver semana</button>`}
    </div>

    ${state.log.length ? `<div class="card"><h2 class="section" style="margin-top:0">Qué pasó</h2><div class="log">${state.log.map(logHTML).join("")}</div></div>` : ""}
    <button class="btn ghost" id="change">Cambiar de atleta</button>
  `;

  if (!state.played) {
    $$(".act").forEach((b) => b.addEventListener("click", () => toggleAct(b.dataset.act)));
    const rs = $("#roboTarget"); if (rs) rs.addEventListener("change", (e) => { sel.robo = e.target.value || null; renderBase(); });
    const ds = $("#dueloTarget"); if (ds) ds.addEventListener("change", (e) => { sel.duelo = e.target.value || null; renderBase(); });
    $("#resolve").addEventListener("click", resolveTurn);
  } else {
    $("#newWeek").addEventListener("click", () => { resetLive(); state.played = false; state.log = []; sel = { escudo: false, sprint: false, robo: null, duelo: null }; saveState(); renderBase(); renderRank($("#rankSeg .active").dataset.mode); });
  }
  $("#change").addEventListener("click", () => { state.myKey = null; state.played = false; state.log = []; sel = { escudo: false, sprint: false, robo: null, duelo: null }; resetLive(); saveState(); renderBase(); renderRank(); });
}

function costeSel() {
  let c = 0;
  if (sel.escudo) c += G.COSTE.escudo;
  if (sel.sprint) c += G.COSTE.sprint;
  if (sel.robo) c += G.COSTE.robo;
  if (sel.duelo) c += G.COSTE.duelo;
  return c;
}
function actionsHTML(me, libre) {
  const a = (id, ico, t, d, cost, on) => {
    const afford = on || libre >= cost;
    return `<button class="act ${on ? "sel" : ""}" data-act="${id}" ${afford ? "" : "disabled"}>
      <div class="ico">${ico}</div><div class="t">${t}</div><div class="d">${d}</div>
      <div class="cost">−${cost} energía</div></button>`;
  };
  return [
    a("escudo", "🛡️", "Escudo", `−${G.ESCUDO_REDUCCION * 100}% al robo recibido`, G.COSTE.escudo, sel.escudo),
    a("sprint", "⚡", "Sprint", `×${G.SPRINT_MULT} tus puntos`, G.COSTE.sprint, sel.sprint),
    a("robo", "🥷", "Robo", `${G.ROBO_PCT * 100}% de un rival`, G.COSTE.robo, sel.robo),
    a("duelo", "⚔️", "Duelo", `reto 1v1`, G.COSTE.duelo, sel.duelo),
  ].join("");
}
function rivalsOf(me) {
  return ranked().filter((a) => a.division === me.division && a.key !== me.key && a.semana.dias > 0);
}
function targetsHTML(me) {
  let h = "";
  const opt = (v, sv) => `<option value="${v.key}" ${sv === v.key ? "selected" : ""}>${v.name} (${fmt(v.semana.pl)} pts sem.)</option>`;
  if (sel.robo) h += `<div style="margin-top:10px"><div class="hint">🥷 ¿A quién robas?</div>
    <select id="roboTarget"><option value="">— elige rival —</option>${rivalsOf(me).map((v) => opt(v, sel.robo)).join("")}</select></div>`;
  if (sel.duelo) h += `<div style="margin-top:10px"><div class="hint">⚔️ ¿A quién retas?</div>
    <select id="dueloTarget"><option value="">— elige rival —</option>${rivalsOf(me).map((v) => opt(v, sel.duelo)).join("")}</select></div>`;
  return h;
}
function toggleAct(id) {
  const me = live.get(state.myKey);
  const libre = me.semana.energia - costeSel();
  if (id === "escudo") sel.escudo = !sel.escudo;
  else if (id === "sprint") sel.sprint = !sel.sprint;
  else if (id === "robo") { sel.robo = sel.robo ? null : "PENDING"; }
  else if (id === "duelo") { sel.duelo = sel.duelo ? null : "PENDING"; }
  // si no hay energía suficiente para activar, revertir
  if (costeSel() > me.semana.energia) {
    if (id === "escudo") sel.escudo = false;
    else if (id === "sprint") sel.sprint = false;
    else if (id === "robo") sel.robo = null;
    else if (id === "duelo") sel.duelo = null;
  }
  renderBase();
}

// ---------- Resolución del turno ----------
function pushLog(type, text) { state.log.push({ type, text }); }
function logHTML(e) {
  const cls = e.type === "good" ? "good" : e.type === "bad" ? "bad" : "info";
  return `<div class="e ${cls}">${e.text}</div>`;
}

function resolveTurn() {
  const me = live.get(state.myKey);
  if ((sel.robo === "PENDING") || (sel.duelo === "PENDING")) {
    alert("Elige a quién robar o retar (o desactiva la acción).");
    return;
  }
  state.log = [];
  const escudos = new Set();
  const plSem = new Map();
  for (const a of live.values()) plSem.set(a.key, a.semana.pl);

  // 1) Todos ingresan su PL de la semana (con mi sprint si procede).
  let miPl = me.semana.pl;
  if (sel.sprint) { miPl *= G.SPRINT_MULT; plSem.set(me.key, miPl); }
  for (const a of live.values()) a.cofre += plSem.get(a.key);
  pushLog(sel.sprint ? "good" : "info",
    `🏃 Ganaste <b>${fmt(plSem.get(me.key))}</b> pts entrenando${sel.sprint ? " (⚡ sprint ×" + G.SPRINT_MULT + ")" : ""}.`);

  // 2) Mi escudo.
  if (sel.escudo) { escudos.add(me.key); pushLog("info", "🛡️ Activaste escudo: te protege esta semana."); }

  // 3) Bots de mi división actúan (vida + algún pique hacia mí).
  const rivals = rivalsOf(me);
  // algunos rivales ponen escudo
  rivals.forEach((r) => { if (Math.random() < 0.35) escudos.add(r.key); });

  // 4) Mi robo.
  if (sel.robo) {
    const t = live.get(sel.robo);
    let botin = Math.min(G.ROBO_PCT * plSem.get(t.key), G.ROBO_TOPE);
    if (escudos.has(t.key)) botin *= 1 - G.ESCUDO_REDUCCION;
    botin = Math.round(botin);
    t.cofre -= botin; me.cofre += botin;
    pushLog("good", `🥷 Robaste <b>${fmt(botin)}</b> pts a ${t.name}${escudos.has(t.key) ? " (tenía escudo 🛡️)" : ""}.`);
  }
  // 5) Mi duelo.
  if (sel.duelo) {
    const t = live.get(sel.duelo);
    const mine = plSem.get(me.key), other = plSem.get(t.key);
    if (mine === other) pushLog("info", `⚔️ Empate en el duelo con ${t.name}.`);
    else if (mine > other) { const p = Math.round(G.DUELO_PCT * other); t.cofre -= p; me.cofre += p; pushLog("good", `⚔️ Ganaste el duelo a ${t.name} (+${fmt(p)} pts).`); }
    else { const p = Math.round(G.DUELO_PCT * mine); me.cofre -= p; t.cofre += p; pushLog("bad", `⚔️ Perdiste el duelo con ${t.name} (−${fmt(p)} pts).`); }
  }

  // 6) Un par de rivales me atacan (pique recibido).
  const atacantes = rivals.filter((r) => Math.random() < 0.4).slice(0, 2);
  for (const r of atacantes) {
    if (Math.random() < 0.5) {
      // robo hacia mí
      let botin = Math.min(G.ROBO_PCT * plSem.get(me.key), G.ROBO_TOPE);
      if (escudos.has(me.key)) botin *= 1 - G.ESCUDO_REDUCCION;
      botin = Math.round(botin);
      if (botin > 0) {
        me.cofre -= botin; r.cofre += botin;
        pushLog(escudos.has(me.key) ? "info" : "bad",
          `😱 ${r.name} te robó <b>${fmt(botin)}</b> pts${escudos.has(me.key) ? " (tu escudo redujo el golpe 🛡️)" : ""}.`);
      }
    } else {
      // duelo hacia mí
      const mine = plSem.get(me.key), other = plSem.get(r.key);
      if (mine > other) { const p = Math.round(G.DUELO_PCT * other); r.cofre -= p; me.cofre += p; pushLog("good", `⚔️ ${r.name} te retó y perdió (+${fmt(p)} pts para ti).`); }
      else if (other > mine) { const p = Math.round(G.DUELO_PCT * mine); me.cofre -= p; r.cofre += p; pushLog("bad", `⚔️ ${r.name} te retó y ganó (−${fmt(p)} pts).`); }
    }
  }

  pushLog("info", `📊 Acabas la semana en la posición <b>#${myPos()}</b>.`);
  state.played = true;
  saveState();
  renderBase();
  renderRank($("#rankSeg .active").dataset.mode);
}
