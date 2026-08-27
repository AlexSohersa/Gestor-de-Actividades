"use server";

import { revalidatePath } from "next/cache";
import {
  aCargoDeWired,
  exigirSeccion,
} from "@/modules/identidad/infrastructure/wiring";
import { puedeAprobar } from "@/modules/identidad/domain/persona.entity";
import {
  cancelarAusenciaWired,
  decidirAusenciaWired,
  solicitarAusenciaWired,
} from "@/modules/ausencias/infrastructure/wiring";
import { hoyEnMexico } from "@/lib/fechas";

export async function solicitarAusencia(datos: {
  tipo: string;
  inicio: string;
  fin: string;
  horas: number | null;
  motivo: string | null;
}) {
  const persona = await exigirSeccion("ausencias");

  const r = await solicitarAusenciaWired({
    personaId: persona.id,
    jornada: persona.horasDia,
    hoyISO: hoyEnMexico(),
    ...datos,
  });

  if (r.ok) revalidatePath("/ausencias");
  return r;
}

export async function cancelarAusencia(id: string) {
  const persona = await exigirSeccion("ausencias");
  const r = await cancelarAusenciaWired(id, persona.id);
  if (r.ok) revalidatePath("/ausencias");
  return r;
}

export async function decidirAusencia(
  id: string,
  decision: "APROBADA" | "RECHAZADA",
) {
  const persona = await exigirSeccion("ausencias");

  // Quién tiene a cargo se resuelve aquí, en el servidor, a partir del padrón:
  // así una solicitud ajena no se puede aprobar aunque se conozca su id.
  const aCargo = await aCargoDeWired(persona.id);

  const r = await decidirAusenciaWired({
    id,
    decisorId: persona.id,
    puedeAprobar: puedeAprobar(persona),
    decision,
    aCargo,
  });

  if (r.ok) revalidatePath("/ausencias");
  return r;
}
