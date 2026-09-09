"use server";

/**
 * El checador: entrada, comida y salida, en oficina o en casa.
 *
 * Una fila por persona y día, con la restricción de unicidad que ya tenía
 * `actividad.checada`: no hay forma de acabar con dos filas del mismo día por
 * mucho que se pulse dos veces seguidas.
 *
 * La modalidad se elige al abrir el día y vale para todas las marcas: quien
 * empieza en casa no tiene que repetirlo al salir a comer.
 *
 * A la hoja `CHECK HO` siguen yendo solo la entrada y la salida, más la
 * modalidad en su columna: la comida vive en la base, donde hay sitio.
 */

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import { exigirPersona } from "@/modules/identidad/infrastructure/wiring";
import { aFechaDia, hoyEnMexico, horaEnMexico } from "@/lib/fechas";
import { sincronizarEnSegundoPlano } from "@/lib/google/sincronizar";

/**
 * A partir de esta hora, el primer toque del día cuenta como SALIDA.
 *
 * 15.5 = las 3:30 de la tarde, el mismo corte del Gestor de siempre: a esa
 * hora ya se trabajó el día, así que quien pulsa por primera vez está
 * cerrando, no abriendo.
 */
const CORTE_TARDE = 15.5;

/** La zona de la empresa. */
const ZONA = "America/Mexico_City";

/**
 * La hora de México como número decimal (16:45 → 16.75).
 *
 * Se saca de la zona de la empresa y no del reloj del servidor: en producción
 * Node corre en UTC, y sin fijarla el corte de las 3:30 se dispararía seis
 * horas antes de tiempo.
 */
function horaDecimalMexico(d: Date): number {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONA,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);

  const v = (t: string) => Number(p.find((x) => x.type === t)?.value ?? 0);
  return v("hour") + v("minute") / 60;
}

/** Los cuatro momentos que se pueden marcar en un día. */
export type Marca = "entrada" | "comidaInicio" | "comidaFin" | "salida";

/** Dónde se trabajó: se elige al abrir el día y vale para todas las marcas. */
export type Modalidad = "OFICINA" | "HOME_OFFICE";

export type EstadoHO = {
  /** Hora de cada marca de hoy, si ya se hizo. */
  entrada: string | null;
  comidaInicio: string | null;
  comidaFin: string | null;
  salida: string | null;
  /** Dónde, elegido al marcar la entrada. */
  modalidad: Modalidad | null;
  /** Qué toca ahora; `cerrado` cuando el día ya terminó. */
  siguiente: Marca | "cerrado";
};

export type ResultadoHO = {
  ok: boolean;
  tipo?: Marca;
  hora?: string;
  error?: string;
};

/**
 * Qué marca toca según lo que ya se hizo.
 *
 * El orden es el del día: se entra, se sale a comer, se vuelve y se cierra.
 * La comida se puede saltar —quien no sale a comer pulsa directamente la
 * salida—, así que no bloquea el cierre.
 */
function siguienteMarca(f: {
  entrada: Date | null;
  comidaInicio: Date | null;
  comidaFin: Date | null;
  salida: Date | null;
}): Marca | "cerrado" {
  if (f.salida) return "cerrado";
  if (!f.entrada) return "entrada";
  if (f.comidaInicio && !f.comidaFin) return "comidaFin";
  return "salida";
}

export async function estadoHomeOffice(): Promise<EstadoHO> {
  const persona = await exigirPersona();

  // El día se saca de la zona de la empresa y no de la del servidor: en
  // producción el servidor va en UTC y a las 7 de la tarde en Guadalajara ya
  // sería el día siguiente, así que la checada caería en la fecha equivocada.
  const hoy = hoyEnMexico();

  const fila = await db.checada.findUnique({
    where: {
      personaId_fecha: { personaId: persona.id, fecha: aFechaDia(hoy) },
    },
    select: {
      entrada: true,
      salida: true,
      comidaInicio: true,
      comidaFin: true,
      modalidad: true,
    },
  });

  if (!fila) {
    // Sin nada marcado, lo que toca depende de la hora: pasado el corte se
    // ofrece cerrar en vez de abrir.
    const esTarde = horaDecimalMexico(new Date()) >= CORTE_TARDE;
    return {
      entrada: null,
      comidaInicio: null,
      comidaFin: null,
      salida: null,
      modalidad: null,
      siguiente: esTarde ? "salida" : "entrada",
    };
  }

  return {
    entrada: fila.entrada ? horaEnMexico(fila.entrada) : null,
    comidaInicio: fila.comidaInicio ? horaEnMexico(fila.comidaInicio) : null,
    comidaFin: fila.comidaFin ? horaEnMexico(fila.comidaFin) : null,
    salida: fila.salida ? horaEnMexico(fila.salida) : null,
    modalidad: (fila.modalidad as Modalidad | null) ?? null,
    siguiente: siguienteMarca(fila),
  };
}

/**
 * Registra una marca.
 *
 * `modalidad` solo se usa al abrir el día: a partir de ahí vale la que se
 * eligió, y las demás marcas no vuelven a preguntar.
 */
export async function checarHomeOffice(
  marca?: Marca,
  modalidad?: Modalidad,
): Promise<ResultadoHO> {
  const persona = await exigirPersona();

  const hoy = hoyEnMexico();
  const dia = aFechaDia(hoy);
  const ahora = new Date();

  const fila = await db.checada.findUnique({
    where: { personaId_fecha: { personaId: persona.id, fecha: dia } },
    select: {
      entrada: true,
      salida: true,
      comidaInicio: true,
      comidaFin: true,
      modalidad: true,
    },
  });

  // ── Primer toque del día ────────────────────────────────────────────────
  //
  // Se guarda el INSTANTE exacto (timestamptz), no la hora suelta: el último
  // domingo de octubre la 01:30 ocurre dos veces y una hora sin zona no sabe
  // cuál de las dos es.
  if (!fila) {
    // Pasado el corte se registra como SALIDA directamente, sin entrada: a las
    // cuatro de la tarde nadie está empezando su jornada.
    const esSalida =
      marca === "salida" || horaDecimalMexico(ahora) >= CORTE_TARDE;

    if (!esSalida && !modalidad) {
      return { ok: false, error: "Elige si estás en la oficina o en casa." };
    }

    await db.checada.create({
      data: {
        id: randomUUID(),
        personaId: persona.id,
        fecha: dia,
        entrada: esSalida ? null : ahora,
        salida: esSalida ? ahora : null,
        modalidad: modalidad ?? null,
      },
    });

    // Sube ya: la fila aparece en la hoja al momento, y las marcas siguientes
    // actualizarán esa misma fila.
    sincronizarEnSegundoPlano();
    revalidatePath("/actividad");
    return {
      ok: true,
      tipo: esSalida ? "salida" : "entrada",
      hora: horaEnMexico(ahora),
    };
  }

  // ── El día ya está cerrado ──────────────────────────────────────────────
  if (fila.salida) {
    return {
      ok: false,
      error: `Ya cerraste el día a las ${horaEnMexico(fila.salida)}.`,
    };
  }

  /*
   * Qué se está marcando.
   *
   * Se acepta lo que pide la pantalla, pero se comprueba contra el estado
   * real: es una acción de servidor y puede llegar cualquier cosa. Sin
   * `marca` se toma lo que toque, que es lo que hacía el botón antiguo.
   */
  const toca = siguienteMarca(fila);
  const queHacer: Marca = marca ?? (toca === "cerrado" ? "salida" : toca);

  if (queHacer === "entrada") {
    return { ok: false, error: "Ya marcaste tu entrada." };
  }
  if (queHacer === "comidaInicio" && fila.comidaInicio) {
    return {
      ok: false,
      error: `Ya saliste a comer a las ${horaEnMexico(fila.comidaInicio)}.`,
    };
  }
  if (queHacer === "comidaFin" && !fila.comidaInicio) {
    return { ok: false, error: "Primero marca tu salida a comer." };
  }

  const campo =
    queHacer === "comidaInicio"
      ? { comidaInicio: ahora }
      : queHacer === "comidaFin"
        ? { comidaFin: ahora }
        : { salida: ahora };

  await db.checada.update({
    where: { personaId_fecha: { personaId: persona.id, fecha: dia } },
    // Solo la salida vuelve a la hoja: la comida no tiene columna propia allí.
    data: { ...campo, sheetSync: "pendiente" },
  });

  sincronizarEnSegundoPlano();
  revalidatePath("/actividad");
  return { ok: true, tipo: queHacer, hora: horaEnMexico(ahora) };
}
