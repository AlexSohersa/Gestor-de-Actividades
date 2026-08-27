"use client";

/**
 * Marca del Gestor de Actividad.
 *
 * Sigue la regla del manual de identidad: «el contenedor nunca cambia; lo único
 * que varía entre productos es el glifo interior». El badge es el invariante
 * del sistema —cuadrado de esquinas suaves en azul profundo, contorno verde—
 * y aquí se respetan sus tres medidas oficiales:
 *
 *   radio de esquina .... 26% del lado
 *   contorno verde ...... 1.5px
 *   tamaño del glifo .... 54% del lado
 *
 * El glifo: un ARCO DE HORAS que se llena alrededor de una aguja. Es monolínea,
 * en la retícula 100×100 y con el trazo de 5–7px que usan los demás módulos
 * (Lens, Deal Engine, coDrafter, BIM Data Flow, Project Record Hub). Dice lo
 * que hace la herramienta: acumular el tiempo dedicado.
 *
 * Prop `giro`:
 *  · "idle"   el arco se completa de vez en cuando (ciclo de 9 s). Para el menú.
 *  · "always" gira sin parar. Para indicadores de carga.
 *  · "none"   estático. Para capturas e impresión.
 */

import { useId } from "react";

interface Props {
  /** Lado del badge en píxeles. El glifo y el radio se derivan de él. */
  size?: number;
  giro?: "idle" | "always" | "none";
  /** `false` devuelve el glifo suelto, sin badge. */
  conBadge?: boolean;
  className?: string;
}

/** Verde Sohersa. Literal y no un token CSS: esto también se usa en SVG suelto. */
const VERDE = "#37D35B";
/** Azul profundo — el fondo del badge en toda la identidad. */
const AZUL_PROFUNDO = "#0A1526";

export function GestorLogo({
  size = 40,
  giro = "idle",
  conBadge = true,
  className,
}: Props) {
  const uid = useId().replace(/:/g, "");
  const arco = `ga-arco-${uid}`;
  const aguja = `ga-aguja-${uid}`;

  // Perímetro del arco (r = 30). Animar `stroke-dashoffset` de él a un resto lo
  // dibuja como si se fuera llenando.
  const LARGO = 2 * Math.PI * 30;
  const RESTO = LARGO * 0.22; // se detiene al 78%: un día casi completo

  const animArco =
    giro === "always"
      ? `${arco} 1.8s ease-in-out infinite`
      : giro === "idle"
        ? `${arco} 9s ease-in-out infinite`
        : "none";

  const animAguja =
    giro === "always"
      ? `${aguja} 2.6s linear infinite`
      : giro === "idle"
        ? `${aguja} 9s ease-in-out infinite`
        : "none";

  // El glifo mide el 54% del badge, como marca el manual.
  const ladoGlifo = conBadge ? Math.round(size * 0.54) : size;

  const glifo = (
    <svg
      width={ladoGlifo}
      height={ladoGlifo}
      viewBox="0 0 100 100"
      fill="none"
      stroke={VERDE}
      strokeLinecap="round"
      aria-hidden="true"
    >
      <style>{`
        /* En "idle" el arco pasa quieto la mayor parte del ciclo y se rehace al
           final: se nota vivo sin distraer. Solo transform y dashoffset, que
           van por GPU y no fuerzan repintado. */
        @keyframes ${arco} {
          0%       { stroke-dashoffset: ${LARGO}; }
          55%, 88% { stroke-dashoffset: ${RESTO}; }
          100%     { stroke-dashoffset: ${LARGO}; }
        }
        @keyframes ${aguja} {
          0%       { transform: rotate(0deg); }
          55%, 88% { transform: rotate(281deg); }
          100%     { transform: rotate(360deg); }
        }
        @media (prefers-reduced-motion: reduce) {
          .${arco}, .${aguja} { animation: none !important; }
        }
      `}</style>

      {/* Carril: la jornada completa, en verde tenue. */}
      <circle cx="50" cy="50" r="30" strokeWidth="6.5" opacity="0.28" />

      {/* Arco de horas acumuladas. Empieza arriba, de ahí el giro de -90°. */}
      <circle
        className={arco}
        cx="50"
        cy="50"
        r="30"
        strokeWidth="6.5"
        strokeDasharray={LARGO}
        strokeDashoffset={giro === "none" ? RESTO : LARGO}
        style={{
          transform: "rotate(-90deg)",
          transformOrigin: "50px 50px",
          transformBox: "view-box",
          animation: animArco,
        }}
      />

      {/* La aguja que marca el avance, con su punto en la punta: el mismo
          recurso que usa el glifo de Lens. */}
      <g
        className={aguja}
        style={{
          transformOrigin: "50px 50px",
          transformBox: "view-box",
          animation: animAguja,
        }}
      >
        <line x1="50" y1="50" x2="50" y2="24" strokeWidth="6" />
        <circle cx="50" cy="24" r="3.5" fill={VERDE} stroke="none" />
      </g>

      <circle cx="50" cy="50" r="4" fill={VERDE} stroke="none" />
    </svg>
  );

  if (!conBadge) return <span className={className}>{glifo}</span>;

  return (
    <span
      className={className}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: size,
        height: size,
        // Las tres medidas oficiales del badge.
        borderRadius: Math.round(size * 0.26),
        background: AZUL_PROFUNDO,
        border: `1.5px solid rgba(55,211,91,.85)`,
        flexShrink: 0,
      }}
    >
      {glifo}
    </span>
  );
}
