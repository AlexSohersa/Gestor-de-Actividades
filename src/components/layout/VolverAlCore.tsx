import { Home } from "lucide-react";

/**
 * La salida de vuelta al Digital Core.
 *
 * Sin esto, quien entra al portal, salta a una herramienta y navega dentro un
 * rato tiene que retroceder paso por paso o escribir la dirección a mano: el
 * botón de atrás del navegador deshace la navegación, no lleva al principio.
 *
 * Va en la barra superior, a la izquierda, donde se busca la salida —el mismo
 * sitio en las seis herramientas—. Discreto pero con su nombre escrito: un
 * icono suelto obliga a adivinar, y en pantalla estrecha se queda solo el
 * icono, que ahí ya se entiende por su posición.
 *
 * Es un enlace normal y no un botón: se puede abrir en otra pestaña con el
 * clic central o el menú del navegador, como cualquiera espera de algo que
 * lleva a otro sitio.
 */
export function VolverAlCore() {
  const url = process.env.NEXT_PUBLIC_URL_DIGITAL_CORE ?? "https://digital-core.sohersabim.com";

  return (
    <a
      href={url}
      title="Volver al Digital Core"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
        padding: "6px 11px 6px 9px",
        borderRadius: 10,
        border: "1px solid rgba(255,255,255,.13)",
        background: "rgba(255,255,255,.06)",
        color: "var(--cv-dk-2, #9db2c6)",
        fontSize: 12,
        fontWeight: 600,
        textDecoration: "none",
        whiteSpace: "nowrap",
        flexShrink: 0,
      }}
    >
      <Home size={14} style={{ color: "var(--cv-green, #32d66b)", flexShrink: 0 }} />
      <span className="hidden sm:inline">Digital Core</span>
    </a>
  );
}
