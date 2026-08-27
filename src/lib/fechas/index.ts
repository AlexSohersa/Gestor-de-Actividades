/**
 * Fechas y horas del Gestor.
 *
 * REGLA DE ORO: se guarda el instante exacto y se muestra en hora de México.
 * Nunca se guardan "horas locales a secas": el último domingo de octubre la
 * 01:30 ocurre dos veces, y una marca sin zona no sabe cuál de las dos es.
 *
 * Hay dos clases de dato y NO se tratan igual:
 *
 *  · DÍA DE CALENDARIO (`hora.fecha`, `ausencia.fecha_inicio`): columnas `date`.
 *    Un día no tiene hora ni zona: el 14 de agosto es el 14 de agosto tanto en
 *    Tijuana como en Cancún. Se manejan como texto AAAA-MM-DD y se convierten a
 *    Date a mediodía UTC, lejos de cualquier frontera de día.
 *
 *  · INSTANTE (`checada.entrada`, `ticket.creado_en`): columnas `timestamptz`.
 *    Ahí sí importa la zona y se formatean con America/Mexico_City.
 */

export const ZONA = "America/Mexico_City";

/// El día de hoy en México, como AAAA-MM-DD.
///
/// No se usa `new Date().toISOString()` porque eso da el día en UTC: a las 7 de
/// la tarde en Guadalajara ya es el día siguiente en UTC, y las horas se
/// registrarían con fecha de mañana.
export function hoyEnMexico(ahora: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(ahora);
}

/// Convierte AAAA-MM-DD al Date que Postgres guarda en una columna `date`.
///
/// A mediodía UTC a propósito: con medianoche, cualquier desfase de zona en el
/// camino movería la fecha un día. A las 12:00 hay 12 horas de margen a cada
/// lado.
export function aFechaDia(iso: string): Date {
  return new Date(`${iso}T12:00:00.000Z`);
}

/// De un Date de columna `date` de vuelta a AAAA-MM-DD.
///
/// Se leen las partes en UTC (no las locales) porque el valor se construyó en
/// UTC: usar getFullYear() daría el día anterior en cualquier zona negativa.
export function deFechaDia(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
}

/// El día (AAAA-MM-DD) en que ocurrió un INSTANTE, en hora de México.
export function diaDeInstante(d: Date): string {
  return hoyEnMexico(d);
}

/// La hora de un instante en México, como HH:MM.
export function horaEnMexico(d: Date): string {
  return new Intl.DateTimeFormat("es-MX", {
    timeZone: ZONA,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

/// "14 ago 2026" — para mostrar un día de calendario.
export function diaLegible(iso: string): string {
  return new Intl.DateTimeFormat("es-MX", {
    timeZone: "UTC", // el valor ya es un día puro; no reinterpretar la zona
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(aFechaDia(iso));
}

/// "jueves 14" — encabezados de la semana.
export function diaConNombre(iso: string): string {
  return new Intl.DateTimeFormat("es-MX", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
  }).format(aFechaDia(iso));
}

/// ¿Cae en sábado o domingo? Se calcula en UTC por la misma razón que arriba.
export function esFinDeSemana(iso: string): boolean {
  const dia = aFechaDia(iso).getUTCDay();
  return dia === 0 || dia === 6;
}

/// Suma (o resta, con negativos) días a una fecha AAAA-MM-DD.
export function sumarDias(iso: string, dias: number): string {
  const d = aFechaDia(iso);
  d.setUTCDate(d.getUTCDate() + dias);
  return deFechaDia(d);
}

/// El lunes de la semana que contiene a `iso`.
export function lunesDe(iso: string): string {
  const d = aFechaDia(iso);
  // getUTCDay(): 0 = domingo. La cuenta lleva el domingo al lunes anterior.
  const desplazamiento = (d.getUTCDay() + 6) % 7;
  return sumarDias(iso, -desplazamiento);
}

/// Los siete días de la semana que empieza en `lunesISO`.
export function semanaDesde(lunesISO: string): string[] {
  return Array.from({ length: 7 }, (_, i) => sumarDias(lunesISO, i));
}

/// Días hábiles (lunes a viernes) entre dos fechas, ambas incluidas.
///
/// No contempla días de asueto: el gestor antiguo tampoco lo hacía, y el
/// calendario oficial vive en una hoja aparte (BDD ASUETOS) que aún no se
/// migra. Ver docs/DEUDAS.md.
export function diasHabiles(desdeISO: string, hastaISO: string): number {
  let n = 0;
  let cursor = desdeISO;
  while (cursor <= hastaISO) {
    if (!esFinDeSemana(cursor)) n++;
    cursor = sumarDias(cursor, 1);
  }
  return n;
}

/// Cada día hábil entre dos fechas, ambas incluidas.
///
/// Si el rango entero cae en fin de semana devuelve el día de inicio, para que
/// una ausencia de un sábado no desaparezca sin dejar rastro.
export function diasHabilesEntre(desdeISO: string, hastaISO: string): string[] {
  const dias: string[] = [];
  let cursor = desdeISO;
  while (cursor <= hastaISO) {
    if (!esFinDeSemana(cursor)) dias.push(cursor);
    cursor = sumarDias(cursor, 1);
  }
  return dias.length > 0 ? dias : [desdeISO];
}

/// La quincena que contiene a `iso`: del 1 al 15, o del 16 al fin de mes.
export function quincenaDe(iso: string): {
  numero: 1 | 2;
  inicio: string;
  fin: string;
} {
  const d = aFechaDia(iso);
  const anio = d.getUTCFullYear();
  const mes = d.getUTCMonth();
  const dia = d.getUTCDate();
  const p = (n: number) => String(n).padStart(2, "0");

  if (dia <= 15) {
    return {
      numero: 1,
      inicio: `${anio}-${p(mes + 1)}-01`,
      fin: `${anio}-${p(mes + 1)}-15`,
    };
  }

  // El día 0 del mes siguiente es el último del actual.
  const ultimo = new Date(Date.UTC(anio, mes + 1, 0)).getUTCDate();
  return {
    numero: 2,
    inicio: `${anio}-${p(mes + 1)}-16`,
    fin: `${anio}-${p(mes + 1)}-${p(ultimo)}`,
  };
}

/// Tiempo relativo en español: "hace 5 min", "ayer", "hace 3 días".
export function tiempoRelativo(ts: number, ahora = Date.now()): string {
  const diff = ts - ahora;
  const abs = Math.abs(diff);

  const MIN = 60_000;
  const HORA = 3_600_000;
  const DIA = 86_400_000;

  if (abs < MIN) return "hace un momento";

  const rtf = new Intl.RelativeTimeFormat("es-MX", { numeric: "auto" });
  if (abs < HORA) return rtf.format(Math.round(diff / MIN), "minute");
  if (abs < DIA) return rtf.format(Math.round(diff / HORA), "hour");
  if (abs < DIA * 7) return rtf.format(Math.round(diff / DIA), "day");
  if (abs < DIA * 30) return rtf.format(Math.round(diff / (DIA * 7)), "week");

  return new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "short",
  }).format(new Date(ts));
}
