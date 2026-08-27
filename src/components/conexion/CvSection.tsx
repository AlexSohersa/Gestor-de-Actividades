import type { CSSProperties, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

/**
 * Encabezado de bloque.
 *
 * El hub mezclaba pendientes, herramientas e información sin decir dónde
 * empieza cada cosa. Un icono, un título y un color por bloque bastan para que
 * se lea como secciones distintas y no como un montón de tarjetas.
 */
export function CvSectionHead({
  icon: Icon,
  title,
  hint,
  tint = "var(--cv-green)",
  action,
  id,
}: {
  icon: LucideIcon;
  title: string;
  hint?: string;
  tint?: string;
  /** Enlace o contador a la derecha. */
  action?: ReactNode;
  id?: string;
}) {
  return (
    <div
      id={id}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        marginBottom: 11,
        // Compensa la barra superior fija al saltar desde el menú lateral.
        scrollMarginTop: 80,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 30,
          height: 30,
          borderRadius: 10,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          // 3.0 · Luz desde arriba y anillo del tinte: el chip gana volumen
          // en vez de ser un cuadrado plano de color aguado.
          background: `linear-gradient(140deg, color-mix(in srgb, ${tint} 20%, white), color-mix(in srgb, ${tint} 8%, white))`,
          boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${tint} 24%, transparent)`,
          color: tint,
        }}
      >
        <Icon size={15} strokeWidth={2.2} />
      </span>

      <div style={{ flex: 1, minWidth: 0 }}>
        <h2
          className="soh-display"
          style={{
            fontSize: 15.5,
            fontWeight: 700,
            letterSpacing: "-0.02em",
            color: "var(--cv-ink)",
            margin: 0,
            lineHeight: 1.2,
          }}
        >
          {title}
        </h2>
        {hint && (
          <p style={{ fontSize: 11.5, color: "var(--cv-ink-3)", margin: "1px 0 0" }}>
            {hint}
          </p>
        )}
      </div>

      {action}
    </div>
  );
}

/** Contenedor de bloque: agrupa encabezado y contenido con su propio ritmo. */
export function CvSection({
  children,
  style,
}: {
  children: ReactNode;
  style?: CSSProperties;
}) {
  return <section style={{ marginBottom: 26, ...style }}>{children}</section>;
}
