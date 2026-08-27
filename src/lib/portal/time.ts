/**
 * Tiempo relativo en español: "hace 5 min", "ayer", "hace 3 días".
 *
 * Usa `Intl.RelativeTimeFormat`, que ya sabe pluralizar y decir "ayer" en vez
 * de "hace 1 día". Mantener a mano esa tabla de casos sería reinventar algo
 * que el navegador ya hace bien.
 */
export function relativeTime(ts: number, now = Date.now()): string {
  const diff = ts - now;
  const abs = Math.abs(diff);

  const MIN = 60_000;
  const HOUR = 3_600_000;
  const DAY = 86_400_000;

  // Menos de un minuto: "hace un momento" se lee mejor que "hace 0 segundos".
  if (abs < MIN) return "hace un momento";

  const rtf = new Intl.RelativeTimeFormat("es-MX", { numeric: "auto" });

  if (abs < HOUR) return rtf.format(Math.round(diff / MIN), "minute");
  if (abs < DAY) return rtf.format(Math.round(diff / HOUR), "hour");
  if (abs < DAY * 7) return rtf.format(Math.round(diff / DAY), "day");
  if (abs < DAY * 30) return rtf.format(Math.round(diff / (DAY * 7)), "week");

  // Pasado un mes, la fecha concreta informa más que "hace 5 semanas".
  return new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short" }).format(
    new Date(ts),
  );
}

/** `true` si se abrió en los últimos tres días. Alimenta el badge RECIENTE. */
export function isRecent(ts?: number, now = Date.now()): boolean {
  if (!ts) return false;
  return now - ts < 86_400_000 * 3;
}
