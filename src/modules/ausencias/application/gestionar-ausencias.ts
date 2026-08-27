// Módulo Ausencias · APLICACIÓN · Casos de uso.

import {
  definicionDe,
  descuentaSaldo,
  diasQueConsume,
  sePuedeCancelar,
  validarSolicitud,
  type Ausencia,
} from "../domain/ausencia.entity";
import {
  calcularSaldo,
  periodoQueSeConsume,
  type Saldo,
} from "../domain/saldo.rules";
import type { AusenciaRepository } from "./ports";

export interface Resultado {
  ok: boolean;
  error?: string;
}

export interface VistaAusencias {
  mias: Ausencia[];
  porAprobar: Ausencia[];
  saldo: Saldo;
}

/**
 * Todo lo que la pantalla necesita.
 *
 * `puedeAprobar` decide si se consultan las pendientes ajenas: para la mayoría
 * de la gente esa consulta no devolvería nada y no vale la pena hacerla.
 */
export async function verAusencias(
  repo: AusenciaRepository,
  args: {
    personaId: string;
    jornada: number;
    puedeAprobar: boolean;
    hoyISO: string;
  },
): Promise<VistaAusencias> {
  const { personaId, jornada, puedeAprobar, hoyISO } = args;

  const [mias, bloques, consumidos, porAprobar] = await Promise.all([
    repo.listarDe(personaId),
    repo.bloquesDe(personaId),
    repo.diasConsumidos(personaId, jornada),
    puedeAprobar ? repo.pendientesDe(personaId) : Promise.resolve([]),
  ]);

  return {
    mias,
    porAprobar,
    saldo: calcularSaldo(bloques, consumidos, hoyISO),
  };
}

export async function solicitarAusencia(
  repo: AusenciaRepository,
  args: {
    personaId: string;
    jornada: number;
    hoyISO: string;
    tipo: string;
    inicio: string;
    fin: string;
    horas: number | null;
    motivo: string | null;
  },
): Promise<Resultado & { id?: string }> {
  const { personaId, jornada, hoyISO, tipo, inicio, fin, horas, motivo } = args;

  const definicion = definicionDe(tipo);
  if (!definicion) return { ok: false, error: "Elige un tipo de ausencia." };

  const [bloques, consumidos] = await Promise.all([
    repo.bloquesDe(personaId),
    repo.diasConsumidos(personaId, jornada),
  ]);
  const saldo = calcularSaldo(bloques, consumidos, hoyISO);

  const validacion = validarSolicitud({
    tipo,
    inicio,
    fin: fin || inicio,
    horas,
    jornada,
    disponibles: saldo.disponibles,
  });
  if (!validacion.ok) return { ok: false, error: validacion.error };

  // Las vacaciones se piden por días completos; el resto admite media jornada.
  const medioDia =
    !definicion.soloDiaCompleto && horas !== null && horas < jornada;

  const id = await repo.crear({
    personaId,
    tipo: definicion.clave,
    fechaInicio: inicio,
    fechaFin: fin || inicio,
    medioDia,
    horas: medioDia ? horas : null,
    motivo: motivo?.trim() || null,
    // De qué periodo saldrán los días, para poder explicarlo después.
    periodo: definicion.descuentaSaldo ? periodoQueSeConsume(saldo) : null,
  });

  return { ok: true, id };
}

/**
 * Aprobar o rechazar.
 *
 * Dos comprobaciones y las dos importan: que quien decide tenga el papel, y que
 * la solicitud sea de alguien a su cargo. Tener el papel no basta — si no, un
 * coordinador podría decidir sobre gente de otro equipo.
 */
export async function decidirAusencia(
  repo: AusenciaRepository,
  args: {
    id: string;
    decisorId: string;
    puedeAprobar: boolean;
    decision: "APROBADA" | "RECHAZADA";
    /// Ids de la gente a cargo de quien decide.
    aCargo: string[];
  },
): Promise<Resultado> {
  const { id, decisorId, puedeAprobar, decision, aCargo } = args;

  if (!puedeAprobar) {
    return { ok: false, error: "No tienes permiso para aprobar ausencias." };
  }

  const ausencia = await repo.porId(id);
  if (!ausencia) return { ok: false, error: "Esa solicitud ya no existe." };

  if (ausencia.personaId === decisorId) {
    return { ok: false, error: "No puedes decidir sobre tu propia solicitud." };
  }

  if (!aCargo.includes(ausencia.personaId)) {
    return {
      ok: false,
      error: "Esa solicitud no es de alguien a tu cargo.",
    };
  }

  const cambiada = await repo.decidir(id, decision, decisorId);
  if (!cambiada) {
    return { ok: false, error: "Esa solicitud ya había sido decidida." };
  }

  return { ok: true };
}

export async function cancelarAusencia(
  repo: AusenciaRepository,
  id: string,
  personaId: string,
): Promise<Resultado> {
  const ausencia = await repo.porId(id);
  if (!ausencia) return { ok: false, error: "Esa solicitud ya no existe." };

  if (!sePuedeCancelar(ausencia)) {
    return {
      ok: false,
      error: "Ya fue decidida: pídele el cambio a quien la aprobó.",
    };
  }

  const cancelada = await repo.cancelar(id, personaId);
  if (!cancelada) return { ok: false, error: "No se pudo cancelar." };

  return { ok: true };
}

/// Reexportado para que la capa de presentación no tenga que importar del
/// dominio directamente.
export { descuentaSaldo, diasQueConsume };
