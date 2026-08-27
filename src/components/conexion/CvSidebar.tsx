"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarOff,
  ChevronLeft,
  FolderKanban,
  ShieldCheck,
  Timer,
  Wrench,
} from "lucide-react";
import { seccionesVisibles, type SectionId } from "@/lib/sections";

const ICON: Record<SectionId, typeof Timer> = {
  actividad: Timer,
  ausencias: CalendarOff,
  tickets: Wrench,
  equipo: ShieldCheck,
  proyectos: FolderKanban,
};

/**
 * Barra lateral de navegación.
 *
 * Cada entrada abre una PANTALLA propia, no un ancla dentro del hub. Con
 * anclas, "picarle" a una sección solo desplazaba la misma página larga; ahora
 * cada sección es su ruta, con su título y su contenido, y el menú marca dónde
 * estás comparando la ruta actual.
 *
 * Las secciones en preparación se muestran igual, con una marca: esconderlas
 * daría la impresión de que la plataforma es más pequeña de lo que va a ser, y
 * verlas deja claro hacia dónde va.
 *
 * Las de administración son la excepción: quien no las puede usar tampoco las
 * ve. La ruta además comprueba el permiso por su cuenta —ocultar un enlace no
 * es proteger nada—.
 */
export function CvSidebar({
  esAdmin = false,
  ocultas = [],
}: {
  esAdmin?: boolean;
  /** Secciones que quien administra le escondió a esta persona. */
  ocultas?: string[];
}) {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();

  /*
   * Adónde se acaba de picar.
   *
   * Cada sección es una ruta del servidor y tarda ~280 ms en responder. Sin
   * esto el menú no cambia en todo ese rato, se siente como que el clic no
   * entró, y se vuelve a picar. Marcando el destino al instante, la respuesta
   * es inmediata aunque la página aún esté viniendo.
   */
  const [yendoA, setYendoA] = useState<string | null>(null);

  // Al llegar, manda la ruta real: si la navegación falló, la marca se cae
  // sola en vez de quedarse mintiendo.
  useEffect(() => {
    setYendoA(null);
  }, [pathname]);

  const W = collapsed ? 68 : 232;

  const visibles = seccionesVisibles(esAdmin, ocultas);
  const grupos = ["Tu trabajo", "La empresa"] as const;

  /** Activa por prefijo: una subruta sigue marcando su sección. */
  const isActive = (href: string) => {
    // Mientras se navega manda el destino: el menú responde al instante.
    if (yendoA) return yendoA === href;
    return pathname === href || pathname.startsWith(href + "/");
  };

  return (
    <aside
      className="cv-chrome-dots"
      style={{
        width: W,
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        backgroundColor: "var(--cv-deep)",
        borderRight: "1px solid rgba(255,255,255,.07)",
        transition: "width .24s cubic-bezier(.22,1,.36,1)",
        overflow: "hidden",
      }}
    >
      {/* ----------------------------------------------------- navegación -- */}
      <nav
        className="soh-scroll"
        aria-label="Navegación principal"
        style={{ flex: 1, overflowY: "auto", padding: "14px 10px" }}
      >
        {grupos.map((g) => {
          const items = visibles.filter((s) => s.group === g);
          if (items.length === 0) return null;

          return (
            <div key={g}>
              <div
                className="soh-mono"
                style={{
                  fontSize: 9,
                  letterSpacing: "0.16em",
                  color: "var(--cv-dk-4)",
                  padding: collapsed ? "18px 0 8px" : "18px 12px 8px",
                  textAlign: collapsed ? "center" : "left",
                  textTransform: "uppercase",
                }}
              >
                {collapsed ? "···" : g}
              </div>

              {items.map((s) => (
                <SideLink
                  key={s.id}
                  icon={ICON[s.id]}
                  label={s.label}
                  href={s.href}
                  onIr={setYendoA}
                  active={isActive(s.href)}
                  soon={s.status === "preparing"}
                  collapsed={collapsed}
                />
              ))}
            </div>
          );
        })}
      </nav>

      {/* ------------------------------------------------------ pie fijo -- */}
      <div
        style={{
          padding: "10px",
          borderTop: "1px solid rgba(255,255,255,.06)",
          flexShrink: 0,
        }}
      >
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          aria-label={collapsed ? "Expandir menú" : "Contraer menú"}
          title={collapsed ? "Expandir menú" : "Contraer menú"}
          className="cv-side-toggle"
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: collapsed ? "center" : "flex-end",
            gap: 8,
            marginTop: 8,
            padding: "8px 10px",
            borderRadius: 10,
            border: "none",
            background: "transparent",
            color: "var(--cv-dk-4)",
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          <ChevronLeft
            size={16}
            style={{
              transform: collapsed ? "rotate(180deg)" : "none",
              transition: "transform .24s ease",
            }}
          />
        </button>
      </div>
    </aside>
  );
}

function SideLink({
  icon: Icon,
  label,
  href,
  active = false,
  badge,
  badgeTone = "plain",
  soon = false,
  collapsed,
  onIr,
}: {
  icon: typeof Timer;
  label: string;
  href: string;
  active?: boolean;
  badge?: number;
  /** `alert` pinta el globo en verde de marca: reclama atención. */
  badgeTone?: "plain" | "alert";
  /** Marca las secciones que todavía se están preparando. */
  soon?: boolean;
  collapsed: boolean;
  /** Se llama al tocar, para marcar el destino antes de que llegue. */
  onIr?: (href: string) => void;
}) {
  return (
    <Link
      href={href}
      onClick={() => onIr?.(href)}
      title={collapsed ? label : undefined}
      className="cv-side-link"
      data-active={active || undefined}
      aria-current={active ? "page" : undefined}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 11,
        padding: collapsed ? "10px 0" : "10px 12px",
        justifyContent: collapsed ? "center" : "flex-start",
        borderRadius: 11,
        textDecoration: "none",
        fontSize: 13.5,
        fontWeight: 500,
        color: active ? "#fff" : "var(--cv-dk-3)",
        background: active ? "rgba(55,211,91,.14)" : "transparent",
        marginBottom: 2,
      }}
    >
      <Icon
        size={17}
        style={{ flexShrink: 0, color: active ? "var(--cv-green)" : "inherit" }}
      />
      {!collapsed && (
        <>
          <span
            style={{
              flex: 1,
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {label}
          </span>

          {badge !== undefined && (
            <span
              className="soh-mono"
              style={{
                fontSize: 10,
                fontWeight: 700,
                padding: "2px 7px",
                borderRadius: 20,
                background:
                  badgeTone === "alert"
                    ? "var(--cv-green)"
                    : "rgba(255,255,255,.08)",
                color: badgeTone === "alert" ? "#04240f" : "var(--cv-dk-3)",
                flexShrink: 0,
              }}
            >
              {badge}
            </span>
          )}

          {/* Un punto discreto, no la palabra "próximamente": dice que aún no
              está sin gritar en cada renglón del menú. */}
          {soon && badge === undefined && (
            <span
              aria-label="En preparación"
              title="En preparación"
              style={{
                width: 5,
                height: 5,
                borderRadius: "50%",
                background: "var(--cv-dk-4)",
                flexShrink: 0,
              }}
            />
          )}
        </>
      )}
    </Link>
  );
}
