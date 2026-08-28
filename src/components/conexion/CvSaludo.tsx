import { Avatar } from "@/components/hub/Avatar";

/**
 * La franja de bienvenida, igual que la del Digital Core.
 *
 * Es una franja y no una portada: el saludo es la entrada, no el trabajo. Por
 * eso va en una sola fila y ocupa poco alto, para que lo de abajo quede
 * visible sin desplazarse.
 *
 * La hora se calcula en MÉXICO y no donde corra el servidor. Con
 * `new Date().getHours()` en Vercel se lee UTC, y a las cuatro de la tarde de
 * aquí saludaba con «buenas noches».
 */
function saludo(): string {
  const h = Number(
    new Intl.DateTimeFormat("es-MX", {
      timeZone: "America/Mexico_City",
      hour: "numeric",
      hour12: false,
    }).format(new Date()),
  );

  if (h < 12) return "Buenos días";
  if (h < 19) return "Buenas tardes";
  return "Buenas noches";
}

/** La fecha de hoy en México, como la escribe una persona. */
function fechaHoy(): string {
  const f = new Intl.DateTimeFormat("es-MX", {
    timeZone: "America/Mexico_City",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());
  return f.charAt(0).toUpperCase() + f.slice(1);
}

/** El nombre de pila: en un saludo, el apellido sobra. */
function primerNombre(nombre?: string | null, correo?: string | null): string {
  if (nombre?.trim()) return nombre.trim().split(/\s+/)[0];
  if (correo) return correo.split("@")[0];
  return "";
}

export function CvSaludo({
  name,
  email,
  image,
  children,
}: {
  name?: string | null;
  email?: string | null;
  image?: string | null;
  /** Lo que va a la derecha: cifras, accesos, lo que cada herramienta quiera. */
  children?: React.ReactNode;
}) {
  return (
    <section
      style={{
        position: "relative",
        overflow: "hidden",
        background: "linear-gradient(165deg, var(--cv-navy) 0%, var(--cv-deep) 100%)",
        padding: "9px 22px",
      }}
    >
      {/* Un resplandor que deriva despacio, del diseño del Core. Decorativo:
          `aria-hidden` para que no lo lea nadie. */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          top: -120,
          left: -60,
          width: 380,
          height: 380,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(55,211,91,.13), transparent 68%)",
          pointerEvents: "none",
        }}
      />

      <div
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <Avatar name={name} email={email} image={image} size={34} />

        <div style={{ flex: "1 1 300px", minWidth: 240 }}>
          <h1
            className="soh-display"
            style={{
              fontWeight: 700,
              fontSize: "clamp(16px,1.5vw,19px)",
              lineHeight: 1.15,
              letterSpacing: "-0.025em",
              color: "#fff",
              margin: 0,
            }}
          >
            {saludo()},{" "}
            {/* El nombre lleva el eje de la marca —verde señal → verde Sohersa
                → turquesa— en vez de un verde plano. */}
            <span
              style={{
                background:
                  "linear-gradient(92deg, var(--cv-green-soft, #57e06a), var(--cv-green) 48%, var(--cv-teal, #3ec6c0))",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                color: "transparent",
              }}
            >
              {primerNombre(name, email)}
            </span>
          </h1>

          <p
            style={{
              margin: "3px 0 0",
              fontSize: 12,
              color: "var(--cv-dk-3)",
            }}
          >
            {fechaHoy()}
          </p>
        </div>

        {children}
      </div>
    </section>
  );
}
