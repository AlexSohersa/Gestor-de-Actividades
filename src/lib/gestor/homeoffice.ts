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
 * Qué marca SUGIERE la pantalla, para resaltarla.
 *
 * Es una sugerencia, no una regla: se puede marcar cualquiera en cualquier
 * momento. Quien olvidó apuntar su comida a media mañana tiene que poder
 * hacerlo después sin que el sistema se lo impida.
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
    /*
     * Se registra LA MARCA QUE SE PIDIÓ, sea cual sea.
     *
     * Sin marca explícita se decide por la hora: pasado el corte de las 3:30
     * el primer toque es una SALIDA, porque a esa hora nadie está empezando
     * su jornada. Es la regla del gestor de siempre.
     */
    const primera: Marca =
      marca ?? (horaDecimalMexico(ahora) >= CORTE_TARDE ? "salida" : "entrada");

    await db.checada.create({
      data: {
        id: randomUUID(),
        personaId: persona.id,
        fecha: dia,
        entrada: primera === "entrada" ? ahora : null,
        comidaInicio: primera === "comidaInicio" ? ahora : null,
        comidaFin: primera === "comidaFin" ? ahora : null,
        salida: primera === "salida" ? ahora : null,
        modalidad: modalidad ?? null,
      },
    });

    // Sube ya: la fila aparece en la hoja al momento, y las marcas siguientes
    // actualizarán esa misma fila.
    sincronizarEnSegundoPlano();
    revalidatePath("/actividad");
    return { ok: true, tipo: primera, hora: horaEnMexico(ahora) };
  }

  /*
   * La modalidad se guarda en cuanto llega, aunque el día ya estuviera
   * abierto: quien marcó primero por el corte de la tarde y luego eligió
   * dónde no debe quedarse sin ese dato.
   */
  if (modalidad && !fila.modalidad) {
    await db.checada.update({
      where: { personaId_fecha: { personaId: persona.id, fecha: dia } },
      data: { modalidad },
    });
  }

  /*
   * Haber marcado la salida NO cierra el día para las demás marcas.
   *
   * Es justo el caso de quien se acuerda al final: cierra, y entonces cae en
   * que no había apuntado la comida. Impedirlo lo dejaría sin forma de
   * completar su jornada.
   */

  /*
   * Qué se está marcando. SIN orden obligatorio.
   *
   * Se puede registrar cualquier momento en cualquier instante: quien olvidó
   * marcar su comida la apunta al volver, y quien empieza el día con la salida
   * —porque llegó tarde a la herramienta— también puede.
   *
   * Lo único que se impide es PISAR una marca que ya tiene hora: eso no sería
   * corregir, sería perder el dato original sin avisar.
   */
  const toca = siguienteMarca(fila);
  const queHacer: Marca = marca ?? (toca === "cerrado" ? "salida" : toca);

  const yaTiene =
    queHacer === "entrada"
      ? fila.entrada
      : queHacer === "comidaInicio"
        ? fila.comidaInicio
        : queHacer === "comidaFin"
          ? fila.comidaFin
          : fila.salida;

  if (yaTiene) {
    const como = {
      entrada: "tu entrada",
      comidaInicio: "tu salida a comer",
      comidaFin: "tu regreso de comer",
      salida: "tu salida",
    }[queHacer];
    return {
      ok: false,
      error: `Ya registraste ${como} a las ${horaEnMexico(yaTiene)}.`,
    };
  }

  const campo =
    queHacer === "entrada"
      ? { entrada: ahora }
      : queHacer === "comidaInicio"
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
