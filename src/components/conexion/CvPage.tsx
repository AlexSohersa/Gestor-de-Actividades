import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

/**
 * Encabezado de pantalla.
 *
 * Cada sección de la plataforma abre con la misma estructura —icono, título,
 * una línea de contexto y acciones a la derecha—, para que cambiar de sección
 * no se sienta como cambiar de producto.
 */
export function CvPageHead({
  icon: Icon,
  title,
  description,
  accent = "var(--cv-green)",
  action,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  accent?: string;
  action?: ReactNode;
}) {
  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        gap: 13,
        marginBottom: 22,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 40,
          height: 40,
          borderRadius: 13,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: `linear-gradient(140deg, color-mix(in srgb, ${accent} 20%, white), color-mix(in srgb, ${accent} 8%, white))`,
          boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${accent} 24%, transparent)`,
          color: accent,
        }}
      >
        <Icon size={19} strokeWidth={2.1} />
      </span>

      <div style={{ flex: 1, minWidth: 0 }}>
        <h1
          className="soh-display"
          style={{
            fontSize: "clamp(19px,2vw,23px)",
            fontWeight: 700,
            letterSpacing: "-0.025em",
            color: "var(--cv-ink)",
            margin: 0,
            lineHeight: 1.15,
          }}
        >
          {title}
        </h1>
        {description && (
          <p
            style={{
              fontSize: 13,
              color: "var(--cv-ink-3)",
              margin: "3px 0 0",
              lineHeight: 1.45,
            }}
          >
            {description}
          </p>
        )}
      </div>

      {action}
    </header>
  );
}

/**
 * Estado de una sección todavía en preparación.
 *
 * Dice qué va a vivir aquí en vez de un "Próximamente" seco: quien entra sabe
 * para qué sirve la sección aunque no pueda usarla, y la plataforma se ve
 * planeada en lugar de rota.
 */
export function CvComingSoon({
  planned,
  accent = "var(--cv-green)",
}: {
  planned: string[];
  accent?: string;
}) {
  return (
    <div
      className="cv-card cv-rise"
      style={{
        padding: "38px 30px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        textAlign: "center",
      }}
    >
      {/* Tres nodos conectados: la misma figura de la constelación del hero,
          en pequeño. Vacío pero de la casa. */}
      <svg
        width="112"
        height="52"
        viewBox="0 0 112 52"
        fill="none"
        aria-hidden="true"
        style={{ marginBottom: 18 }}
      >
        <line x1="18" y1="34" x2="56" y2="16" stroke={accent} strokeWidth="1.5" opacity=".3" />
        <line x1="56" y1="16" x2="94" y2="34" stroke={accent} strokeWidth="1.5" opacity=".3" />
        <line x1="18" y1="34" x2="94" y2="34" stroke={accent} strokeWidth="1.5" opacity=".16" />
        <circle cx="18" cy="34" r="6" fill={accent} opacity=".45" />
        <circle cx="56" cy="16" r="8" fill={accent} opacity=".75" />
        <circle cx="94" cy="34" r="6" fill={accent} opacity=".45" />
      </svg>

      <p
        className="soh-display"
        style={{
          fontSize: 15,
          fontWeight: 700,
          color: "var(--cv-ink)",
          margin: 0,
          letterSpacing: "-0.015em",
        }}
      >
        Esta sección se está construyendo
      </p>
      <p
        style={{
          fontSize: 13,
          color: "var(--cv-ink-3)",
          margin: "6px 0 22px",
          maxWidth: 430,
          lineHeight: 1.5,
        }}
      >
        Ya tiene su lugar en la plataforma. Esto es lo que vas a encontrar aquí:
      </p>

      <ul
        style={{
          listStyle: "none",
          margin: 0,
          padding: 0,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(min(200px, 100%), 1fr))",
          gap: 9,
          width: "100%",
          maxWidth: 560,
          textAlign: "left",
        }}
      >
        {planned.map((p) => (
          <li
            key={p}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 9,
              padding: "10px 13px",
              borderRadius: 12,
              background: "var(--cv-line-soft)",
              fontSize: 12.5,
              color: "var(--cv-ink-2)",
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: accent,
                flexShrink: 0,
              }}
            />
            {p}
          </li>
        ))}
      </ul>
    </div>
  );
}
