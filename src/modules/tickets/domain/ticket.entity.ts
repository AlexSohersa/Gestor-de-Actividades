// Módulo Tickets · DOMINIO · Entidad y reglas.
//
// El mantenimiento interno: software y hardware. Lógica pura.

export const ESTADOS = ["ABIERTO", "EN_PROCESO", "CERRADO"] as const;
export type Estado = (typeof ESTADOS)[number];

export const ETIQUETA_ESTADO: Record<Estado, string> = {
  ABIERTO: "Abierto",
  EN_PROCESO: "En proceso",
  CERRADO: "Resuelto",
};

export const CLASES = ["SOFTWARE", "HARDWARE"] as const;
export type Clase = (typeof CLASES)[number];

/**
 * Las fallas más comunes, tomadas del catálogo del gestor antiguo.
 *
 * Están aquí y no en la base porque son una lista corta y estable que sirve
 * para ORIENTAR: el campo admite texto libre, así que una falla nueva no
 * requiere tocar el código ni esperar a que alguien actualice un catálogo.
 */
export const FALLAS: Record<Clase, string[]> = {
  SOFTWARE: [
    "El sistema operativo no arranca",
    "Actualizaciones fallidas de Windows o la BIOS",
    "Las aplicaciones no funcionan o se cierran solas",
    "Problemas con licencias",
    "Lentitud general del equipo",
    "Problemas con el correo",
  ],
  HARDWARE: [
    "El equipo no enciende",
    "Pantalla congelada o con artefactos",
    "Fallas en la conexión a internet",
    "Teclado, ratón o periféricos",
    "Ruido o sobrecalentamiento",
    "Batería o cargador",
  ],
};

export interface Ticket {
  id: string;
  personaId: string;
  personaNombre: string;
  titulo: string;
  detalle: string | null;
  clase: string | null;
  falla: string | null;
  estado: Estado;
  atendidoPor: string | null;
  atendidoPorNombre: string | null;
  creadoEn: Date;
  cerradoEn: Date | null;
}

export type Validacion = { ok: true } | { ok: false; error: string };

export function validarTicket(datos: {
  titulo: string;
  clase: string;
  detalle: string;
}): Validacion {
  if (!datos.titulo.trim()) {
    return { ok: false, error: "Describe brevemente el problema." };
  }
  if (!(CLASES as readonly string[]).includes(datos.clase)) {
    return { ok: false, error: "Indica si es de software o de hardware." };
  }
  if (!datos.detalle.trim()) {
    return {
      ok: false,
      error:
        "Cuenta qué pasa con algo más de detalle: sin eso, quien lo atienda " +
        "tiene que volver a preguntarte.",
    };
  }
  return { ok: true };
}

/// El siguiente estado razonable, para el botón de avanzar.
export function siguienteEstado(actual: Estado): Estado | null {
  if (actual === "ABIERTO") return "EN_PROCESO";
  if (actual === "EN_PROCESO") return "CERRADO";
  return null;
}

export function estaAbierto(t: Pick<Ticket, "estado">): boolean {
  return t.estado !== "CERRADO";
}
