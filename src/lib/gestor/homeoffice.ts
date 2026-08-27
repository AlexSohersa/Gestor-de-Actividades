"use server";

/**
 * La checada de home office: una entrada y una salida por persona y día.
 *
 * Conserva la firma que tenía en la plataforma porque el botón se copió sin
 * tocar. Por dentro escribe en `actividad.checada`, que ya tiene la restricción
 * de unicidad por (persona, día): no hay forma de acabar con dos filas del
 * mismo día por mucho que se pulse dos veces seguidas.
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

export type EstadoHO = {
  /** Hora de entrada de hoy, si ya se marcó. */
  entrada: string | null;
  /** Hora de salida de hoy, si ya se marcó. */
  salida: string | null;
  /** Qué haría el botón ahora mismo. */
  siguiente: "entrada" | "salida" | "cerrado";
};

export type ResultadoHO = {
  ok: boolean;
  /** Qué se acaba de marcar. */
  tipo?: "entrada" | "salida";
  hora?: string;
  error?: string;
};

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
    select: { entrada: true, salida: true },
  });

  if (!fila) {
    // Sin nada marcado, lo que toca depende de la hora: pasado el corte el
    // botón ya ofrece "Marcar salida" en vez de "Marcar entrada".
    const esTarde = horaDecimalMexico(new Date()) >= CORTE_TARDE;
    return {
      entrada: null,
      salida: null,
      siguiente: esTarde ? "salida" : "entrada",
    };
  }

  return {
    entrada: fila.entrada ? horaEnMexico(fila.entrada) : null,
    salida: fila.salida ? horaEnMexico(fila.salida) : null,
    // Con la salida puesta el día está cerrado, tenga entrada o no: quien
    // marcó por primera vez después del corte no tiene entrada y ya terminó.
    siguiente: fila.salida ? "cerrado" : "salida",
  };
}

export async function checarHomeOffice(): Promise<ResultadoHO> {
  const persona = await exigirPersona();

  const hoy = hoyEnMexico();
  const dia = aFechaDia(hoy);
  const ahora = new Date();

  const fila = await db.checada.findUnique({
    where: { personaId_fecha: { personaId: persona.id, fecha: dia } },
    select: { entrada: true, salida: true },
  });

  // ── Primer toque del día ────────────────────────────────────────────────
  //
  // Se guarda el INSTANTE exacto (timestamptz), no la hora suelta: el último
  // domingo de octubre la 01:30 ocurre dos veces y una hora sin zona no sabe
  // cuál de las dos es.
  if (!fila) {
    // Pasado el corte se registra como SALIDA directamente, sin entrada: a las
    // cuatro de la tarde nadie está empezando su jornada.
    const esSalida = horaDecimalMexico(ahora) >= CORTE_TARDE;

    await db.checada.create({
      data: {
        id: randomUUID(),
        personaId: persona.id,
        fecha: dia,
        entrada: esSalida ? null : ahora,
        salida: esSalida ? ahora : null,
      },
    });

    // Sube ya: la fila aparece en la hoja al momento, y el siguiente toque
    // actualizará esa misma fila.
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

  // ── Segundo toque: cierra el día ────────────────────────────────────────
  await db.checada.update({
    where: { personaId_fecha: { personaId: persona.id, fecha: dia } },
    data: { salida: ahora, sheetSync: "pendiente" },
  });

  sincronizarEnSegundoPlano();
  revalidatePath("/actividad");
  return { ok: true, tipo: "salida", hora: horaEnMexico(ahora) };
}
