// Módulo Identidad · DOMINIO · Entidad y tipos.
//
// Capa de dominio: describe QUÉ es una persona para el Gestor, sin saber nada
// de Prisma, Next.js ni la base. Es TypeScript puro y testeable en aislamiento.
// La infraestructura convierte filas de core.persona a este tipo.

/// Los papeles que reconoce el Gestor, de mayor a menor privilegio. Son los
/// mismos de core.rol; aquí se tipan para tener seguridad en tiempo de
/// compilación.
export const ROLES = [
  "ADMIN",
  "DIRECCION",
  "COORDINADOR",
  "COLABORADOR",
  "LECTURA",
  "EXTERNO",
] as const;

export type Rol = (typeof ROLES)[number];

/// Jerarquía de cada papel — refleja core.rol.jerarquia. Sirve para comparar
/// "¿este papel manda más que aquel?" sin ir a la base.
export const JERARQUIA: Record<Rol, number> = {
  ADMIN: 100,
  DIRECCION: 90,
  COORDINADOR: 60,
  COLABORADOR: 30,
  LECTURA: 10,
  EXTERNO: 5,
};

/// Las secciones del Gestor. Se pueden ocultar por persona
/// (core.persona_rol.secciones_ocultas).
export const SECCIONES = [
  "actividad",
  "ausencias",
  "tickets",
  "equipo",
  "proyectos",
] as const;

export type Seccion = (typeof SECCIONES)[number];

/// La clave de esta herramienta en core.herramienta. Todo lo que consultamos de
/// permisos se filtra por ella: una persona puede ser COORDINADOR aquí y
/// COLABORADOR en Deal Engine.
export const HERRAMIENTA = "actividad" as const;

/**
 * La persona tal como la usa el Gestor.
 *
 * `id` es el de core.persona y es la ÚNICA identidad válida para escribir. El
 * correo sirve para entrar, no para identificar: cuatro personas usan su Gmail
 * en una herramienta y el correo de empresa en otra.
 */
export interface Persona {
  id: string;
  nombre: string;
  /// El nombre corto con el que aparece en las hojas de cálculo (MAYÚSCULAS).
  /// Es la clave con la que se importó el histórico.
  nombreUsuario: string | null;
  numero: string | null;
  puesto: string | null;
  area: string | null;
  /// Jornada diaria. NO es 8 para todos: hay jornadas de 4 y 5 horas.
  horasDia: number;
  fechaIngreso: Date | null;
  foto: string | null;
  coordinadorId: string | null;
  activo: boolean;
  esAdmin: boolean;
  /// Correo principal (el marcado en core.persona_correo).
  correo: string | null;
  /// Papel en ESTA herramienta.
  rol: Rol;
  /// Secciones que esta persona no debe ver.
  seccionesOcultas: Seccion[];
}

/// Quién aprueba ausencias y horas extra. Tener el papel no basta: además la
/// solicitud tiene que venir dirigida a esa persona (ver reglas del módulo).
export function puedeAprobar(p: Pick<Persona, "rol">): boolean {
  return p.rol === "COORDINADOR" || p.rol === "ADMIN" || p.rol === "DIRECCION";
}

/// Quién ve a toda la empresa y puede editar permisos: los administradores
/// marcados en core.persona.es_admin, y la dirección.
export function veToda(p: Pick<Persona, "esAdmin" | "rol">): boolean {
  return p.esAdmin || p.rol === "ADMIN" || p.rol === "DIRECCION";
}

/// ¿Esta persona puede ver esta sección?
export function veSeccion(
  p: Pick<Persona, "seccionesOcultas">,
  seccion: Seccion,
): boolean {
  return !p.seccionesOcultas.includes(seccion);
}

/// Normaliza un correo para buscarlo. La base guarda todo en minúsculas y
/// Google devuelve cosas como "A.Orozco@gruposohersa.com".
export function normalizarCorreo(correo: string): string {
  return correo.trim().toLowerCase();
}
