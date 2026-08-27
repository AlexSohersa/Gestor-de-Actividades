"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Clock,
  CalendarDays,
  LifeBuoy,
  Users,
  Radar,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
} from "lucide-react";
import { GestorLogo } from "@/components/brand/GestorLogo";
import type { Seccion } from "@/modules/identidad/domain/persona.entity";

interface Entrada {
  seccion: Seccion;
  etiqueta: string;
  href: string;
  icono: React.ElementType;
  /** Solo para quien administra (ve a toda la empresa). */
  soloAdmin?: boolean;
}

interface Grupo {
  titulo?: string;
  entradas: Entrada[];
}

/**
 * El menú del Gestor. Cada entrada declara su `seccion` para que el filtro por
 * permisos sea el mismo dato que usa `exigirSeccion` en el servidor: ocultar el
 * enlace y bloquear la ruta no pueden divergir.
 */
const MENU: Grupo[] = [
  {
    titulo: "Mi trabajo",
    entradas: [
      { seccion: "actividad", etiqueta: "Actividad", href: "/actividad", icono: Clock },
      { seccion: "ausencias", etiqueta: "Ausencias", href: "/ausencias", icono: CalendarDays },
      { seccion: "tickets", etiqueta: "Tickets", href: "/tickets", icono: LifeBuoy },
    ],
  },
  {
    titulo: "Seguimiento",
    entradas: [
      { seccion: "proyectos", etiqueta: "Estatus de proyectos", href: "/proyectos", icono: Radar },
    ],
  },
  {
    titulo: "Administración",
    entradas: [
      { seccion: "equipo", etiqueta: "Equipo y permisos", href: "/equipo", icono: Users, soloAdmin: true },
    ],
  },
];

interface Props {
  seccionesOcultas: Seccion[];
  esAdmin: boolean;
  /** URL del portal, para ir al resto de herramientas. */
  urlPortal?: string;
}

export function AppSidebar({ seccionesOcultas, esAdmin, urlPortal }: Props) {
  const pathname = usePathname();
  const [plegado, setPlegado] = useState(false);

  const grupos = MENU.map((g) => ({
    ...g,
    entradas: g.entradas.filter((e) => {
      if (e.soloAdmin && !esAdmin) return false;
      return !seccionesOcultas.includes(e.seccion);
    }),
  })).filter((g) => g.entradas.length > 0);

  function esActiva(href: string): boolean {
    return pathname === href || pathname.startsWith(href + "/");
  }

  return (
    <aside
      style={{
        width: plegado ? "64px" : "240px",
        background: "var(--soh-nav-bg)",
        borderRight: "1px solid var(--soh-nav-border)",
        transition: "width 200ms ease",
        display: "flex",
        flexDirection: "column",
        flexShrink: 0,
      }}
    >
      {/* ── Marca ──────────────────────────────────────────────────── */}
      <div
        className="flex items-center h-16 px-4 shrink-0"
        style={{ borderBottom: "1px solid var(--soh-nav-border)" }}
      >
        <Link
          href="/actividad"
          className="flex items-center gap-3 min-w-0 flex-1"
          title="SOHERSA · Gestor de Actividad"
        >
          <GestorLogo size={plegado ? 34 : 38} giro="idle" className="shrink-0" />
          {!plegado && (
            <div className="min-w-0">
              <p
                className="soh-wordmark text-[10px] truncate"
                style={{ color: "var(--soh-accent)" }}
              >
                Sohersa
              </p>
              <p
                className="soh-display text-[15px] leading-tight truncate"
                style={{ color: "#FFFFFF" }}
              >
                Gestor
              </p>
            </div>
          )}
        </Link>
        <button
          onClick={() => setPlegado(!plegado)}
          className="ml-1 p-1.5 rounded-lg transition-colors shrink-0"
          style={{ color: "var(--soh-nav-muted)" }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "var(--soh-nav-hover)";
            e.currentTarget.style.color = "white";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.color = "var(--soh-nav-muted)";
          }}
          aria-label={plegado ? "Expandir menú" : "Plegar menú"}
        >
          {plegado ? (
            <ChevronRight className="w-3.5 h-3.5" />
          ) : (
            <ChevronLeft className="w-3.5 h-3.5" />
          )}
        </button>
      </div>

      {/* ── Navegación ─────────────────────────────────────────────── */}
      <nav
        className="soh-dark-scroll flex-1 overflow-y-auto py-4 px-2"
        aria-label="Navegación principal"
      >
        {grupos.map((grupo, i) => (
          <div key={grupo.titulo ?? i} className="mb-5">
            {!plegado && grupo.titulo && (
              <p
                className="soh-eyebrow px-3 mb-1.5 text-[10px]"
                style={{ color: "var(--soh-nav-muted)" }}
              >
                {grupo.titulo}
              </p>
            )}
            <ul className="space-y-0.5">
              {grupo.entradas.map((entrada) => {
                const Icono = entrada.icono;
                const activa = esActiva(entrada.href);
                return (
                  <li key={entrada.href}>
                    <Link
                      href={entrada.href}
                      title={plegado ? entrada.etiqueta : undefined}
                      aria-current={activa ? "page" : undefined}
                      className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors"
                      style={
                        activa
                          ? {
                              background: "var(--soh-accent)",
                              color: "#FFFFFF",
                              fontWeight: 500,
                            }
                          : { color: "var(--soh-nav-text)" }
                      }
                      onMouseEnter={(e) => {
                        if (!activa) {
                          e.currentTarget.style.background = "var(--soh-nav-hover)";
                          e.currentTarget.style.color = "white";
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!activa) {
                          e.currentTarget.style.background = "transparent";
                          e.currentTarget.style.color = "var(--soh-nav-text)";
                        }
                      }}
                    >
                      <Icono className="w-4 h-4 shrink-0" aria-hidden="true" />
                      {!plegado && <span className="truncate">{entrada.etiqueta}</span>}
                      {activa && !plegado && (
                        <span
                          className="ml-auto w-1.5 h-1.5 rounded-full shrink-0"
                          style={{ background: "#FFFFFF" }}
                        />
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* ── Volver al portal ───────────────────────────────────────── */}
      {urlPortal && (
        <div className="px-2 pb-2 shrink-0">
          <a
            href={urlPortal}
            className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] transition-colors"
            style={{ color: "var(--soh-nav-muted)" }}
            title="Ver todas las herramientas"
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "var(--soh-nav-hover)";
              e.currentTarget.style.color = "white";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.color = "var(--soh-nav-muted)";
            }}
          >
            <ExternalLink className="w-4 h-4 shrink-0" aria-hidden="true" />
            {!plegado && <span className="truncate">Otras herramientas</span>}
          </a>
        </div>
      )}

      {!plegado && (
        <div
          className="p-4 shrink-0"
          style={{ borderTop: "1px solid var(--soh-nav-border)" }}
        >
          <p className="text-xs text-center" style={{ color: "var(--soh-nav-muted)" }}>
            SOHERSA · Gestor de Actividad
          </p>
        </div>
      )}
    </aside>
  );
}
