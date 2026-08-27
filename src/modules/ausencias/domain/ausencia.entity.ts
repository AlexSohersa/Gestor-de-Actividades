// Módulo Ausencias · DOMINIO · Entidad y reglas.
//
// Vacaciones, permisos e incapacidades. Lógica pura y testeable.

import { diasHabiles } from "@/lib/fechas";

export const ESTADOS = ["PENDIENTE", "APROBADA", "RECHAZADA"] as const;
export type Estado = (typeof ESTADOS)[number];

/**
 * Los tipos de ausencia, con su comportamiento declarado.
 *
 * Esta tabla resuelve algo que en el gestor anterior estaba disperso: había
 * TRES formas distintas de preguntar "¿esto es vacaciones?" (una expresión
 * regular, una comparación exacta y otra en mayúsculas), y no siempre
 * coincidían. Aquí el tipo se normaliza una vez y todo lo demás lo consulta.
 */
export const TIPOS = [
  {
    clave: "VACACIONES",
    etiqueta: "Vacaciones",
    /// Descuenta del saldo de vacaciones acumulado.
    descuentaSaldo: true,
    /// No admite medias jornadas: un día de vacaciones es un día entero.
    soloDiaCompleto: true,
  },
  {
    clave: "PERMISO CON GOCE DE SUELDO",
    etiqueta: "Permiso con goce de sueldo",
    descuentaSaldo: false,
    soloDiaCompleto: false,
  },
  {
    clave: "PERMISO SIN GOCE DE SUELDO",
    etiqueta: "Permiso sin goce de sueldo",
    descuentaSaldo: false,
    soloDiaCompleto: false,
  },
  {
    clave: "INCAPACIDAD",
    etiqueta: "Incapacidad (IMSS)",
    descuentaSaldo: false,
    soloDiaCompleto: true,
  },
  {
    clave: "TIEMPO POR TIEMPO",
    etiqueta: "Tiempo por tiempo",
    descuentaSaldo: false,
    soloDiaCompleto: false,
  },
  {
    clave: "AUSENCIA SIN PAGA",
    etiqueta: "Ausencia sin paga",
    descuentaSaldo: false,
    soloDiaCompleto: false,
  },
] as const;

export type TipoAusencia = (typeof TIPOS)[number]["clave"];

/// Normaliza lo que venga (hoja, formulario, histórico) a una clave conocida.
/// Devuelve null si no se reconoce, para no inventar comportamiento.
export function normalizarTipo(valor: string): TipoAusencia | null {
  const limpio = valor.trim().toUpperCase();
  const exacto = TIPOS.find((t) => t.clave === limpio);
  if (exacto) return exacto.clave;

  // Las hojas escribieron "Vacaciones", "VACACIONES 2024", "vacacion"… Todas
  // son lo mismo y deben descontar del saldo.
  if (limpio.includes("VACACION")) return "VACACIONES";
  if (limpio.includes("INCAPACIDAD")) return "INCAPACIDAD";
  if (limpio.includes("TIEMPO POR TIEMPO")) return "TIEMPO POR TIEMPO";
  if (limpio.includes("SIN GOCE")) return "PERMISO SIN GOCE DE SUELDO";
  if (limpio.includes("CON GOCE")) return "PERMISO CON GOCE DE SUELDO";
  if (limpio.includes("SIN PAGA")) return "AUSENCIA SIN PAGA";

  return null;
}

export function definicionDe(tipo: string) {
  const clave = normalizarTipo(tipo);
  return TIPOS.find((t) => t.clave === clave) ?? null;
}

/// ¿Este tipo descuenta del saldo de vacaciones? Única fuente de verdad.
export function descuentaSaldo(tipo: string): boolean {
  return definicionDe(tipo)?.descuentaSaldo ?? false;
}

export interface Ausencia {
  id: string;
  personaId: string;
  personaNombre: string;
  tipo: string;
  fechaInicio: string; // AAAA-MM-DD
  fechaFin: string;
  medioDia: boolean;
  horas: number | null;
  motivo: string | null;
  estado: Estado;
  decididaPor: string | null;
  decididaPorNombre: string | null;
  decididaEn: Date | null;
  periodo: number | null;
  creadoEn: Date;
}

/**
 * Cuántos días laborales consume una ausencia.
 *
 * Una media jornada cuenta proporcionalmente a la jornada de esa persona: para
 * quien trabaja 5 h, ausentarse 2.5 h es medio día, no 2.5/8. El gestor
 * anterior dividía siempre entre 8, que penalizaba a las jornadas cortas.
 */
export function diasQueConsume(
  a: Pick<Ausencia, "fechaInicio" | "fechaFin" | "medioDia" | "horas">,
  jornada: number,
): number {
  if (a.medioDia && a.horas) {
    return Math.round((a.horas / jornada) * 100) / 100;
  }
  return diasHabiles(a.fechaInicio, a.fechaFin);
}

export type Validacion = { ok: true } | { ok: false; error: string };

export function validarSolicitud(args: {
  tipo: string;
  inicio: string;
  fin: string;
  horas: number | null;
  jornada: number;
  /// Días disponibles, solo relevante si el tipo descuenta saldo.
  disponibles: number;
}): Validacion {
  const { tipo, inicio, fin, horas, jornada, disponibles } = args;

  const definicion = definicionDe(tipo);
  if (!definicion) return { ok: false, error: "Elige un tipo de ausencia." };
  if (!inicio) return { ok: false, error: "Falta la fecha de inicio." };
  if (fin < inicio) {
    return { ok: false, error: "La fecha de fin es anterior a la de inicio." };
  }

  const medioDia = !definicion.soloDiaCompleto && horas !== null && horas < jornada;

  if (definicion.soloDiaCompleto && horas !== null && horas < jornada) {
    return {
      ok: false,
      error: `Las ${definicion.etiqueta.toLowerCase()} se piden por días completos.`,
    };
  }

  if (medioDia && (horas === null || horas <= 0)) {
    return { ok: false, error: "Indica cuántas horas te vas a ausentar." };
  }

  if (definicion.descuentaSaldo) {
    const consume = diasQueConsume(
      { fechaInicio: inicio, fechaFin: fin, medioDia, horas },
      jornada,
    );
    if (consume > disponibles) {
      return {
        ok: false,
        error:
          `Pides ${consume} día(s) y solo tienes ${disponibles} disponible(s). ` +
          `Revisa tu saldo antes de enviar la solicitud.`,
      };
    }
  }

  return { ok: true };
}

/// Solo se cancela lo que sigue pendiente: una vez decidida, el cambio lo hace
/// quien aprobó.
export function sePuedeCancelar(a: Pick<Ausencia, "estado">): boolean {
  return a.estado === "PENDIENTE";
}
