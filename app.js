// TriSport Liga — app conectada a Supabase (M4.1: login + clasificación y castillo reales).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const fmt = (n) => Math.round(n).toLocaleString("es-ES");

let myAtletaKey = null;
let clasificacion = [];
let eventos = [];
let pendingAction = null; // 'robo' | 'duelo' cuando se está eligiendo objetivo

boot();

async function boot() {
  wireUI();
  const { data: { session } } = await sb.auth.getSession();
  if (session) await afterLogin();
  else showLogin();

  sb.auth.onAuthStateChange((_e, session) => {
    if (session && !myAtletaKey) afterLogin();
    if (!session) showLogin();
  });
}

function wireUI() {
  $("#googleBtn").addEventListener("click", loginGoogle);
  $("#sendLink").addEventListener("click", sendLink);
  $("#email").addEventListener("keydown", (e) => { if (e.key === "Enter") sendLink(); });
  $("#logout").addEventListener("click", async () => { await sb.auth.signOut(); myAtletaKey = null; });
  $$("nav.tabs button").forEach((b) =>
    b.addEventListener("click", () => {
      $$("nav.tabs button").forEach((x) => x.classList.toggle("active", x === b));
      $$(".view").forEach((v) => v.classList.remove("active"));
      $(`#view-${b.dataset.view}`).classList.add("active");
    })
  );
  $$("#rankSeg button").forEach((b) =>
    b.addEventListener("click", () => {
      $$("#rankSeg button").forEach((x) => x.classList.toggle("active", x === b));
      renderRank(b.dataset.mode);
    })
  );
}

// ---------- Login ----------
function showLogin() {
  myAtletaKey = null;
  $("#tabs").style.display = "none";
  $("#logout").style.display = "none";
  $$(".view").forEach((v) => v.classList.remove("active"));
  $("#view-login").classList.add("active");
}

async function loginGoogle() {
  const { error } = await sb.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: location.origin + location.pathname },
  });
  if (error) $("#loginMsg").innerHTML = "⚠️ " + error.message;
}

async function sendLink() {
  const email = $("#email").value.trim();
  const msg = $("#loginMsg");
  if (!email || !email.includes("@")) { msg.textContent = "Escribe un email válido."; return; }
  msg.textContent = "Enviando…";
  const { error } = await sb.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: location.origin + location.pathname },
  });
  msg.innerHTML = error
    ? "⚠️ " + error.message
    : "✅ Revisa tu correo y pulsa el enlace para entrar. Puedes cerrar esta pestaña.";
}

async function afterLogin() {
  // Vincula la cuenta con su atleta (solo si el email está autorizado).
  const { data: aKey, error } = await sb.rpc("vincular_perfil");
  if (error || !aKey || aKey === "no_autorizado") {
    $("#loginMsg").innerHTML = "⛔ Tu email no está autorizado en la liga. Habla con el admin.";
    await sb.auth.signOut();
    return;
  }
  myAtletaKey = aKey;
  await loadData();
  $("#tabs").style.display = "flex";
  $("#logout").style.display = "block";
  $$("nav.tabs button").forEach((x) => x.classList.toggle("active", x.dataset.view === "news"));
  $$(".view").forEach((v) => v.classList.remove("active"));
  $("#view-news").classList.add("active");
}

async function loadData() {
  const [{ data: cl, error }, { data: ev }] = await Promise.all([
    sb.from("clasificacion").select("*"),
    sb.from("eventos").select("*").order("creado_en", { ascending: false }).limit(12),
  ]);
  if (error) { console.error(error); return; }
  clasificacion = (cl || []).sort((a, b) => b.cofre - a.cofre);
  eventos = ev || [];
  renderNoticias();
  renderRank($("#rankSeg .active")?.dataset.mode || "general");
  renderBase();
  $("#metaLine").textContent = `Conectado a la liga · ${clasificacion.length} atletas en la nube.`;
}

function nameOf(key) {
  const a = clasificacion.find((x) => x.atleta_key === key);
  return a ? a.nombre : key;
}
function hace(ts) {
  const s = Math.max(0, (Date.now() - new Date(ts).getTime()) / 1000);
  if (s < 60) return "ahora";
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
  if (s < 86400) return `hace ${Math.floor(s / 3600)} h`;
  return `hace ${Math.floor(s / 86400)} d`;
}
function noticiaTexto(e) {
  const A = nameOf(e.actor), O = e.objetivo ? nameOf(e.objetivo) : "";
  const n = Math.round(e.amount || 0);
  switch (e.tipo) {
    case "robo": return `🥷 <b>${A}</b> robó <b>${n}</b> pts a ${O}`;
    case "fallido": return `🛡️ El escudo de <b>${O}</b> repelió a ${A} — quedó debilitado (−${n})`;
    case "escudo": return `🛡️ <b>${A}</b> reforzó sus defensas`;
    case "sprint": return `⚡ <b>${A}</b> apretó un sprint (+${n})`;
    case "duelo":
      if ((e.msg || "").includes("Ganaste")) return `⚔️ <b>${A}</b> ganó un duelo a ${O} (+${n})`;
      if ((e.msg || "").includes("Perdiste")) return `⚔️ <b>${O}</b> ganó un duelo a ${A} (+${n})`;
      return `⚔️ Duelo entre <b>${A}</b> y ${O}`;
    default: return e.msg || e.tipo;
  }
}
function renderNoticias() {
  const el = $("#newsList");
  if (!eventos.length) {
    el.innerHTML = `<div class="card"><p class="hint">Todavía no hay movimientos en la liga.
      Ve a <b>Mi Castillo</b> y haz el primer ataque ⚔️</p></div>`;
    return;
  }
  el.innerHTML = eventos.map((e) => {
    const mio = e.actor === myAtletaKey || e.objetivo === myAtletaKey;
    return `<div class="row${mio ? " me" : ""}" style="align-items:flex-start">
      <div class="who"><div class="nm" style="font-weight:600;font-size:14px">${noticiaTexto(e)}</div>
        <div class="sub"><span>${hace(e.creado_en)}</span></div></div></div>`;
  }).join("");
}

async function doAccion(tipo, objetivo = null) {
  const { data, error } = await sb.rpc("jugar_accion", { p_tipo: tipo, p_objetivo: objetivo });
  pendingAction = null;
  if (error) { alert("Error: " + error.message); return; }
  if (data && data.ok === false) { alert(data.msg); }
  await loadData();
  if (data && data.ok) flash(data.msg);
}

function flash(msg) {
  const el = $("#flash");
  if (el) { el.textContent = msg; el.style.display = "block"; setTimeout(() => (el.style.display = "none"), 4000); }
}

// ---------- Render ----------
function me() { return clasificacion.find((a) => a.atleta_key === myAtletaKey); }
function myPos() { return clasificacion.findIndex((a) => a.atleta_key === myAtletaKey) + 1; }

function rowHTML(a, pos) {
  const cls = pos === 1 ? "top1" : pos === 2 ? "top2" : pos === 3 ? "top3" : "";
  const mine = a.atleta_key === myAtletaKey ? " me" : "";
  return `<div class="row${mine}">
    <div class="pos ${cls}">${pos}</div>
    <div class="who"><div class="nm">${a.nombre}${a.atleta_key === myAtletaKey ? " ·tú" : ""}</div>
      <div class="sub"><span class="badge b-${a.division}">${a.division}</span></div></div>
    <div class="cofre">${fmt(a.cofre)}<small>puntos</small></div>
  </div>`;
}
function renderRank(mode = "general") {
  const list = $("#rankList");
  if (mode === "div") {
    list.innerHTML = ["Oro", "Plata", "Bronce"].map((d) => {
      const rows = clasificacion.filter((a) => a.division === d);
      return `<h2 class="section">${d === "Oro" ? "🥇" : d === "Plata" ? "🥈" : "🥉"} División ${d}</h2>` +
        rows.map((a, i) => rowHTML(a, i + 1)).join("");
    }).join("");
  } else {
    list.innerHTML = `<h2 class="section">Clasificación general</h2>` +
      clasificacion.map((a, i) => rowHTML(a, i + 1)).join("");
  }
}
const COSTE = { escudo: 2, sprint: 3, robo: 3, duelo: 2 };

function renderBase() {
  const m = me();
  const c = $("#baseContent");
  if (!m) { c.innerHTML = `<div class="card"><p class="hint">No encuentro tu castillo. Avisa al admin.</p></div>`; return; }
  const E = m.energia_semana;
  const cargas = m.defensa_cargas || 0;
  const protegido = cargas > 0;
  const rivals = clasificacion.filter((a) => a.division === m.division && a.atleta_key !== m.atleta_key && a.pl_semana > 0);

  let acciones;
  if (E <= 0) {
    acciones = `<p class="hint">Sin energía esta semana. La energía sale de los días que entrenas.</p>`;
  } else if (pendingAction) {
    const verbo = pendingAction === "robo" ? "robar 🥷" : "retar a duelo ⚔️";
    acciones = `<p class="hint">¿A quién quieres ${verbo}? (rivales de tu división)</p>
      <select id="target"><option value="">— elige rival —</option>
        ${rivals.map((r) => `<option value="${r.atleta_key}">${r.nombre} · ${fmt(r.pl_semana)} pts</option>`).join("")}</select>
      ${pendingAction === "robo" ? '<p class="hint" style="margin-top:8px">⚠️ No sabes si el rival está defendido. Si lo está, tu ataque fallará y quedarás debilitado: es una apuesta.</p>' : ""}
      <div class="actions" style="margin-top:10px">
        <button class="btn" id="confirmAcc">Confirmar</button>
        <button class="btn ghost" id="cancelAcc">Cancelar</button>
      </div>`;
  } else {
    const a = (id, ico, t, cost) =>
      `<button class="act" data-acc="${id}" ${E < cost ? "disabled" : ""}>
        <div class="ico">${ico}</div><div class="t">${t}</div><div class="cost">−${cost} energía</div></button>`;
    acciones = `<div class="actions">
      ${a("escudo", "🛡️", "Escudo", COSTE.escudo)}
      ${a("sprint", "⚡", "Sprint", COSTE.sprint)}
      ${a("robo", "🥷", "Robo", COSTE.robo)}
      ${a("duelo", "⚔️", "Duelo", COSTE.duelo)}
    </div>`;
  }

  c.innerHTML = `
    <div id="flash" style="display:none;background:var(--orange);color:var(--navy);font-weight:800;padding:11px 13px;border-radius:12px;margin-bottom:12px"></div>
    <div class="card hero">
      <div style="display:flex;justify-content:space-between;align-items:start">
        <div><div class="nm">${m.nombre}</div><span class="badge b-${m.division}">División ${m.division}</span>
          ${protegido ? ` <span class="badge" style="background:rgba(54,199,128,.18);color:var(--ok)">🛡️ ${cargas}</span>` : ""}</div>
        <div style="text-align:right"><div style="font-size:26px;font-weight:900">#${myPos()}</div>
          <div class="k" style="font-size:10px;color:var(--muted)">posición</div></div>
      </div>
      <div class="stat-grid">
        <div class="stat"><div class="v">${fmt(m.cofre)}</div><div class="k">Cofre</div></div>
        <div class="stat"><div class="v orange">${E}</div><div class="k">Energía</div></div>
        <div class="stat"><div class="v">${fmt(m.pl_semana)}</div><div class="k">Esta semana</div></div>
      </div>
    </div>
    <div class="card">
      <h2 class="section" style="margin-top:0">Defensa</h2>
      <p class="hint" style="margin-top:0">${protegido
        ? `🛡️ <b style="color:var(--ok)">${cargas} carga${cargas > 1 ? "s" : ""} de defensa</b> — cada robo que recibas se repele y gasta 1 carga (el atacante queda debilitado). Solo tú ves tus cargas.`
        : "⚠️ <b>Sin defensa</b>: eres vulnerable a robos. Refuerza con 🛡️ Escudo."}</p>
    </div>
    <div class="card">
      <h2 class="section" style="margin-top:0">Acciones</h2>
      ${acciones}
    </div>`;

  // listeners
  $$(".act[data-acc]").forEach((b) => b.addEventListener("click", () => onAccion(b.dataset.acc)));
  const conf = $("#confirmAcc"), canc = $("#cancelAcc");
  if (conf) conf.addEventListener("click", () => {
    const t = $("#target").value;
    if (!t) { alert("Elige un rival."); return; }
    doAccion(pendingAction, t);
  });
  if (canc) canc.addEventListener("click", () => { pendingAction = null; renderBase(); });
}

function onAccion(tipo) {
  if (tipo === "escudo" || tipo === "sprint") {
    if (confirm(tipo === "escudo" ? "¿Activar escudo esta semana?" : "¿Usar sprint? Multiplica tus puntos de la semana.")) doAccion(tipo);
  } else {
    pendingAction = tipo;
    renderBase();
  }
}
