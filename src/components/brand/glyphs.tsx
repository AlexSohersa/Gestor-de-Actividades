/**
 * Los glifos de cada producto, sobre la retícula de 100×100 del manual.
 *
 * Regla del manual (sección 01): el contenedor nunca cambia — solo el glifo
 * interior. Todos van en Verde Sohersa, monolínea.
 *
 * Cada gesto explica qué hace el producto: engranajes que engranan, datos que
 * convergen, un ciclo que se cierra. Nada gira por girar.
 */

const GREEN = "var(--soh-green)";

export type GlyphProps = {
  size?: number;
  /** Desactiva el movimiento. */
  still?: boolean;
};

/* ------------------------------------------------------------ plataforma -- */

/**
 * MARCA MAESTRA — literal del manual. Órbita, núcleo y satélite.
 * Solo el satélite gira: 16s por vuelta. Orbita, no gira.
 */
export function PlatformGlyph({ size = 20, still = false }: GlyphProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      aria-hidden="true"
      style={{ display: "block" }}
    >
      <circle cx="50" cy="50" r="32" stroke={GREEN} strokeWidth="4.5" opacity=".45" />
      <circle cx="50" cy="50" r="9.5" fill={GREEN} />
      <g
        style={{
          transformOrigin: "50px 50px",
          transformBox: "view-box",
          animation: still ? undefined : "soh-orbit 16s linear infinite",
        }}
      >
        <circle cx="50" cy="18" r="7" fill={GREEN} />
      </g>
    </svg>
  );
}

/* ----------------------------------------------------------- deal engine -- */

/** Dos engranajes dentados que engranan entre sí: el motor del trato. */
export function DealEngineGlyph({ size = 20, still = false }: GlyphProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" stroke={GREEN} aria-hidden="true">
      <g
        style={{
          transformOrigin: "38px 40px",
          transformBox: "view-box",
          animation: still ? undefined : "soh-orbit 9s linear infinite",
        }}
      >
        <circle cx="38" cy="40" r="16" strokeWidth="7" strokeDasharray="5 7.5" />
        <circle cx="38" cy="40" r="8" strokeWidth="5" />
      </g>
      <g
        style={{
          transformOrigin: "66px 64px",
          transformBox: "view-box",
          animation: still ? undefined : "soh-orbit-rev 9s linear infinite",
        }}
      >
        <circle cx="66" cy="64" r="12" strokeWidth="7" strokeDasharray="4.5 6.5" />
        <circle cx="66" cy="64" r="6" strokeWidth="5" />
      </g>
    </svg>
  );
}

/* ---------------------------------------------------------- record hub -- */

/**
 * Un núcleo radial al que llegan datos desde tres direcciones. Cada punto
 * viaja hacia el centro y se desvanece al llegar: la información converge y
 * queda absorbida en el expediente.
 */
export function RecordHubGlyph({ size = 20, still = false }: GlyphProps) {
  // Los ocho retardos del manual. No son progresivos a propósito: van salteados
  // para que los datos lleguen desordenados, como llegan de verdad.
  const delays = ["0s", "1.3s", "0.4s", "2.1s", "0.9s", "2.6s", "1.7s", "0.6s"];

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      stroke={GREEN}
      strokeWidth="5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {/* El núcleo da un respingo al recibir cada dato. */}
      <g
        style={
          still
            ? undefined
            : {
                transformBox: "view-box",
                transformOrigin: "50px 50px",
                animation: "soh-hub-recv 3.6s ease-in-out infinite",
              }
        }
      >
        <circle
          cx="50"
          cy="50"
          r="14"
          fill="rgba(55,211,91,0.18)"
          stroke={GREEN}
          strokeWidth="4"
        />
      </g>

      {/* Los ocho datos parten del centro: cada keyframe los lleva a su
          posición exterior y de vuelta hacia dentro, desvaneciéndose. */}
      {delays.map((delay, i) => (
        <circle
          key={i}
          cx="50"
          cy="50"
          r="2.8"
          fill={GREEN}
          stroke="none"
          style={
            still
              ? undefined
              : {
                  animation: `soh-in-${i} 3.6s ease-in-out infinite`,
                  animationDelay: delay,
                }
          }
        />
      ))}
    </svg>
  );
}

/* --------------------------------------------------------- evaluación 360 -- */

/** Dos arcos que cierran el ciclo de 360° sobre una diana que late. */
export function Eval360Glyph({ size = 20, still = false }: GlyphProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" stroke={GREEN} aria-hidden="true">
      <g
        style={{
          transformOrigin: "50px 50px",
          transformBox: "view-box",
          animation: still ? undefined : "soh-orbit 11s linear infinite",
        }}
      >
        <path d="M50 18 A32 32 0 0 1 82 50" strokeWidth="7" strokeLinecap="round" />
        <path d="M50 82 A32 32 0 0 1 18 50" strokeWidth="7" strokeLinecap="round" />
      </g>
      <circle cx="50" cy="50" r="13" strokeWidth="5" />
      <circle
        cx="50"
        cy="50"
        r="5"
        fill={GREEN}
        stroke="none"
        style={{
          transformOrigin: "50px 50px",
          transformBox: "view-box",
          animation: still ? undefined : "soh-diana 2.6s ease-in-out infinite",
        }}
      />
    </svg>
  );
}

/* ------------------------------------------------------------ sin producto -- */

/** Glifo apagado para un área que aún no tiene herramientas. */
export function PlaceholderGlyph({ size = 20 }: GlyphProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" stroke="#8695A6" aria-hidden="true">
      <circle cx="50" cy="50" r="26" strokeWidth="6" strokeDasharray="4 9" opacity=".8" />
      <circle cx="50" cy="50" r="7" fill="#8695A6" stroke="none" opacity=".7" />
    </svg>
  );
}
