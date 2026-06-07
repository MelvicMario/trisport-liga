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
let campanas = [];
let soyAdmin = false;
let pendingAction = null; // 'robo' | 'duelo' cuando se está eligiendo objetivo
let retos = [];
let eligiendoReto = false; // modo "elegir rival para retar" en la card Cara a Cara
let misEntrenos = []; // últimas actividades del atleta actual
let ataquesOn = true; // estado global de ataques (config_juego)
let alianzas = []; // {alianza_id, nombre, emoji}
let rankAlianzas = []; // {alianza_id, nombre, emoji, miembros, puntos} (ya ordenado)
let alianzaDe = {}; // {atleta_key: alianza_id}
let modoAlianzas = false; // config_juego.modo_alianzas
let miDesglose = null; // desglose de puntos de la semana del atleta actual
let adminPanel = null;   // {stats, seguimiento} del RPC admin_panel (solo admin)
let adminActs = null;    // actividades sincronizadas recientes (panel admin)
let adminActFiltro = ""; // texto del buscador de actividades
let adminCargando = false;
let adminTab = "panel";  // pestaña del admin: "panel" (stats) | "config"
const SEASON_START = "2026-06-01"; // inicio de temporada: lo de mayo (aparcado) no se muestra ni cuenta
let adminEventos = null; // registro de acciones (piques/escudos) para el panel admin
let adminDuplicados = null; // duplicados eliminados por el sync (panel admin)

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
  soyAdmin = false;
  const tabAdmin = $("#tabAdmin");
  if (tabAdmin) tabAdmin.style.display = "none";
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
  // Registra la visita (estadísticas de uso). Silencioso si aún no existe la RPC.
  try { await sb.rpc("registrar_visita"); } catch (e) {}

  // ¿Es administrador? Si lo es, mostramos la pestaña Admin.
  try {
    const { data: admin } = await sb.rpc("soy_admin");
    soyAdmin = admin === true;
  } catch (e) { soyAdmin = false; }
  const tabAdmin = $("#tabAdmin");
  if (tabAdmin) tabAdmin.style.display = soyAdmin ? "" : "none";

  await loadData();
  $("#tabs").style.display = "flex";
  $("#logout").style.display = "block";
  $$("nav.tabs button").forEach((x) => x.classList.toggle("active", x.dataset.view === "news"));
  $$(".view").forEach((v) => v.classList.remove("active"));
  $("#view-news").classList.add("active");
}

async function loadData() {
  const [{ data: cl, error }, { data: ev }, { data: camps }, { data: rts },
    { data: ali }, { data: rkAli }, { data: estAli }] = await Promise.all([
    sb.from("clasificacion").select("*"),
    sb.from("eventos").select("*").order("creado_en", { ascending: false }).limit(12),
    sb.from("campanas").select("*"),
    sb.from("retos").select("*"),
    sb.from("alianzas").select("*"),
    sb.from("clasificacion_alianzas").select("*"),
    sb.from("estado_atleta").select("atleta_key,alianza_id,desglose"),
  ]);
  if (error) { console.error(error); return; }
  clasificacion = (cl || []).sort((a, b) => b.cofre - a.cofre);
  eventos = ev || [];
  campanas = camps || [];
  retos = rts || [];
  alianzas = ali || [];
  rankAlianzas = rkAli || [];
  alianzaDe = {};
  (estAli || []).forEach((r) => { alianzaDe[r.atleta_key] = r.alianza_id; });
  miDesglose = (estAli || []).find((r) => r.atleta_key === myAtletaKey)?.desglose || null;

  // Últimos entrenos del atleta actual (por nombre).
  const miNombre = (clasificacion.find((a) => a.atleta_key === myAtletaKey) || {}).nombre;
  if (miNombre) {
    try {
      const { data: acts } = await sb
        .from("actividades")
        .select("deporte,nombre,km,min,elev,capturado_en")
        .eq("atleta_nombre", miNombre)
        .gte("capturado_en", SEASON_START)
        .order("capturado_en", { ascending: false })
        .limit(20);
      // Quita duplicados de la misma sesión (Garmin + Zwift) para la lista.
      const crudas = acts || [];
      const disc = (s) => /swim/i.test(s) ? "nadar" : /ride/i.test(s) ? "bici" : /run/i.test(s) ? "correr" : "otro";
      const dia = (t) => (t.capturado_en || "").slice(0, 10);
      const dd = [];
      for (const x of crudas) {
        const m = Number(x.min) || 0, k = Number(x.km) || 0;
        // Misma sesión por 2 fuentes: una sin km en bici, o km+tiempo casi idénticos.
        const dup = dd.find((b) => {
          if (disc(b.deporte) !== disc(x.deporte) || dia(b) !== dia(x)) return false;
          if ((b.nombre || "") === (x.nombre || "")) return false; // mismo nombre = misma fuente
          const bm = Number(b.min) || 0, bk = Number(b.km) || 0;
          const unoSinKm = (k === 0) !== (bk === 0);
          if (unoSinKm && disc(x.deporte) === "bici" && Math.abs(bm - m) <= 10) return true;
          if (k > 0 && bk > 0 && Math.abs(bk - k) <= 0.05 * Math.max(k, bk) && Math.abs(bm - m) <= 3) return true;
          return false;
        });
        if (dup) {
          // conservar la de más esfuerzo (más km)
          if ((Number(x.km) || 0) > (Number(dup.km) || 0)) Object.assign(dup, x);
        } else dd.push(x);
      }
      misEntrenos = dd.slice(0, 5);
    } catch (e) { misEntrenos = []; }
  } else {
    misEntrenos = [];
  }

  // Estado global de ataques (solo relevante para admin).
  try {
    const { data: cfg } = await sb.from("config_juego").select("ataques_habilitados,modo_alianzas").eq("id", 1);
    const fila = cfg && cfg[0];
    ataquesOn = fila ? fila.ataques_habilitados !== false : true;
    modoAlianzas = fila ? fila.modo_alianzas === true : false;
  } catch (e) { ataquesOn = true; modoAlianzas = false; }

  renderNoticias();
  renderRank($("#rankSeg .active")?.dataset.mode || "general");
  renderBase();
  renderBanner();
  renderAdmin();
  $("#metaLine").textContent = `Conectado a la liga · ${clasificacion.length} atletas en la nube.`;
}

// ---------- Campañas ----------
function campanaActiva() {
  const now = Date.now();
  return campanas.find((c) => {
    const ini = c.inicio ? new Date(c.inicio).getTime() : -Infinity;
    const fin = c.fin ? new Date(c.fin).getTime() : Infinity;
    return now >= ini && now <= fin;
  }) || null;
}

function fechaCorta(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  return String(d.getDate()).padStart(2, "0") + "/" + String(d.getMonth() + 1).padStart(2, "0");
}

function renderBanner() {
  const el = $("#campaignBanner");
  if (!el) return;
  const c = campanaActiva();
  if (!c) { el.innerHTML = ""; return; }
  const tregua = c.bloquea_ataques
    ? `<div style="margin-top:8px;font-weight:800">🕊️ Tregua: ataques bloqueados</div>` : "";
  el.innerHTML = `
    <div class="card hero" style="margin-bottom:14px;border:1px solid var(--orange)">
      <div class="nm" style="font-size:18px">${c.emoji || "📣"} ${c.titulo || "Campaña"}</div>
      ${c.descripcion ? `<p class="hint" style="margin:6px 0 0">${c.descripcion}</p>` : ""}
      <div class="badge" style="margin-top:10px;background:var(--orange);color:var(--navy)">hasta ${fechaCorta(c.fin)}</div>
      ${tregua}
    </div>`;
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
    case "reto": return `🤺 ${e.msg || "Cara a Cara"}`;
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
  if (mode === "alianzas") {
    if (!rankAlianzas.length) {
      list.innerHTML = `<h2 class="section">🤝 Alianzas</h2>` +
        `<div class="card"><p class="hint">Todavía no hay alianzas en la liga.</p></div>`;
      return;
    }
    list.innerHTML = `<h2 class="section">🤝 Alianzas</h2>` +
      rankAlianzas.map((a, i) => {
        const pos = i + 1;
        const cls = pos === 1 ? "top1" : pos === 2 ? "top2" : pos === 3 ? "top3" : "";
        return `<div class="row">
          <div class="pos ${cls}">${pos}</div>
          <div class="who"><div class="nm">${a.emoji || "🤝"} ${a.nombre}</div>
            <div class="sub"><span>${fmt(a.miembros || 0)} miembro${(a.miembros || 0) === 1 ? "" : "s"}</span></div></div>
          <div class="cofre">${fmt(a.puntos || 0)}<small>puntos</small></div>
        </div>`;
      }).join("");
  } else if (mode === "div") {
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

// ---------- Cara a Cara (retos 1v1) ----------
async function enviarReto(retado, apuesta) {
  const { data, error } = await sb.rpc("retar", { p_retado: retado, p_apuesta: apuesta });
  if (error) { alert("Error: " + error.message); return; }
  if (data && data.ok === false) { alert(data.msg); return; }
  eligiendoReto = false;
  await loadData();
  if (data && data.msg) flash(data.msg);
}

async function responderReto(id, acepta) {
  const { data, error } = await sb.rpc("responder_reto", { p_id: id, p_acepta: acepta });
  if (error) { alert("Error: " + error.message); return; }
  if (data && data.ok === false) { alert(data.msg); return; }
  await loadData();
  if (data && data.msg) flash(data.msg);
}

function caraACaraHTML(m) {
  const now = Date.now();
  const mios = retos.filter((r) => r.retador === myAtletaKey || r.retado === myAtletaKey);
  const recibidos = mios.filter((r) => r.retado === myAtletaKey && r.estado === "pendiente");
  const enviados = mios.filter((r) => r.retador === myAtletaKey && r.estado === "pendiente");
  const activo = mios.find((r) => r.estado === "aceptado" && r.fin && new Date(r.fin).getTime() > now);

  let body = "";

  // Reto activo
  if (activo) {
    const soyRetador = activo.retador === myAtletaKey;
    const rival = soyRetador ? activo.retado : activo.retador;
    const miMarcador = Math.round((soyRetador ? activo.marcador_retador : activo.marcador_retado) || 0);
    const suMarcador = Math.round((soyRetador ? activo.marcador_retado : activo.marcador_retador) || 0);
    body += `<div class="card" style="margin:0 0 12px;border:1px solid var(--orange)">
      <div class="nm" style="font-size:16px">⚔️ Cara a Cara vs ${nameOf(rival)}</div>
      <div class="stat-grid" style="margin-top:10px">
        <div class="stat"><div class="v orange">${fmt(miMarcador)}</div><div class="k">Tú</div></div>
        <div class="stat"><div class="v">${fmt(suMarcador)}</div><div class="k">${nameOf(rival)}</div></div>
      </div>
      <p class="hint" style="margin:10px 0 0">Apuesta ${Math.round(activo.apuesta || 0)} pts · termina ${fechaCorta(activo.fin)}</p>
    </div>`;
  }

  // Retos recibidos pendientes
  recibidos.forEach((r) => {
    body += `<div class="row" style="align-items:center">
      <div class="who"><div class="nm">${nameOf(r.retador)} te reta</div>
        <div class="sub"><span>apuesta ${Math.round(r.apuesta || 0)} pts</span></div></div>
      <div class="actions" style="margin:0">
        <button class="btn" data-acc-reto="${r.id}" style="width:auto;margin:0;padding:8px 12px">Aceptar</button>
        <button class="btn ghost" data-rej-reto="${r.id}" style="width:auto;margin:0;padding:8px 12px">Rechazar</button>
      </div>
    </div>`;
  });

  // Enviados pendientes
  enviados.forEach((r) => {
    body += `<p class="hint" style="margin:8px 0 0">⏳ Esperando que <b>${nameOf(r.retado)}</b> acepte (apuesta ${Math.round(r.apuesta || 0)} pts).</p>`;
  });

  // Selector para retar
  if (eligiendoReto) {
    const rivals = clasificacion.filter((a) => a.atleta_key !== myAtletaKey);
    const inputStyle = "width:100%;padding:11px;border-radius:12px;font-size:15px;background:var(--navy-2);color:#fff;border:1px solid rgba(255,255,255,.14);margin:6px 0";
    body += `<div style="margin-top:12px">
      <p class="hint" style="margin:0">¿A quién quieres retar?</p>
      <select id="retoTarget" style="${inputStyle}">
        <option value="">— elige rival —</option>
        ${rivals.map((r) => `<option value="${r.atleta_key}">${r.nombre}</option>`).join("")}
      </select>
      <p class="hint" style="margin:0">Apuesta (10-100)</p>
      <input id="retoApuesta" type="number" min="10" max="100" value="50" style="${inputStyle}" />
      <div class="actions" style="margin-top:6px">
        <button class="btn" id="confirmReto">Enviar reto</button>
        <button class="btn ghost" id="cancelReto">Cancelar</button>
      </div>
    </div>`;
  } else if (!activo) {
    body += `<div class="actions" style="margin-top:12px">
      <button class="btn" id="abrirReto">Retar a alguien</button>
    </div>`;
  }

  if (!body) {
    body = `<p class="hint">Nadie te ha retado todavía. ¡Lánzate y reta a un rival cara a cara! ⚔️</p>`;
  }

  return `<div class="card">
    <h2 class="section" style="margin-top:0">⚔️ Cara a Cara</h2>
    ${body}
  </div>`;
}

function wireCaraACara() {
  $("#abrirReto")?.addEventListener("click", () => { eligiendoReto = true; renderBase(); });
  $("#cancelReto")?.addEventListener("click", () => { eligiendoReto = false; renderBase(); });
  $("#confirmReto")?.addEventListener("click", () => {
    const sel = $("#retoTarget").value;
    if (!sel) { alert("Elige un rival."); return; }
    let n = Number($("#retoApuesta").value);
    if (!n || n < 10) n = 10;
    if (n > 100) n = 100;
    enviarReto(sel, n);
  });
  $$("button[data-acc-reto]").forEach((b) =>
    b.addEventListener("click", () => responderReto(b.dataset.accReto, true)));
  $$("button[data-rej-reto]").forEach((b) =>
    b.addEventListener("click", () => responderReto(b.dataset.rejReto, false)));
}

function emojiDeporte(d) {
  switch (d) {
    case "Ride": case "VirtualRide": return "🚴";
    case "Run": case "VirtualRun": return "🏃";
    case "Swim": return "🏊";
    case "WeightTraining": case "Workout": return "💪";
    case "Walk": case "Hike": return "🚶";
    default: return "⭐";
  }
}

function desgloseHTML() {
  const d = miDesglose;
  if (!d) return "";
  const fila = (etq, val, signo) => (val ? `<div class="sub" style="justify-content:space-between;display:flex">
    <span>${etq}</span><span style="color:var(--orange-2);font-weight:700">${signo || "+"}${val}</span></div>` : "");
  // Partimos la base para que se VEA cómo se suma: días×12 + (volumen + racha).
  const base = Math.round(d.base);
  const baseDias = (d.dias || 0) * 12;
  const extraVolRacha = base - baseDias;
  return `<div class="card">
    <h2 class="section" style="margin-top:0">📊 Cómo vas sumando esta semana</h2>
    <div class="sub" style="justify-content:space-between;display:flex"><span>🗓️ ${d.dias} día(s) × 12 (por entrenar)</span><span style="color:var(--orange-2);font-weight:700">+${baseDias}</span></div>
    ${extraVolRacha ? `<div class="sub" style="justify-content:space-between;display:flex"><span>💪 Volumen + racha (duración/días seguidos)</span><span style="color:var(--orange-2);font-weight:700">+${extraVolRacha}</span></div>` : ""}
    ${fila("🔀 Variedad (2+ deportes)", d.variedad)}
    ${fila("🏆 Semana cumplida (3+ días)", d.semana)}
    ${fila("👥 Salida de club", d.grupo)}
    <div class="sub" style="justify-content:space-between;display:flex;border-top:1px solid rgba(255,255,255,.12);margin-top:8px;padding-top:8px">
      <span style="font-weight:800">Total semana</span><span style="font-weight:900;font-size:16px">${Math.round(d.total)}</span></div>
    ${(!d.variedad || !d.grupo || !d.semana) ? `<p class="hint" style="margin:8px 0 0">💡 Te falta sumar: ${[
        !d.variedad ? "entrena <b>2+ deportes</b> (+4)" : null,
        !d.grupo ? "haz una <b>salida de club</b> (+4)" : null,
        !d.semana ? "completa <b>3 días</b> esta semana (+5)" : null,
      ].filter(Boolean).join(" · ")}.</p>` : ""}
    <p class="hint" style="margin:8px 0 0">Tu cofre suma esto cada semana, más/menos lo de los piques (robos/duelos).</p>
  </div>`;
}

function entrenosHTML() {
  let body;
  if (!misEntrenos.length) {
    body = `<p class="hint">Aún no hay entrenos registrados.</p>`;
  } else {
    const filas = misEntrenos.map((e) => {
      const min = Number(e.min) || 0;
      const km = Number(e.km) || 0;
      const valida = (min >= 15 || km >= 3);
      const puntos = valida ? Math.round(12 + Math.min(min / 40, 1) * 4) : 0;
      const titulo = e.nombre || e.deporte || "Entreno";
      const partes = [];
      if (km > 0) partes.push(`${fmt(km)} km`);
      if (min > 0) partes.push(`${fmt(min)} min`);
      const detalle = partes.join(" · ");
      return `<div class="row">
        <div class="who"><div class="nm">${emojiDeporte(e.deporte)} ${titulo}</div>
          <div class="sub"><span>${fechaCorta(e.capturado_en)}${detalle ? " · " + detalle : ""}</span></div></div>
        <div class="cofre">≈ ${puntos}<small>pts</small></div>
      </div>`;
    }).join("");
    body = filas + `<p class="hint" style="margin:10px 0 0">Aprox. por entreno. Los bonus de racha,
      variedad y semana cumplida se suman aparte (mira Cómo se juega).</p>`;
  }
  return `<div class="card">
    <h2 class="section" style="margin-top:0">🏃 Tus últimos entrenos</h2>
    ${body}
  </div>`;
}

function aliDe(key) {
  const id = alianzaDe[key];
  if (!id) return null;
  return alianzas.find((a) => a.alianza_id === id) || null;
}

function miAlianzaHTML() {
  const a = aliDe(myAtletaKey);
  if (!a) return "";
  return ` <span class="badge" style="background:var(--orange);color:var(--navy)">🤝 ${a.emoji || ""} ${a.nombre}</span>`;
}

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
    // Robo y duelo solo si los ataques están habilitados en la liga.
    const ofensivas = ataquesOn
      ? `${a("robo", "🥷", "Robo", COSTE.robo)}
      ${a("duelo", "⚔️", "Duelo", COSTE.duelo)}`
      : "";
    const treguaMsg = ataquesOn
      ? ""
      : `<p class="hint" style="margin-top:10px">🕊️ <b>Ataques bloqueados</b> en la liga: robos y duelos están desactivados. Refuerza tu castillo con 🛡️ Escudo y ⚡ Sprint.</p>`;
    acciones = `<div class="actions">
      ${a("escudo", "🛡️", "Escudo", COSTE.escudo)}
      ${a("sprint", "⚡", "Sprint", COSTE.sprint)}
      ${ofensivas}
    </div>${treguaMsg}`;
  }

  c.innerHTML = `
    <div id="flash" style="display:none;background:var(--orange);color:var(--navy);font-weight:800;padding:11px 13px;border-radius:12px;margin-bottom:12px"></div>
    <div class="card hero">
      <div style="display:flex;justify-content:space-between;align-items:start">
        <div><div class="nm">${m.nombre}</div><span class="badge b-${m.division}">División ${m.division}</span>
          ${protegido ? ` <span class="badge" style="background:rgba(54,199,128,.18);color:var(--ok)">🛡️ ${cargas}</span>` : ""}
          ${miAlianzaHTML()}</div>
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
    </div>
    ${caraACaraHTML(m)}
    ${desgloseHTML()}
    ${entrenosHTML()}`;

  // listeners
  $$(".act[data-acc]").forEach((b) => b.addEventListener("click", () => onAccion(b.dataset.acc)));
  wireCaraACara();
  const conf = $("#confirmAcc"), canc = $("#cancelAcc");
  if (conf) conf.addEventListener("click", () => {
    const t = $("#target").value;
    if (!t) { alert("Elige un rival."); return; }
    doAccion(pendingAction, t);
  });
  if (canc) canc.addEventListener("click", () => { pendingAction = null; renderBase(); });
}

function onAccion(tipo) {
  if ((tipo === "robo" || tipo === "duelo") && !ataquesOn) {
    alert("Los ataques están bloqueados en la liga ahora mismo.");
    return;
  }
  if (tipo === "escudo" || tipo === "sprint") {
    if (confirm(tipo === "escudo" ? "¿Activar escudo esta semana?" : "¿Usar sprint? Multiplica tus puntos de la semana.")) doAccion(tipo);
  } else {
    pendingAction = tipo;
    renderBase();
  }
}

// ---------- Admin ----------
function renderAdmin() {
  const c = $("#adminContent");
  if (!c) return;
  if (!soyAdmin) { c.innerHTML = ""; return; }

  // Carga perezosa de las estadísticas/seguimiento + actividades (una vez).
  if (adminPanel === null && !adminCargando) { adminCargando = true; loadAdminPanel(); }

  const inputStyle = "width:100%;padding:11px;border-radius:12px;font-size:15px;background:var(--navy-2);color:#fff;border:1px solid rgba(255,255,255,.14);margin:6px 0 12px";

  // Campañas activas y futuras (las que aún no han terminado).
  const now = Date.now();
  const vigentes = campanas
    .filter((x) => !x.fin || new Date(x.fin).getTime() >= now)
    .sort((a, b) => new Date(a.inicio || 0) - new Date(b.inicio || 0));

  const lista = vigentes.length
    ? vigentes.map((x) => {
        const activa = (() => {
          const ini = x.inicio ? new Date(x.inicio).getTime() : -Infinity;
          const fin = x.fin ? new Date(x.fin).getTime() : Infinity;
          return now >= ini && now <= fin;
        })();
        const bonusSem = x.bonus_semana_cumplida
          ? ` · 🏆 semana x${x.bonus_semana_cumplida}` : "";
        return `<div class="row">
          <div class="who"><div class="nm">${x.emoji || "📣"} ${x.titulo || "Campaña"}</div>
            <div class="sub"><span>${activa ? "🟢 activa" : "🕒 futura"} · hasta ${fechaCorta(x.fin)}${bonusSem}</span></div></div>
          <button class="btn ghost" data-end="${x.id}" style="width:auto;margin:0;padding:8px 12px">Terminar</button>
        </div>`;
      }).join("")
    : `<p class="hint">No hay campañas activas ni programadas.</p>`;

  const seg = `<div class="seg" id="admSeg" style="margin-bottom:12px">
      <button data-atab="panel"${adminTab === "panel" ? ' class="active"' : ""}>📊 Panel</button>
      <button data-atab="config"${adminTab === "config" ? ' class="active"' : ""}>⚙️ Configuración</button>
    </div>`;

  const panelHTML = `${adminStatsHTML()}${adminLogHTML()}${adminDupHTML()}${adminActsHTML(inputStyle)}`;

  const configHTML = `
    <div class="card">
      <h2 class="section" style="margin-top:0">Lanzar campaña</h2>
      <label class="hint">Título</label>
      <input id="adm-titulo" type="text" placeholder="Reto de la semana" style="${inputStyle}" />
      <label class="hint">Emoji</label>
      <input id="adm-emoji" type="text" maxlength="4" placeholder="🔥" style="${inputStyle}" />
      <label class="hint">Descripción</label>
      <textarea id="adm-desc" rows="2" placeholder="De qué va la campaña…" style="${inputStyle}"></textarea>
      <label class="hint">Duración (días)</label>
      <input id="adm-dias" type="number" min="1" value="7" style="${inputStyle}" />
      <label class="row" style="gap:8px;margin:0 0 12px">
        <input id="adm-bloquea" type="checkbox" style="width:auto;margin:0" />
        <span>Bloquear ataques (tregua)</span>
      </label>
      <label class="hint">Deporte con bonus</label>
      <select id="adm-deporte" style="${inputStyle}">
        <option value="">— ninguno —</option>
        <option value="Ride">Ride</option>
        <option value="Run">Run</option>
        <option value="Swim">Swim</option>
      </select>
      <label class="hint">Factor</label>
      <input id="adm-factor" type="number" step="0.1" min="1" value="2" style="${inputStyle}" />
      <label class="hint">Bonus semana cumplida (opcional)</label>
      <input id="adm-bonussem" type="number" min="1" placeholder="p. ej. 30" style="${inputStyle}" />
      <button class="btn" id="adm-lanzar">Lanzar campaña</button>
    </div>
    <div class="card">
      <h2 class="section" style="margin-top:0">Campañas activas y programadas</h2>
      ${lista}
    </div>
    <div class="card">
      <h2 class="section" style="margin-top:0">⚔️ Ataques</h2>
      <p class="hint" style="margin-top:0">${ataquesOn
        ? "🟢 Ataques <b>HABILITADOS</b> — los jugadores pueden robar y retar a duelo."
        : "🔴 Ataques <b>BLOQUEADOS</b> — robos y duelos desactivados para toda la liga."}</p>
      <button class="btn${ataquesOn ? " ghost" : ""}" id="adm-ataques">
        ${ataquesOn ? "Bloquear ataques" : "Habilitar ataques"}
      </button>
    </div>
    ${alianzasAdminHTML(inputStyle)}`;

  c.innerHTML = seg + (adminTab === "panel" ? panelHTML : configHTML);

  $$("#admSeg button").forEach((b) =>
    b.addEventListener("click", () => { adminTab = b.dataset.atab; renderAdmin(); }));
  $("#adm-lanzar")?.addEventListener("click", lanzarCampana);
  $$("button[data-end]").forEach((b) =>
    b.addEventListener("click", () => terminarCampana(b.dataset.end)));
  $("#adm-ataques")?.addEventListener("click", toggleAtaques);
  $("#adm-refresh")?.addEventListener("click", () => {
    adminPanel = null; adminActs = null; adminEventos = null; adminDuplicados = null; adminCargando = true; loadAdminPanel();
  });
  const buscador = $("#adm-act-buscar");
  if (buscador) buscador.addEventListener("input", (e) => {
    adminActFiltro = e.target.value;
    const f = adminActFiltro.trim().toLowerCase();
    let visibles = 0;
    $$(".act-row").forEach((row) => {
      const ok = !f || (row.dataset.s || "").includes(f);
      row.style.display = ok ? "" : "none";
      if (ok) visibles++;
    });
    const cont = $("#adm-act-count");
    if (cont) cont.textContent = visibles;
  });
  wireAlianzasAdmin();
}

// Carga estadísticas + seguimiento (RPC admin) y las últimas actividades sincronizadas.
async function loadAdminPanel() {
  try {
    const { data } = await sb.rpc("admin_panel");
    adminPanel = data && data.ok ? data : { stats: {}, seguimiento: [] };
  } catch (e) { adminPanel = { stats: {}, seguimiento: [] }; }
  try {
    const { data } = await sb.from("actividades")
      .select("atleta_nombre,deporte,nombre,km,min,elev,capturado_en")
      .gte("capturado_en", SEASON_START)
      .order("capturado_en", { ascending: false }).limit(500);
    adminActs = data || [];
  } catch (e) { adminActs = []; }
  try {
    const { data } = await sb.from("eventos").select("*")
      .order("creado_en", { ascending: false }).limit(100);
    adminEventos = data || [];
  } catch (e) { adminEventos = []; }
  try {
    const { data } = await sb.from("duplicados").select("*")
      .order("detectado_en", { ascending: false }).limit(100);
    adminDuplicados = data || [];
  } catch (e) { adminDuplicados = []; }
  adminCargando = false;
  renderAdmin();
}

function adminDupHTML() {
  if (adminDuplicados === null) return "";
  const ico = { bici: "🚴", carrera: "🏃", natacion: "🏊" };
  const rows = adminDuplicados.length ? adminDuplicados.map((d) => `<div class="row" style="align-items:flex-start">
      <div class="who"><div class="nm">${ico[d.disc] || "•"} ${d.atleta_nombre} · ${fechaCorta(d.dia)}</div>
        <div class="sub"><span>✅ queda: "${d.keep_titulo}" ${fmt(d.keep_km)}km/${fmt(d.keep_min)}min<br>
        🗑️ quitado: "${d.drop_titulo}" ${fmt(d.drop_km)}km/${fmt(d.drop_min)}min</span></div></div>
    </div>`).join("") : `<p class="hint">No se ha eliminado ningún duplicado todavía (se registran a partir de ahora).</p>`;
  return `<div class="card">
    <h2 class="section" style="margin-top:0">🔁 Duplicados eliminados (${adminDuplicados.length})</h2>
    ${rows}
    <p class="hint" style="margin:8px 0 0">Cuando una misma sesión se sube por 2 fuentes (p. ej. Garmin + Zwift), el sync deja la de más esfuerzo y descarta la otra.</p>
  </div>`;
}

function adminLogHTML() {
  if (adminEventos === null) return "";
  const ico = { escudo: "🛡️", sprint: "⚡", robo: "🥷", duelo: "⚔️", fallido: "🛡️", reto: "🤝" };
  const rows = adminEventos.length ? adminEventos.map((e) => `<div class="row">
      <div class="who"><div class="nm">${ico[e.tipo] || "•"} ${noticiaTexto(e)}</div>
        <div class="sub"><span>${hace(e.creado_en)}${e.amount ? " · " + fmt(e.amount) + " pts" : ""}</span></div></div>
    </div>`).join("") : `<p class="hint">Sin acciones registradas todavía.</p>`;
  return `<div class="card">
    <h2 class="section" style="margin-top:0">📜 Registro de acciones (${adminEventos.length})</h2>
    ${rows}
    <p class="hint" style="margin:8px 0 0">Últimos 100 movimientos: escudos, sprints, robos y duelos de toda la liga.</p>
  </div>`;
}

function adminStatsHTML() {
  if (adminPanel === null) return `<div class="card"><p class="hint">Cargando estadísticas…</p></div>`;
  const s = adminPanel.stats || {};
  const seg = adminPanel.seguimiento || [];
  const stat = (v, k) => `<div class="stat"><div class="v">${v ?? 0}</div><div class="k">${k}</div></div>`;
  const estado = (r) => r.entrado ? "🟢 dentro" : (r.autorizado ? "🟡 invitado" : "⚪ no socio");
  const segRows = seg.length ? seg.map((r) => `<div class="row">
      <div class="who"><div class="nm">${r.nombre}</div>
        <div class="sub"><span>${estado(r)} · ${fmt(r.puntos)} pts · sem ${fmt(r.pl_semana)}${r.visitas ? " · 👁️ " + r.visitas : ""}${r.ultima_visita ? " · " + hace(r.ultima_visita) : ""}</span></div></div>
    </div>`).join("") : `<p class="hint">Sin datos.</p>`;
  // Indicador de sincronización de Strava: verde si el último recálculo es reciente.
  const rec = s.ultimo_recalculo ? new Date(s.ultimo_recalculo) : null;
  const minsRec = rec ? Math.round((Date.now() - rec.getTime()) / 60000) : null;
  const syncOk = minsRec != null && minsRec <= 130; // cron horario; margen 2h+
  const syncColor = syncOk ? "var(--ok)" : "var(--orange)";
  const syncTxt = rec ? hace(s.ultimo_recalculo) : "—";
  return `<div class="card">
    <div style="display:flex;align-items:center;gap:10px">
      <span style="width:12px;height:12px;border-radius:50%;background:${syncColor};box-shadow:0 0 8px ${syncColor};flex:0 0 auto"></span>
      <div style="flex:1">
        <div style="font-weight:800">Strava ${syncOk ? "sincronizado ✅" : "sin sincronizar hace rato ⚠️"}</div>
        <div class="hint">Último recálculo OK: <b>${syncTxt}</b>${minsRec != null ? ` (${minsRec} min)` : ""}</div>
      </div>
    </div>
  </div>
  <div class="card">
    <h2 class="section" style="margin-top:0">📊 Estadísticas</h2>
    <div class="stat-grid">
      ${stat(s.entrados, "Han entrado")}
      ${stat(s.activos_hoy, "Activos hoy")}
      ${stat(s.visitas_total, "Visitas tot.")}
    </div>
    <div class="stat-grid" style="margin-top:8px">
      ${stat(s.autorizados, "Autorizados")}
      ${stat(s.activos_semana, "Activos sem.")}
      ${stat(s.atletas, "Atletas")}
    </div>
    <div class="stat-grid" style="margin-top:8px">
      ${stat(s.actividades, "Actividades")}
      ${stat(s.act_semana, "Act. sem.")}
      ${stat(seg.filter((r) => r.autorizado && !r.entrado).length, "Sin entrar")}
    </div>
    <button class="btn ghost" id="adm-refresh" style="margin-top:10px">↻ Actualizar</button>
  </div>
  <div class="card">
    <h2 class="section" style="margin-top:0">👤 Seguimiento de socios (${seg.length})</h2>
    ${segRows}
  </div>`;
}

function adminActsHTML(inputStyle) {
  if (adminActs === null) return "";
  const rows = adminActs.map((a) => {
    const km = Number(a.km) || 0, min = Number(a.min) || 0;
    const det = [km > 0 ? `${fmt(km)} km` : null, min > 0 ? `${fmt(min)} min` : null].filter(Boolean).join(" · ");
    const s = `${a.atleta_nombre || ""} ${a.nombre || ""} ${a.deporte || ""}`.toLowerCase();
    return `<div class="row act-row" data-s="${s.replace(/"/g, "")}">
      <div class="who"><div class="nm">${emojiDeporte(a.deporte)} ${a.atleta_nombre || "—"}</div>
        <div class="sub"><span>${a.nombre || a.deporte || "Entreno"}${det ? " · " + det : ""}</span></div></div>
      <div class="cofre"><small>${fechaCorta(a.capturado_en)}</small></div>
    </div>`;
  }).join("");
  return `<div class="card">
    <h2 class="section" style="margin-top:0">🗂️ Actividades sincronizadas (<span id="adm-act-count">${adminActs.length}</span>)</h2>
    <input id="adm-act-buscar" type="text" placeholder="Buscar atleta / deporte…" value="${adminActFiltro}" style="${inputStyle}" />
    ${rows || `<p class="hint">Sin actividades.</p>`}
    <p class="hint" style="margin:8px 0 0">Se muestran las últimas 500 sincronizadas (más recientes primero).</p>
  </div>`;
}

function alianzasAdminHTML(inputStyle) {
  // Lista de alianzas con sus miembros.
  const listaAli = alianzas.length
    ? alianzas.map((a) => {
        const miembros = clasificacion
          .filter((at) => alianzaDe[at.atleta_key] === a.alianza_id)
          .map((at) => at.nombre);
        return `<div class="row">
          <div class="who"><div class="nm">${a.emoji || "🤝"} ${a.nombre}</div>
            <div class="sub"><span>${miembros.length ? miembros.join(", ") : "sin miembros"}</span></div></div>
        </div>`;
      }).join("")
    : `<p class="hint">No hay alianzas creadas todavía.</p>`;

  // Selectores para asignar un atleta a una alianza (o sacarlo).
  const optAtletas = clasificacion
    .map((at) => `<option value="${at.atleta_key}">${at.nombre}</option>`).join("");
  const optAlianzas = alianzas
    .map((a) => `<option value="${a.alianza_id}">${a.emoji || ""} ${a.nombre}</option>`).join("");

  return `<div class="card">
    <h2 class="section" style="margin-top:0">🤝 Alianzas</h2>
    <p class="hint" style="margin-top:0">${modoAlianzas
      ? "🟢 Modo alianzas <b>ON</b>"
      : "⚪ Modo alianzas <b>OFF</b>"} — En modo alianzas solo se puede atacar a miembros de OTRA alianza.</p>
    <button class="btn${modoAlianzas ? " ghost" : ""}" id="adm-modo-ali">
      ${modoAlianzas ? "Desactivar modo alianzas" : "Activar modo alianzas"}
    </button>

    <h2 class="section">Crear alianza</h2>
    <input id="adm-ali-nombre" type="text" placeholder="Nombre de la alianza" style="${inputStyle}" />
    <input id="adm-ali-emoji" type="text" maxlength="4" placeholder="🔥 emoji" style="${inputStyle}" />
    <button class="btn" id="adm-ali-crear">Crear alianza</button>

    <h2 class="section">Asignar atleta</h2>
    <select id="adm-ali-atleta" style="${inputStyle}">
      <option value="">— elige atleta —</option>
      ${optAtletas}
    </select>
    <select id="adm-ali-destino" style="${inputStyle}">
      <option value="">— sin alianza —</option>
      ${optAlianzas}
    </select>
    <button class="btn" id="adm-ali-asignar">Asignar</button>

    <h2 class="section">Alianzas y miembros</h2>
    ${listaAli}
  </div>`;
}

function wireAlianzasAdmin() {
  $("#adm-modo-ali")?.addEventListener("click", toggleModoAlianzas);
  $("#adm-ali-crear")?.addEventListener("click", crearAlianza);
  $("#adm-ali-asignar")?.addEventListener("click", asignarAlianza);
}

async function toggleModoAlianzas() {
  const { data, error } = await sb.rpc("set_modo_alianzas", { p_on: !modoAlianzas });
  if (error) { alert("Error: " + error.message); return; }
  if (data && data.ok === false) { alert(data.msg); return; }
  await loadData();
}

async function crearAlianza() {
  const nombre = $("#adm-ali-nombre").value.trim();
  if (!nombre) { alert("Pon un nombre a la alianza."); return; }
  const emoji = $("#adm-ali-emoji").value.trim() || "🤝";
  const { data, error } = await sb.rpc("crear_alianza", { p_nombre: nombre, p_emoji: emoji });
  if (error) { alert("Error: " + error.message); return; }
  if (data && data.ok === false) { alert(data.msg); return; }
  if (data && data.msg) flash(data.msg);
  await loadData();
}

async function asignarAlianza() {
  const atleta = $("#adm-ali-atleta").value;
  if (!atleta) { alert("Elige un atleta."); return; }
  const destino = $("#adm-ali-destino").value;
  const { data, error } = await sb.rpc("asignar_alianza", {
    p_atleta_key: atleta,
    p_alianza: destino || null,
  });
  if (error) { alert("Error: " + error.message); return; }
  if (data && data.ok === false) { alert(data.msg); return; }
  if (data && data.msg) flash(data.msg);
  await loadData();
}

async function toggleAtaques() {
  const { data, error } = await sb.rpc("set_ataques", { p_on: !ataquesOn });
  if (error) { alert("Error: " + error.message); return; }
  if (data && data.ok === false) { alert(data.msg); return; }
  await loadData();
}

async function lanzarCampana() {
  const titulo = $("#adm-titulo").value.trim();
  if (!titulo) { alert("Pon un título a la campaña."); return; }
  const args = {
    p_titulo: titulo,
    p_emoji: $("#adm-emoji").value.trim() || "📣",
    p_descripcion: $("#adm-desc").value.trim(),
    p_dias: Number($("#adm-dias").value) || 7,
    p_bloquea: $("#adm-bloquea").checked,
    p_deporte: $("#adm-deporte").value || null,
    p_factor: Number($("#adm-factor").value) || 1,
    // Bonus por cumplir la semana: vacío = semana cumplida normal (5 pts);
    // poner 30 = en esta campaña cumplir la semana vale 30 pts.
    p_bonus_semana: (parseInt(document.querySelector("#adm-bonussem").value, 10) || null),
  };
  const { data, error } = await sb.rpc("crear_campana", args);
  if (error) { alert("Error: " + error.message); return; }
  if (data && data.ok === false) { alert(data.msg); return; }
  if (data && data.msg) alert(data.msg);
  await loadData();
}

async function terminarCampana(id) {
  if (!confirm("¿Terminar esta campaña ahora?")) return;
  const { data, error } = await sb.rpc("terminar_campana", { p_id: id });
  if (error) { alert("Error: " + error.message); return; }
  if (data && data.ok === false) { alert(data.msg); return; }
  if (data && data.msg) alert(data.msg);
  await loadData();
}
