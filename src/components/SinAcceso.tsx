/**
 * Lo que ve quien entra a una herramienta que no le tocan.
 *
 * No es un error: la persona hizo todo bien —inició sesión, escribió bien la
 * dirección— y simplemente no le han dado esta herramienta. Así que ni «403»
 * ni «acceso denegado» en rojo, que suenan a que hizo algo malo.
 *
 * Lo importante es la salida: un botón de vuelta al portal, que es donde sí
 * tiene cosas suyas, y a quién pedirlo si lo necesita. Una pantalla sin salida
 * obliga a escribir otra dirección de memoria.
 */
export function SinAcceso({ correo, urlPortal }: { correo: string; urlPortal: string }) {
  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        background: "var(--cv-bg, #F4F7FA)",
      }}
    >
      <div
        style={{
          maxWidth: 460,
          width: "100%",
          background: "#fff",
          borderRadius: 18,
          border: "1px solid rgba(16,42,67,.08)",
          boxShadow: "0 18px 44px rgba(10,21,38,.10)",
          padding: "34px 30px",
          textAlign: "center",
        }}
      >
        <span
          aria-hidden
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 52,
            height: 52,
            borderRadius: 16,
            background: "#FDF3DC",
            marginBottom: 18,
          }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#B07C10" strokeWidth="2" strokeLinecap="round">
            <rect x="4" y="10" width="16" height="10" rx="2" />
            <path d="M8 10V7a4 4 0 0 1 8 0" />
          </svg>
        </span>

        <h1
          style={{
            fontSize: 19,
            fontWeight: 700,
            color: "#0A1526",
            margin: "0 0 10px",
            lineHeight: 1.3,
          }}
        >
          Todavía no tienes esta herramienta
        </h1>

        <p style={{ fontSize: 13.5, color: "#5A6B7D", lineHeight: 1.6, margin: "0 0 6px" }}>
          Tu sesión está bien —entraste como <strong>{correo}</strong>—, pero el
          Gestor de Actividad no está entre las herramientas que te tocan.
        </p>

        <p style={{ fontSize: 13, color: "#5A6B7D", lineHeight: 1.6, margin: "0 0 24px" }}>
          Quien administra la plataforma puede dártela desde{" "}
          <strong>Permisos</strong>, en el Digital Core.
        </p>

        <a
          href={urlPortal}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "11px 20px",
            borderRadius: 99,
            background: "#0A1526",
            color: "#fff",
            fontSize: 13.5,
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          Volver al Digital Core
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </a>
      </div>
    </div>
  );
}
