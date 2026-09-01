// Utilidades de fecha SIN dependencias de Node, para que el motor de la liga pueda
// correr igual en el sync (servidor) y dentro de la PWA (navegador).
// Vivian en parse.mjs, pero ese modulo importa node:fs y en el navegador revienta.

/** Semana ISO en formato "YYYY-Www" (lunes como primer dia, jueves decide el ano). */
export function isoWeek(ts) {
  const d = new Date(Date.UTC(ts.getFullYear(), ts.getMonth(), ts.getDate()));
  const day = (d.getUTCDay() + 6) % 7; // lunes=0
  d.setUTCDate(d.getUTCDate() - day + 3); // jueves de esa semana
  const firstThu = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const week =
    1 +
    Math.round(
      ((d - firstThu) / 86400000 - 3 + ((firstThu.getUTCDay() + 6) % 7)) / 7
    );
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** Lunes de una semana ISO ("2026-W36" -> Date del 31/08/2026). */
export function lunesDe(semana) {
  const [anio, w] = semana.split("-W").map(Number);
  const cuatroEnero = new Date(Date.UTC(anio, 0, 4));
  const lunesW1 = new Date(cuatroEnero);
  lunesW1.setUTCDate(cuatroEnero.getUTCDate() - ((cuatroEnero.getUTCDay() + 6) % 7));
  const d = new Date(lunesW1);
  d.setUTCDate(lunesW1.getUTCDate() + (w - 1) * 7);
  return d;
}
