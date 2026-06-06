// TriSport Liga — app conectada a Supabase (M4.1: login + clasificación y castillo reales).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const fmt = (n) => Math.round(n).toLocaleString("es-ES");

let myAtletaKey = null;
let clasificacion = [];

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
  $$("nav.tabs button").forEach((x) => x.classList.toggle("active", x.dataset.view === "rank"));
  $$(".view").forEach((v) => v.classList.remove("active"));
  $("#view-rank").classList.add("active");
}

async function loadData() {
  const { data, error } = await sb.from("clasificacion").select("*");
  if (error) { console.error(error); return; }
  clasificacion = (data || []).sort((a, b) => b.cofre - a.cofre);
  renderRank("general");
  renderBase();
  $("#metaLine").textContent = `Conectado a la liga · ${clasificacion.length} atletas en la nube.`;
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
      <div class="sub"><span class="badge b-${a.division}">${a.division}</span>
        <span>⚡ ${a.energia_semana} energía</span></div></div>
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
function renderBase() {
  const m = me();
  const c = $("#baseContent");
  if (!m) { c.innerHTML = `<div class="card"><p class="hint">No encuentro tu castillo. Avisa al admin.</p></div>`; return; }
  c.innerHTML = `
    <div class="card hero">
      <div style="display:flex;justify-content:space-between;align-items:start">
        <div><div class="nm">${m.nombre}</div><span class="badge b-${m.division}">División ${m.division}</span></div>
        <div style="text-align:right"><div style="font-size:26px;font-weight:900">#${myPos()}</div>
          <div class="k" style="font-size:10px;color:var(--muted)">posición</div></div>
      </div>
      <div class="stat-grid">
        <div class="stat"><div class="v">${fmt(m.cofre)}</div><div class="k">Cofre</div></div>
        <div class="stat"><div class="v orange">${m.energia_semana}</div><div class="k">Energía</div></div>
        <div class="stat"><div class="v">${m.division}</div><div class="k">División</div></div>
      </div>
    </div>
    <div class="card">
      <h2 class="section" style="margin-top:0">Acciones</h2>
      <p class="hint">⚔️ Los piques en vivo (escudo · robo · duelo · sprint contra otros socios)
      se activan en el siguiente paso. Ahora ya estás <b>conectado a la liga real</b> y tu
      castillo vive en la nube.</p>
    </div>`;
}
