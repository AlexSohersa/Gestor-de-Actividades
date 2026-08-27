import "server-only";

import { cache } from "react";
import { db } from "@/lib/db/client";
import {
  deFechaDia,
  diasHabiles,
  hoyEnMexico,
  quincenaDe,
  sumarDias,
} from "@/lib/fechas";
import { PROYECTO_AUSENCIAS } from "@/modules/actividad/domain/hora.entity";

/**
 * El tablero de horas.
 *
 * Aquí ya no hay dos fuentes que juntar: `actividad.hora` unifica lo que venía
 * de Sheets (`origen = "hoja"`, 7500+ registros) con lo que se reporta desde la
 * plataforma (`origen = "app"`). Sin la historia, el tablero arrancaría en cero
 * y escondería años de trabajo; por eso se lee la tabla completa y no solo lo
 * capturado aquí.
 *
 * Lo cotizado es lo que da sentido a lo reportado: "llevo 40 horas" no dice
 * nada; "40 de 32 cotizadas" sí.
 */

export type ProyectoHoras = {
  proyecto: string;
  horas: number;
  /** Horas que se vendieron para ese proyecto. `null` si no se cotizó. */
  cotizadas: number | null;
  /** Cuánto de lo cotizado se lleva consumido, de 0 a 1+. */
  avance: number | null;
  personas: number;
  ultima: string | null;
};

/** Una fila del historial: lo que ya se reportó, venga de donde venga. */
export type FilaHistorial = {
  id: string;
  /** ISO del día, para poder agrupar por semana en la pantalla. */
  iso: string;
  fecha: string;
  proyecto: string;
  entregable: string;
  tipo: string;
  esfuerzo: string;
  horas: number;
  comentario: string;
};

/**
 * Una quincena cerrada o en curso.
 *
 * El Gestor siempre se ha llevado por quincenas —del 1 al 15 y del 16 al fin
 * de mes—, así que la comparación útil es contra la meta de días hábiles por
 * ocho horas, no contra un mes natural.
 */
export type Quincena = {
  horas: number;
  meta: number;
  rango: string;
  /** Qué tanto de la meta se lleva, de 0 a 1+. */
  avance: number;
};

/**
 * Aviso de horas pendientes de la quincena pasada.
 *
 * El `notificacionHoras` del script solo avisaba entre 4 y 14 días después de
 * cerrar la quincena: antes es pronto —la gente aún está reportando— y
 * después ya no sirve de nada, porque la nómina se fue.
 */
export type AvisoQuincena = {
  faltan: number;
  rango: string;
  /** Días para la próxima fecha de pago. */
  diasParaPago: number;
};

export type Dashboard = {
  /* --- lo mío --- */
  misHoras: number;
  misHorasMes: number;
  misProyectos: number;
  miPromedioDia: number;
  /* --- el pulso de hoy y de la quincena --- */
  horasHoy: number;
  quincena: Quincena;
  quincenaPrevia: Quincena;
  /** `null` si no hay nada pendiente o si no toca avisar todavía. */
  avisoQuincena: AvisoQuincena | null;
  extraQuincena: number;
  /* --- historial completo, para buscar y filtrar --- */
  historial: FilaHistorial[];
  /* --- por proyecto --- */
  porProyecto: ProyectoHoras[];
  /* --- por tipo de actividad --- */
  porTipo: { tipo: string; horas: number }[];
  /* --- últimos meses --- */
  porMes: { mes: string; horas: number; etiqueta: string }[];
  /* --- de la empresa --- */
  totalEmpresa: number;
  proyectosActivos: number;
  personasActivas: number;
  /** `true` si esta persona ve las cifras de toda la empresa. */
  verEmpresa: boolean;
  /** Periodo con el que se calculó el desglose. */
  periodo: Periodo;
  /** Cuánto llevas TÚ en ese periodo. */
  horasPeriodo: number;
};

/**
 * Una fila de horas ya normalizada para el cálculo.
 *
 * `iso` es la fecha como AAAA-MM-DD y es la ÚNICA forma en que se compara y se
 * agrupa por día. `hora.fecha` es una columna `date` (medianoche UTC): pasarla
 * por comparaciones de `Date` locales correría el día en cualquier zona
 * negativa, que es justo la nuestra.
 */
type FilaHoras = {
  id: string;
  iso: string;
  personaId: string;
  proyecto: string;
  /// Los históricos importados no siempre traen entregable.
  entregable: string;
  tipo: string | null;
  /// Vienen de las columnas L y H de la hoja, y de lo reportado aquí.
  esfuerzo: string | null;
  comentario: string | null;
  horas: number;
  /// El equivalente del antiguo `category`: sirve para separar las horas extra.
  categoria: string;
  /// Se marcaba como categoría "AUSENCIA" en el portal; aquí lo determina el
  /// proyecto interno bajo el que se registran los permisos.
  esAusencia: boolean;
};

/** Lo que se trae de `actividad.hora` para armar una `FilaHoras`. */
const SELECCION = {
  id: true,
  personaId: true,
  proyectoCodigo: true,
  proyectoTexto: true,
  entregableTexto: true,
  fecha: true,
  horas: true,
  tipo: true,
  esfuerzo: true,
  categoria: true,
  comentario: true,
  proyecto: { select: { nombre: true } },
  entregable: { select: { nombre: true } },
} as const;

type FilaPrisma = {
  id: string;
  personaId: string;
  proyectoCodigo: string | null;
  proyectoTexto: string | null;
  entregableTexto: string | null;
  fecha: Date;
  horas: unknown;
  tipo: string | null;
  esfuerzo: string | null;
  categoria: string | null;
  comentario: string | null;
  proyecto: { nombre: string } | null;
  entregable: { nombre: string } | null;
};

function aFilaHoras(f: FilaPrisma): FilaHoras {
  return {
    id: f.id,
    iso: deFechaDia(f.fecha),
    personaId: f.personaId,
    // El nombre del padrón manda; si la fila vino de la hoja con un proyecto
    // que no existe en el padrón, se muestra el texto original.
    proyecto: f.proyecto?.nombre ?? f.proyectoTexto ?? "SIN PROYECTO",
    entregable: f.entregable?.nombre ?? f.entregableTexto ?? "",
    tipo: f.tipo,
    esfuerzo: f.esfuerzo,
    comentario: f.comentario,
    // `horas` es Decimal de Prisma: sin Number() las sumas concatenarían.
    horas: Number(f.horas),
    // NORMAL · EXTRA · AUSENCIA, de la columna J. NO se deriva de `tipo`:
    // ese es el catálogo de actividad y jamás vale "EXTRA", así que el
    // contador de horas extra salía siempre en cero.
    categoria: (f.categoria ?? "NORMAL").trim().toUpperCase(),
    esAusencia: f.proyectoCodigo === PROYECTO_AUSENCIAS,
  };
}

/** El día de hoy en México como AAAA-MM-DD. Todo el cálculo cuelga de aquí. */
function hoyISO(): string {
  return hoyEnMexico();
}

/**
 * La quincena que contiene a `iso`, con sus extremos como AAAA-MM-DD.
 *
 * Es el corte con el que siempre se ha llevado el Gestor, así que la meta sale
 * de sus días hábiles por la jornada de ocho horas.
 */
function quincenaISO(iso: string): { ini: string; fin: string } {
  const q = quincenaDe(iso);
  return { ini: q.inicio, fin: q.fin };
}

/** "14 ago" — el formato corto con el que se rotulan los rangos. */
function fechaCorta(iso: string): string {
  return new Intl.DateTimeFormat("es-MX", {
    // El valor ya es un día puro: interpretarlo en otra zona lo correría.
    timeZone: "UTC",
    day: "numeric",
    month: "short",
  })
    .format(new Date(`${iso}T12:00:00.000Z`))
    .replace(".", "");
}

function resumenQuincena(
  filas: FilaHoras[],
  ini: string,
  fin: string,
): Quincena {
  // Comparación de cadenas AAAA-MM-DD: ordena igual que las fechas y no
  // depende de la zona del servidor.
  const horas = filas
    .filter((f) => f.iso >= ini && f.iso <= fin)
    .reduce((n, f) => n + f.horas, 0);
  const meta = diasHabiles(ini, fin) * 8;

  return {
    horas: Math.round(horas * 10) / 10,
    meta,
    rango: `${fechaCorta(ini)} – ${fechaCorta(fin)}`,
    avance: meta > 0 ? horas / meta : 0,
  };
}

/** Días de calendario entre dos días ISO. */
function diasEntre(desdeISO: string, hastaISO: string): number {
  const a = Date.parse(`${desdeISO}T00:00:00.000Z`);
  const b = Date.parse(`${hastaISO}T00:00:00.000Z`);
  return Math.floor((b - a) / 86400000);
}

/** Periodos que se pueden consultar en el tablero. */
export type Periodo = "quincena" | "mes" | "anio";

/** Un tablero en blanco, con la forma que espera la pantalla. */
export function dashboardVacio(
  periodo: Periodo,
  verEmpresa: boolean,
): Dashboard {
  return {
    misHoras: 0,
    misHorasMes: 0,
    misProyectos: 0,
    miPromedioDia: 0,
    horasHoy: 0,
    quincena: { horas: 0, meta: 0, rango: "", avance: 0 },
    quincenaPrevia: { horas: 0, meta: 0, rango: "", avance: 0 },
    avisoQuincena: null,
    extraQuincena: 0,
    historial: [],
    porProyecto: [],
    porTipo: [],
    porMes: [],
    totalEmpresa: 0,
    proyectosActivos: 0,
    personasActivas: 0,
    verEmpresa,
    periodo,
    horasPeriodo: 0,
  };
}

/**
 * Solo las cifras que la VISTA SEMANAL necesita.
 *
 * Esa vista usa cuatro cosas —horas de hoy, las dos quincenas y el aviso de
 * pendientes—, y el tablero completo recorre miles de filas para calcular
 * desgloses que ahí no se muestran. Esta versión mira únicamente los días de
 * las dos quincenas: unas decenas de filas en vez de 7500.
 */
export const cargarResumenSemana = cache(async function cargarResumenSemana(
  personaId: string | null,
  periodo: Periodo,
  verEmpresa: boolean,
): Promise<Dashboard> {
  const base = dashboardVacio(periodo, verEmpresa);
  if (!personaId) return base;

  const hoy = hoyISO();
  const q = quincenaISO(hoy);
  // Un día antes del inicio cae siempre dentro de la quincena anterior.
  const qPrev = quincenaISO(sumarDias(q.ini, -1));

  // Solo desde el inicio de la quincena anterior: es todo lo que se necesita.
  const filas = (
    await db.hora.findMany({
      // La identidad es el id de core.persona, no el nombre: ya no hace falta
      // comparar cadenas sin distinguir mayúsculas como con las hojas.
      where: {
        personaId,
        fecha: { gte: new Date(`${qPrev.ini}T00:00:00.000Z`) },
      },
      select: SELECCION,
    })
  )
    .map(aFilaHoras)
    // Las ausencias no son trabajo: cuentan aparte y aquí distorsionarían.
    .filter((f) => !f.esAusencia);

  const quincena = resumenQuincena(filas, q.ini, q.fin);
  const quincenaPrevia = resumenQuincena(filas, qPrev.ini, qPrev.fin);

  const desdeCierre = diasEntre(qPrev.fin, hoy);
  const faltan =
    Math.round((quincenaPrevia.meta - quincenaPrevia.horas) * 10) / 10;

  return {
    ...base,
    horasHoy:
      Math.round(
        filas.filter((f) => f.iso === hoy).reduce((n, f) => n + f.horas, 0) * 10,
      ) / 10,
    quincena,
    quincenaPrevia,
    avisoQuincena:
      faltan > 0 && desdeCierre >= 4 && desdeCierre <= 14
        ? {
            faltan,
            rango: quincenaPrevia.rango,
            // El pago cae al terminar la quincena en curso.
            diasParaPago: Math.max(0, diasEntre(hoy, q.fin)),
          }
        : null,
    extraQuincena:
      Math.round(
        filas
          .filter((f) => f.iso >= q.ini && f.categoria === "EXTRA")
          .reduce((n, f) => n + f.horas, 0) * 10,
      ) / 10,
  };
});

export const cargarDashboard = cache(async function cargarDashboard(
  personaId: string | null,
  verEmpresa: boolean,
  periodo: Periodo = "anio",
): Promise<Dashboard> {
  const vacio = dashboardVacio(periodo, verEmpresa);

  // Solo el último año: más atrás es arqueología, no seguimiento, y el
  // tablero tardaría en cargar sin decir nada nuevo.
  const hoy = hoyISO();
  const desde = sumarDias(hoy, -365);

  // Las cifras de empresa ya no se deducen de las filas leídas: `personasActivas`
  // y `proyectosActivos` son propiedades del padrón (core), y contarlas ahí es
  // exacto y barato. Antes se contaban los distintos que aparecían en el último
  // año, lo que dejaba fuera a quien no había reportado.
  const [filasPrisma, cotizadas, proyectos, personasActivas, proyectosActivos] =
    await Promise.all([
      db.hora.findMany({
        where: { fecha: { gte: new Date(`${desde}T00:00:00.000Z`) } },
        select: SELECCION,
        orderBy: { fecha: "desc" },
      }),
      db.horaCotizada.findMany({
        select: { proyectoCodigo: true, horas: true },
      }),
      // Lo cotizado se guarda por CÓDIGO de proyecto, pero el desglose agrupa
      // por NOMBRE (es lo que ve la persona y lo que traían las hojas). Este
      // padrón es el puente entre los dos.
      db.proyecto.findMany({ select: { codigo: true, nombre: true } }),
      db.persona.count({ where: { activo: true } }),
      db.proyecto.count({ where: { estado: "ACTIVO" } }),
    ]);

  const todas = filasPrisma.map(aFilaHoras);

  // Las ausencias no son trabajo: cuentan aparte y aquí distorsionarían.
  const trabajo = todas.filter((f) => !f.esAusencia);

  /* ------------------------------- lo mío ------------------------------ */
  const mias = personaId ? trabajo.filter((f) => f.personaId === personaId) : [];

  // Primer día del mes en curso, como ISO: mismo criterio de comparación que
  // el resto del archivo.
  const inicioMes = `${hoy.slice(0, 7)}-01`;

  const misHoras = mias.reduce((n, f) => n + f.horas, 0);
  const misHorasMes = mias
    .filter((f) => f.iso >= inicioMes)
    .reduce((n, f) => n + f.horas, 0);

  // El promedio se calcula sobre los días QUE SE REPORTARON, no sobre el
  // calendario: dividir entre 365 daría un número deprimente y falso.
  const diasConRegistro = new Set(mias.map((f) => f.iso));

  /* ------------------------- ventana del periodo ----------------------- */
  // El desglose responde al periodo elegido: la quincena en curso es lo que
  // se revisa a diario, el año entero rara vez dice algo accionable.
  const ventana: string = (() => {
    if (periodo === "anio") return desde;
    if (periodo === "mes") return inicioMes;
    return quincenaISO(hoy).ini;
  })();

  // SIEMPRE los proyectos de la persona, aunque vea cifras de empresa: en su
  // tablero le interesan sus horas, no las de todos. Lo de la empresa va
  // aparte, en su propio panel.
  const base = mias.filter((f) => f.iso >= ventana);

  const nombrePorCodigo = new Map(proyectos.map((p) => [p.codigo, p.nombre]));

  const cotPorProyecto = new Map<string, number>();
  for (const c of cotizadas) {
    // Sin proyecto no hay con qué cruzar: hay filas cotizadas que llegaron sin
    // él y se omiten, igual que las que no están en el padrón.
    if (!c.proyectoCodigo) continue;
    const nombre = nombrePorCodigo.get(c.proyectoCodigo);
    if (!nombre) continue;
    cotPorProyecto.set(
      nombre,
      (cotPorProyecto.get(nombre) ?? 0) + Number(c.horas),
    );
  }

  const acum = new Map<
    string,
    { horas: number; personas: Set<string>; ultima: string }
  >();
  for (const f of base) {
    const e = acum.get(f.proyecto) ?? {
      horas: 0,
      personas: new Set<string>(),
      ultima: f.iso,
    };
    e.horas += f.horas;
    e.personas.add(f.personaId);
    if (f.iso > e.ultima) e.ultima = f.iso;
    acum.set(f.proyecto, e);
  }

  const porProyecto: ProyectoHoras[] = [...acum.entries()]
    .map(([proyecto, e]) => {
      const cot = cotPorProyecto.get(proyecto) ?? 0;
      return {
        proyecto,
        horas: Math.round(e.horas * 10) / 10,
        cotizadas: cot > 0 ? cot : null,
        avance: cot > 0 ? e.horas / cot : null,
        personas: e.personas.size,
        // La pantalla espera un ISO completo, como el que daba toISOString().
        ultima: `${e.ultima}T00:00:00.000Z`,
      };
    })
    .sort((a, b) => b.horas - a.horas)
    .slice(0, 14);

  /* ---------------------------- por tipo ------------------------------- */
  const tipos = new Map<string, number>();
  for (const f of base) {
    const t = (f.tipo ?? "SIN TIPO").trim() || "SIN TIPO";
    tipos.set(t, (tipos.get(t) ?? 0) + f.horas);
  }
  const porTipo = [...tipos.entries()]
    .map(([tipo, horas]) => ({ tipo, horas: Math.round(horas * 10) / 10 }))
    .sort((a, b) => b.horas - a.horas)
    .slice(0, 8);

  /* ----------------------------- por mes ------------------------------- */
  const meses = new Map<string, number>();
  for (const f of mias) {
    // Los siete primeros caracteres de AAAA-MM-DD son justo AAAA-MM.
    const k = f.iso.slice(0, 7);
    meses.set(k, (meses.get(k) ?? 0) + f.horas);
  }
  const porMes = [...meses.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-12)
    .map(([mes, horas]) => ({
      mes,
      horas: Math.round(horas * 10) / 10,
      etiqueta: new Intl.DateTimeFormat("es-MX", {
        timeZone: "UTC",
        month: "short",
      })
        .format(new Date(`${mes}-01T12:00:00.000Z`))
        .replace(".", ""),
    }));

  /* -------------------- hoy, quincena e historial ---------------------- */
  const horasHoy = mias
    .filter((f) => f.iso === hoy)
    .reduce((n, f) => n + f.horas, 0);

  const q = quincenaISO(hoy);
  // Un día antes del inicio cae siempre dentro de la quincena anterior.
  const qPrev = quincenaISO(sumarDias(q.ini, -1));

  const quincena = resumenQuincena(mias, q.ini, q.fin);
  const quincenaPrevia = resumenQuincena(mias, qPrev.ini, qPrev.fin);

  /* --------------- ¿faltan horas de la quincena que ya cerró? ----------- */
  // Se avisa entre 4 y 14 días después del cierre, como hacía el script: antes
  // la gente todavía está reportando, y después la nómina ya se fue.
  const desdeCierre = diasEntre(qPrev.fin, hoy);
  const faltan =
    Math.round((quincenaPrevia.meta - quincenaPrevia.horas) * 10) / 10;
  const avisoQuincena: AvisoQuincena | null =
    faltan > 0 && desdeCierre >= 4 && desdeCierre <= 14
      ? {
          faltan,
          rango: quincenaPrevia.rango,
          // El pago cae al terminar la quincena en curso.
          diasParaPago: Math.max(0, diasEntre(hoy, q.fin)),
        }
      : null;

  const extraQuincena = mias
    .filter((f) => f.iso >= q.ini && f.categoria === "EXTRA")
    .reduce((n, f) => n + f.horas, 0);

  const historial: FilaHistorial[] = mias
    .slice()
    .sort((a, b) => b.iso.localeCompare(a.iso))
    .map((f) => ({
      id: f.id,
      iso: f.iso,
      fecha: fechaCorta(f.iso),
      proyecto: f.proyecto,
      entregable: f.entregable || f.proyecto,
      tipo: (f.tipo ?? "").trim(),
      esfuerzo: (f.esfuerzo ?? "").trim(),
      horas: f.horas,
      comentario: (f.comentario ?? "").trim(),
    }));

  return {
    ...vacio,
    horasHoy: Math.round(horasHoy * 10) / 10,
    quincena,
    quincenaPrevia,
    avisoQuincena,
    extraQuincena: Math.round(extraQuincena * 10) / 10,
    historial,
    misHoras: Math.round(misHoras * 10) / 10,
    misHorasMes: Math.round(misHorasMes * 10) / 10,
    misProyectos: new Set(mias.map((f) => f.proyecto)).size,
    miPromedioDia:
      diasConRegistro.size > 0
        ? Math.round((misHoras / diasConRegistro.size) * 10) / 10
        : 0,
    porProyecto,
    porTipo,
    porMes,
    totalEmpresa: Math.round(trabajo.reduce((n, f) => n + f.horas, 0)),
    proyectosActivos,
    personasActivas,
    verEmpresa,
    periodo,
    horasPeriodo: Math.round(base.reduce((n, f) => n + f.horas, 0) * 10) / 10,
  };
});
