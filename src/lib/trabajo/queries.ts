import "server-only";
import { folioDeTicket } from "./folio";

import { cache } from "react";
import { db } from "@/lib/db/client";
import { deFechaDia, hoyEnMexico } from "@/lib/fechas";
import type { SaldoVacaciones } from "@/lib/gestor/queries";

/**
 * Ausencias y tickets de UNA persona.
 *
 * Las pantallas (`AusenciasScreen`, `TicketsScreen`) vienen tal cual de la
 * plataforma y no se tocan: este archivo conserva sus firmas y sus tipos, y por
 * dentro lee de `actividad.ausencia`, `actividad.ticket` y
 * `actividad.saldo_vacaciones` en vez de las tablas del portal.
 *
 * El cambio de fondo es la identidad: allá se buscaba por correo, aquí por
 * `personaId` de core.persona. Un mismo colaborador entra con su Gmail en una
 * herramienta y con el correo de empresa en otra, así que el correo nunca fue
 * una clave fiable.
 */

/* ============================ AUSENCIAS ================================= */

export type AbsenceView = {
  id: string;
  /// Quién la pidió: hace falta en la bandeja de quien aprueba.
  userName?: string;
  type: string;
  startDate: string;
  endDate: string;
  halfDay: boolean;
  /// Horas de la ausencia cuando no es día completo.
  hours: number | null;
  detail: string | null;
  /// A quién se envió la solicitud para su visto bueno.
  sentTo: string | null;
  status: string;
  /// De qué bloques salieron los días, cuando son vacaciones.
  ///
  /// Una solicitud puede repartirse entre varios: con 7 días en un bloque y 3
  /// en otro, pedir 8 toma 7 del primero y 1 del segundo. Guardar solo un
  /// "periodo" perdía el segundo, y con eso la posibilidad de saber de qué año
  /// se tomaron unos días cuando las hojas ya no estén.
  blocks?: { periodo: number; dias: number; vence: string | null }[];
};

/**
 * Días hábiles (L–V) que cubre una ausencia.
 *
 * Una ausencia parcial descuenta la fracción que le toca por sus horas, no
 * media jornada fija: una hora de ocho son 0.125 días.
 */
export function diasHabiles(a: {
  startDate: Date;
  endDate: Date;
  halfDay: boolean;
  hours?: number | null;
}): number {
  if (a.halfDay) return a.hours && a.hours > 0 ? a.hours / 8 : 0.5;
  let n = 0;
  const d = new Date(a.startDate);
  while (d <= a.endDate) {
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) n++;
    d.setDate(d.getDate() + 1);
  }
  return n;
}

/**
 * El vocabulario de estados de la pantalla.
 *
 * La base guarda PENDIENTE · APROBADA · RECHAZADA; la pantalla copiada rotula
 * y filtra con "pendiente" · APROBADO · RECHAZADO (ver `ST_UI` en
 * `AusenciasScreen`). Traducir aquí es lo que permite dejar la pantalla
 * intacta; el mapa vive en un solo sitio para que no se separen.
 */
function aEstadoPantalla(estado: string): string {
  if (estado === "APROBADA") return "APROBADO";
  if (estado === "RECHAZADA") return "RECHAZADO";
  return "pendiente";
}

export const loadAusencias = cache(async function loadAusencias(
  personaId?: string | null,
): Promise<{ lista: AbsenceView[]; usados: number; pendientes: number }> {
  if (!personaId) return { lista: [], usados: 0, pendientes: 0 };

  const filas = await db.ausencia.findMany({
    where: { personaId },

    /*
     * Lo ÚLTIMO ENVIADO primero, no la ausencia más lejana.
     *
     * Ordenar por `fechaInicio` mandaba abajo lo que se acababa de solicitar
     * si su fecha era anterior a la de otra ya pedida: se enviaba algo y había
     * que bajar a buscarlo. Lo que se quiere ver al entrar es lo que uno acaba
     * de hacer.
     *
     * `fechaInicio` queda de desempate para las importadas de la hoja, que
     * comparten la fecha de creación de la migración.
     */
    orderBy: [{ creadoEn: "desc" }, { fechaInicio: "desc" }],
    select: {
      // De qué bloque salió cada día: es lo que permite reconstruir el
      // reparto sin depender de las hojas.
      bloques: {
        select: { periodo: true, dias: true, venceEn: true },
        orderBy: { periodo: "asc" },
      },
      id: true,
      tipo: true,
      fechaInicio: true,
      fechaFin: true,
      medioDia: true,
      horas: true,
      motivo: true,
      estado: true,
      persona: { select: { nombre: true } },
      destinatario: { select: { nombre: true } },
      decisorPor: { select: { nombre: true } },
    },
  });

  const anio = new Date().getUTCFullYear();

  // Solo las vacaciones aprobadas del año consumen días del saldo; un permiso
  // médico no descuenta vacaciones. El tipo se compara por contenido porque las
  // hojas escribieron "Vacaciones", "VACACIONES 2024" y "vacacion".
  const usados = filas
    .filter(
      (f) =>
        f.estado === "APROBADA" &&
        f.tipo.toUpperCase().includes("VACACION") &&
        // `fechaInicio` es columna `date` a medianoche UTC: leerla con
        // getFullYear() local correría el día en nuestra zona negativa.
        deFechaDia(f.fechaInicio).slice(0, 4) === String(anio),
    )
    .reduce(
      (n, f) =>
        n +
        diasHabiles({
          startDate: f.fechaInicio,
          endDate: f.fechaFin,
          halfDay: f.medioDia,
          hours: f.horas === null ? null : Number(f.horas),
        }),
      0,
    );

  return {
    lista: filas.map((f) => ({
      id: f.id,
      userName: f.persona.nombre,
      type: f.tipo,
      startDate: f.fechaInicio.toISOString(),
      endDate: f.fechaFin.toISOString(),
      halfDay: f.medioDia,
      hours: f.horas === null ? null : Number(f.horas),
      detail: f.motivo,
      // El nuevo schema no guarda a quién se DIRIGIÓ la solicitud, solo quién
      // la decidió: el coordinador sale de `persona.coordinador_id`. Mientras
      // sigue pendiente no hay a quién nombrar, y la pantalla ya contempla el
      // A quién se le mandó. Mientras está pendiente es lo que la persona
      // necesita saber ("¿quién me la tiene que aprobar?"); una vez resuelta,
      // quien la decidió suele ser la misma persona.
      sentTo: f.destinatario?.nombre ?? f.decisorPor?.nombre ?? null,
      // De qué bloques salieron los días. Vacío en lo importado de la hoja:
      // el gestor antiguo no guardaba ese detalle.
      blocks: f.bloques.map((b) => ({
        periodo: b.periodo,
        dias: Number(b.dias),
        vence: b.venceEn ? deFechaDia(b.venceEn) : null,
      })),
      status: aEstadoPantalla(f.estado),
    })),
    usados: Math.round(usados * 100) / 100,
    pendientes: filas.filter((f) => f.estado === "PENDIENTE").length,
  };
});

/* ========================= SALDO DE VACACIONES ========================== */

/**
 * El saldo, repartido en bloques por periodo de antigüedad.
 *
 * Los días otorgados salen de `actividad.saldo_vacaciones`; los consumidos NO
 * se guardan en ningún contador, se derivan de las ausencias aprobadas. Un
 * contador guardado se desincroniza en cuanto alguien cancela o rectifica una
 * solicitud, y entonces nadie sabe cuál de los dos números es el bueno.
 *
 * Los usados se descuentan del bloque que vence primero: es el que se pierde si
 * no se toma, así que gastarlo antes es lo que le conviene a la persona.
 */
export const saldoVacaciones = cache(async function saldoVacaciones(
  personaId?: string | null,
): Promise<SaldoVacaciones> {
  const vacio: SaldoVacaciones = {
    disponibles: 0,
    usados: 0,
    bloques: [],
    liberaciones: [],
  };
  if (!personaId) return vacio;

  /*
   * Solo los bloques. Ya no hace falta leer las ausencias: aprobar unas
   * vacaciones descuenta de `dias` y anota en `usados` en el momento, así que
   * la base está al día sin recalcular nada.
   */
  const saldos = await db.saldoVacaciones.findMany({
    where: { personaId },
    orderBy: { periodo: "asc" },
  });

  /*
   * Los días ya tomados, según la hoja oficial.
   *
   * `usados` de cada bloque viene de ahí: es lo que esa persona lleva tomado
   * de ese periodo, y `dias` ya trae lo que le queda. Los dos juntos dan lo
   * otorgado, que es contra lo que se compara el anillo: "10 de 12".
   *
   * NO se recalcula desde las ausencias importadas. Hacerlo las contaría dos
   * veces —ya están descontadas en `dias`— y con 38 días de historial daba
   * saldos negativos absurdos.
   */
  const tomadosEnBloques = saldos.reduce((n, b) => n + Number(b.usados), 0);

  /*
   * Ya NO se descuenta nada aquí.
   *
   * Aprobar unas vacaciones resta los días de `dias` y los anota en `usados`
   * (ver `consumirVacaciones`), así que el saldo vivo ya está al día en cuanto
   * se aprueba. Volver a restar las ausencias aprobadas lo contaba dos veces:
   * quien pedía 4 días veía bajar 8.
   *
   * `usados` es el histórico completo —lo que traía la hoja más lo aprobado
   * aquí— y sirve para enseñar "6 de 12", no para restar.
   */
  const usadosMostrados = tomadosEnBloques;

  // "Hoy" en México, no en UTC: a media tarde el servidor ya estaría en el día
  // siguiente y un bloque que se libera mañana contaría como disponible.
  const hoy = hoyEnMexico();

  const conFecha = saldos.map((s) => ({
    periodo: s.periodo,
    dias: Number(s.dias),
    // Lo que YA se gastó de este bloque, apuntado en la propia fila cuando se
    // aprobaron unas vacaciones. Sin esto el bloque parecía intacto.
    gastado: Number(s.usados),
    libera: s.liberadoEn ? deFechaDia(s.liberadoEn) : null,
    vence: s.venceEn ? deFechaDia(s.venceEn) : null,
  }));

  /*
   * Un bloque cuenta como DISPONIBLE cuando ya se liberó y todavía no vence.
   *
   * Sin fecha de liberación se considera liberado: es el caso de los días que
   * ya correspondían al darse de alta el padrón.
   *
   * Esta distinción es la que faltaba y hacía que alguien con 10 días viera
   * 32: los días de periodos futuros están otorgados, pero no se pueden tomar
   * hasta su fecha.
   */
  const liberado = (b: { libera: string | null }) =>
    b.libera === null || b.libera <= hoy;
  const vigente = (b: { vence: string | null }) =>
    b.vence === null || b.vence >= hoy;

  const disponiblesBloques = conFecha
    .filter((b) => liberado(b) && vigente(b))
    .sort((a, b) =>
      (a.vence ?? "9999-12-31").localeCompare(b.vence ?? "9999-12-31"),
    );

  /*
   * `dias` YA es lo que queda del bloque.
   *
   * Viene de la hoja oficial, que descuenta sola lo tomado. Restar `usados`
   * encima lo contaría dos veces: a quien tenía 13 disponibles y 38 días
   * tomados en su historial le salían -34.
   *
   * `usados` se conserva porque es lo que permite enseñar "10 de 12" —lo
   * disponible sobre lo liberado— en vez de "10 de 10".
   *
   * Lo aprobado desde aquí (`usados`, calculado arriba) se resta encima, del
   * bloque que vence antes al que vence después: así se aprovechan primero los
   * que están por caducar, como hace el gestor de siempre.
   */
  const bloques = disponiblesBloques.map((b) => ({
    // `dias` viene ya descontado de la base; no hay nada que repartir encima.
    dias: b.dias,
    usados: b.gastado,
    vence: b.vence ?? "",
    periodo: String(b.periodo),
  }));

  const disponibles = bloques.reduce((n, b) => n + b.dias, 0);

  // Lo que todavía no se libera se anuncia aparte: son días que la persona ya
  // tiene ganados y conviene que sepa cuándo podrá tomarlos, pero que NO se
  // pueden pedir hoy.
  const liberaciones = conFecha
    .filter((b) => !liberado(b) && vigente(b))
    .sort((a, b) => (a.libera ?? "").localeCompare(b.libera ?? ""))
    .map((b) => ({
      dias: b.dias,
      fecha: b.libera ?? "",
      periodo: String(b.periodo),
    }));

  return {
    disponibles: Math.round(disponibles * 100) / 100,
    usados: Math.round(usadosMostrados * 100) / 100,
    bloques,
    liberaciones,
  };
});

/* ============================= TICKETS ================================== */

export type TicketView = {
  id: string;
  folio: string;
  title: string;
  category: string;
  priority: string;
  status: string;
  createdBy: string;
  problem: string | null;
  assignee: string | null;
  createdAt: string;
  updatedAt: string;
  events: { id: string; text: string; author: string; createdAt: string }[];
};

/**
 * El estado guardado, tal como lo rotula la pantalla.
 *
 * La base usa constantes sin acentos ni espacios (más cómodas para una
 * restricción CHECK y para consultar); la pantalla enseña el texto de siempre.
 * La traducción vive aquí para que ni una ni otra tengan que cambiar.
 */
const ESTADO_A_PANTALLA: Record<string, string> = {
  EN_REVISION: "En revisión",
  EN_PROCESO: "En proceso",
  RESUELTO: "Resuelto",
};

export function aEstadoTicket(estado: string): string {
  return ESTADO_A_PANTALLA[estado] ?? "En revisión";
}

/** El camino inverso: lo que dice la pantalla, a lo que acepta la base. */
export const PANTALLA_A_ESTADO: Record<string, string> = {
  "En revisión": "EN_REVISION",
  "En proceso": "EN_PROCESO",
  Resuelto: "RESUELTO",
};

export const loadTickets = cache(async function loadTickets(
  personaId?: string | null,
  /** Quien atiende el mantenimiento ve los de todo el equipo. */
  verTodos = false,
): Promise<TicketView[]> {
  if (!personaId) return [];

  const filas = await db.ticket.findMany({
    where: verTodos ? {} : { personaId },
    orderBy: { creadoEn: "desc" },
    // El histórico son cientos de incidencias ya cerradas; traerlas todas no
    // ayuda a quien está atendiendo hoy.
    take: 300,
    select: {
      id: true,
      numero: true,
      titulo: true,
      detalle: true,
      clase: true,
      falla: true,
      prioridad: true,
      estado: true,
      equipo: true,
      creadoEn: true,
      actualizadoEn: true,
      persona: { select: { nombre: true } },
      atendida: { select: { nombre: true } },
      eventos: {
        orderBy: { creadoEn: "asc" },
        select: {
          id: true,
          texto: true,
          creadoEn: true,
          persona: { select: { nombre: true } },
        },
      },
    },
  });

  return filas.map((t) => ({
    id: t.id,
    // El MISMO código que va a la hoja, al correo y a Dynamics: buscar un
    // ticket por su folio no puede depender de dónde se esté mirando.
    folio: folioDeTicket(t.clase, t.numero, t.creadoEn),
    title: t.titulo,
    category: t.clase ?? "SOFTWARE",
    priority: t.prioridad,
    status: aEstadoTicket(t.estado),
    createdBy: t.persona.nombre,
    problem: t.falla,
    assignee: t.atendida?.nombre ?? null,
    createdAt: t.creadoEn.toISOString(),
    updatedAt: t.actualizadoEn.toISOString(),
    events: t.eventos.map((e) => ({
      id: e.id,
      text: e.texto,
      // Sin persona es el propio sistema quien lo anotó (alta, cambio de
      // estado): así se distingue de lo que escribió alguien.
      author: e.persona?.nombre ?? "sistema",
      createdAt: e.creadoEn.toISOString(),
    })),
  }));
});
