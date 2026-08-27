/**
 * Las secciones del Gestor de Actividad.
 *
 * Fuente única de verdad para la navegación: el menú lateral, los títulos de
 * cada pantalla y los estados vacíos salen todos de aquí. Añadir una sección es
 * añadir una entrada a este archivo y crear su carpeta en `src/app/(app)`.
 *
 * Mantiene la forma que ya tenía en la plataforma para que el menú y las
 * pantallas copiadas funcionen sin retocarse; lo que cambia es que aquí solo
 * viven las cinco secciones de esta herramienta.
 */
export type SectionStatus = "live" | "preparing";

export type SectionId =
  | "actividad"
  | "ausencias"
  | "tickets"
  | "proyectos"
  | "equipo";

export type Section = {
  id: SectionId;
  /** Etiqueta del menú. Corta: compite por el ancho con el contador. */
  label: string;
  /** Ruta real de Next.js. Cada sección es una pantalla, no un ancla. */
  href: string;
  /** Título de la pantalla, cuando difiere de la etiqueta del menú. */
  title?: string;
  /** Qué encuentra la persona ahí dentro. */
  description: string;
  status: SectionStatus;
  /** Acento del área, del eje verde→azul del manual. */
  accent: string;
  /** Grupo del menú. Las de `undefined` van arriba, sin encabezado. */
  group?: "Tu trabajo" | "La empresa";
  /** Lo que vivirá aquí, para el estado vacío de las secciones en preparación. */
  planned?: string[];
  /** Solo la ven quienes administran. El resto ni siquiera la tiene en el menú. */
  soloAdmin?: boolean;
};

export const SECTIONS: Section[] = [
  /* ------------------------------------------------------- tu trabajo --- */
  {
    id: "actividad",
    label: "Gestor de actividad",
    href: "/actividad",
    title: "Gestor de actividad",
    description: "Registra y consulta el tiempo dedicado a tus proyectos",
    status: "live",
    accent: "var(--cv-sky)",
    group: "Tu trabajo",
    planned: [
      "Reporte de horas por proyecto",
      "Registro de horas extra",
      "Resumen semanal y mensual",
      "Aprobación de tu líder",
    ],
  },
  {
    id: "ausencias",
    label: "Ausencias",
    href: "/ausencias",
    title: "Solicitudes de ausencias",
    description: "Vacaciones, permisos e incapacidades",
    status: "live",
    accent: "var(--cv-teal)",
    group: "Tu trabajo",
    planned: [
      "Solicitud de vacaciones",
      "Permisos y días económicos",
      "Saldo de días disponibles",
      "Historial de tus solicitudes",
    ],
  },
  {
    id: "tickets",
    label: "Tickets",
    href: "/tickets",
    title: "Tickets de mantenimiento",
    description: "Reporta y da seguimiento a solicitudes internas",
    status: "live",
    accent: "var(--cv-sea)",
    group: "Tu trabajo",
    planned: [
      "Levantar un ticket",
      "Seguimiento de tus reportes",
      "Equipo y sitio afectado",
      "Historial de mantenimientos",
    ],
  },
  {
    id: "equipo",
    label: "Permisos",
    href: "/equipo",
    title: "Permisos del gestor",
    description: "Quién aprueba ausencias y horas extra",
    status: "live",
    accent: "var(--cv-teal)",
    group: "Tu trabajo",
    soloAdmin: true,
  },

  /* -------------------------------------------------------- la empresa -- */
  {
    id: "proyectos",
    label: "Estatus de proyectos",
    href: "/proyectos",
    title: "Estatus de proyectos",
    description: "Seguimiento visual de los proyectos en los que participas",
    status: "live",
    accent: "var(--cv-sky)",
    group: "La empresa",
    planned: [
      "Avance por proyecto",
      "Responsables y fechas clave",
      "Alertas de retraso",
      "Vista por cliente",
    ],
  },
];

export function sectionById(id: SectionId): Section | undefined {
  return SECTIONS.find((s) => s.id === id);
}

/**
 * Las secciones que ve una persona.
 *
 * Dos filtros distintos, a propósito:
 *
 *  - `soloAdmin` es del código: Permisos no se le puede conceder a nadie que
 *    no administre, por mucho que alguien lo marque en la pantalla.
 *  - `ocultas` es de la base: lo que quien administra decidió esconderle a
 *    esta persona en concreto.
 *
 * Se guarda lo oculto y no lo permitido, así que quien no se ha tocado nunca ve
 * todo, y una sección nueva aparece para todos sin configurar a nadie.
 */
export function seccionesVisibles(
  esAdmin: boolean,
  ocultas: readonly string[] = [],
): Section[] {
  return SECTIONS.filter(
    (s) => (!s.soloAdmin || esAdmin) && !ocultas.includes(s.id),
  );
}

/** `true` si esa persona puede abrir esa sección. */
export function puedeVer(
  id: SectionId,
  esAdmin: boolean,
  ocultas: readonly string[] = [],
): boolean {
  const s = sectionById(id);
  if (!s) return true;
  return (!s.soloAdmin || esAdmin) && !ocultas.includes(s.id);
}

/** Las secciones que se pueden ocultar a alguien desde la pantalla de permisos. */
export const OCULTABLES = SECTIONS.filter((s) => !s.soloAdmin);

/**
 * La sección a la que corresponde una ruta.
 *
 * Compara por prefijo para que una subruta siga marcando su sección como
 * activa en el menú.
 */
export function sectionByPath(pathname: string): Section | undefined {
  return SECTIONS.find(
    (s) => pathname === s.href || pathname.startsWith(s.href + "/"),
  );
}
