import Link from "next/link";

/**
 * Las dos vistas de Estatus de proyectos.
 *
 * Son enlaces y no botones: la vista se comparte tal cual, funciona con el
 * botón de atrás y no depende de que el JavaScript haya cargado.
 *
 * Van sobre el título y no debajo porque la pestaña decide QUÉ pantalla se
 * está viendo —cambia el título, los filtros y el contenido—, y ponerlas
 * dentro haría parecer que filtran lo que ya hay.
 */
export function PestanasProyectos({ activa }: { activa: "radar" | "semanal" }) {
  const vistas = [
    { id: "radar", label: "Radar", href: "/proyectos" },
    { id: "semanal", label: "Reporte semanal", href: "/proyectos?vista=semanal" },
  ] as const;

  return (
    <div
      role="tablist"
      aria-label="Vistas de proyectos"
      style={{
        display: "flex",
        gap: 3,
        marginBottom: 16,
        borderBottom: "1px solid var(--cv-line-soft)",
      }}
    >
      {vistas.map((v) => {
        const on = v.id === activa;
        return (
          <Link
            key={v.id}
            href={v.href}
            role="tab"
            aria-selected={on}
            style={{
              fontSize: 12.5,
              fontWeight: on ? 700 : 600,
              color: on ? "var(--cv-ink)" : "var(--cv-ink-4)",
              textDecoration: "none",
              padding: "8px 13px 10px",
              // La línea inferior es lo que dice dónde estás: un fondo pintado
              // competiría con las tarjetas que vienen justo debajo.
              borderBottom: `2px solid ${on ? "var(--cv-green)" : "transparent"}`,
              marginBottom: -1,
              whiteSpace: "nowrap",
            }}
          >
            {v.label}
          </Link>
        );
      })}
    </div>
  );
}
