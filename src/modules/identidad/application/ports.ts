// Módulo Identidad · APLICACIÓN · Ports (contratos).
//
// Los "ports" son las interfaces que la capa de aplicación necesita para hacer
// su trabajo. La aplicación depende de ESTAS interfaces, no de Prisma. La capa
// de infraestructura las implementa. Esto es lo que hace al módulo testeable:
// en una prueba se le pasa un repositorio falso sin tocar la base.

import type { Persona, Rol, Seccion } from "../domain/persona.entity";

/// Un miembro del equipo tal como se lista en la pantalla /equipo.
export interface MiembroEquipo extends Persona {
  /// Nombre de quien le aprueba (resuelto desde coordinadorId).
  coordinadorNombre: string | null;
  ultimaVez: Date | null;
  visitas: number;
}

/// Cambios que un administrador puede hacer sobre un miembro.
export interface CambioPermiso {
  rol?: Rol;
  coordinadorId?: string | null;
  activo?: boolean;
  esAdmin?: boolean;
  /// Las secciones que SÍ debe ver. El repositorio guarda el complemento, para
  /// que una sección nueva la vea todo el mundo por omisión.
  seccionesVisibles?: Seccion[];
}

export interface PersonaRepository {
  /**
   * Busca a la persona por CUALQUIERA de sus correos.
   *
   * Es la única forma correcta de resolver identidad: el correo de la sesión de
   * Google puede ser el de empresa o un Gmail, y ambos apuntan a la misma
   * persona en core.persona_correo.
   */
  porCorreo(correo: string): Promise<Persona | null>;

  porId(id: string): Promise<Persona | null>;

  /// Todo el equipo activo, para la pantalla de permisos.
  listarEquipo(): Promise<MiembroEquipo[]>;

  /// Quiénes pueden recibir una solicitud de ausencia u horas extra.
  listarAprobadores(): Promise<Array<Pick<Persona, "id" | "nombre" | "correo">>>;

  /**
   * Los ids de la gente a cargo de un coordinador.
   *
   * Es lo que decide sobre qué solicitudes puede actuar: tener el papel de
   * coordinador no alcanza, la solicitud tiene que ser de alguien de su equipo.
   */
  aCargoDe(coordinadorId: string): Promise<string[]>;

  /// Aplica un cambio de permisos y deja rastro en core.bitacora_permiso.
  cambiarPermiso(
    personaId: string,
    cambio: CambioPermiso,
    hechoPor: string,
  ): Promise<void>;

  /// Cuántos administradores activos quedan aparte de este. Sirve para no
  /// dejar la plataforma sin nadie que pueda administrarla.
  contarAdminsExcepto(personaId: string): Promise<number>;

  /// Registra la visita a esta herramienta (core.acceso).
  registrarVisita(personaId: string): Promise<void>;
}
