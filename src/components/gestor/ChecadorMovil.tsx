"use client";

import { useEffect, useState, useTransition } from "react";
import { Building2, Check, House, LogIn, LogOut, UtensilsCrossed } from "lucide-react";

import {
  checarHomeOffice,
  type EstadoHO,
  type Marca,
  type Modalidad,
} from "@/lib/gestor/homeoffice";

/**
 * El checador, a pantalla completa y para el pulgar.
 *
 * Existe porque el checador del gestor vive dentro de la herramienta, y llegar
 * hasta él desde el móvil —abrir el navegador, cargar el tablero entero,
 * encontrar el botón— tarda más que el gesto que se quiere registrar. Aquí no
 * hay menú ni tablero: se abre y ya están los cuatro botones.
 *
 * NO es un segundo checador. Llama a la misma acción de servidor, que escribe
 * en la misma fila —una por persona y día, con índice único—, así que marcar
 * desde el celular y luego desde la laptop es marcar en el mismo sitio. Lo que
 * se vea en una aparece en la otra en cuanto se recarga.
 */

const PASOS: {
  marca: Marca;
  titulo: string;
  pie: string;
  Icono: typeof LogIn;
}[] = [
  { marca: "entrada", titulo: "Entrada", pie: "Empiezas tu jornada", Icono: LogIn },
  {
    marca: "comidaInicio",
    titulo: "Salida a comer",
    pie: "Pausa de comida",
    Icono: UtensilsCrossed,
  },
  {
    marca: "comidaFin",
    titulo: "Regreso de comer",
    pie: "Vuelves al trabajo",
    Icono: UtensilsCrossed,
  },
  { marca: "salida", titulo: "Salida", pie: "Cierras tu jornada", Icono: LogOut },
];

export function ChecadorMovil({
  estado,
  nombre,
}: {
  estado: EstadoHO;
  nombre: string;
}) {
  const [local, setLocal] = useState(estado);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();

  /*
   * El reloj, para que la pantalla no parezca congelada.
   *
   * Es lo primero que se mira al abrir un checador: si la hora no avanza, uno
   * duda de si la pantalla está viva y vuelve a tocar el botón.
   */
  const [ahora, setAhora] = useState<string | null>(null);
  useEffect(() => {
    const pinta = () =>
      setAhora(
        new Intl.DateTimeFormat("es-MX", {
          timeZone: "America/Mexico_City",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }).format(new Date()),
      );
    pinta();
    const t = setInterval(pinta, 15_000);
    return () => clearInterval(t);
  }, []);

  const cerrado = local.siguiente === "cerrado";

  const sinMarcas =
    !local.entrada && !local.comidaInicio && !local.comidaFin && !local.salida;

  const elegirDonde = (m: Modalidad) =>
    setLocal((v) => ({ ...v, modalidad: m }));

  const marcar = (marca: Marca) => {
    setError(null);
    startTransition(async () => {
      const r = await checarHomeOffice(marca, local.modalidad ?? undefined);
      if (!r.ok) {
        setError(r.error ?? "No se pudo registrar.");
        return;
      }
      setLocal((v) => {
        const nuevo = { ...v };
        if (marca === "entrada") nuevo.entrada = r.hora ?? null;
        if (marca === "comidaInicio") nuevo.comidaInicio = r.hora ?? null;
        if (marca === "comidaFin") nuevo.comidaFin = r.hora ?? null;
        if (marca === "salida") nuevo.salida = r.hora ?? null;
        return nuevo;
      });
    });
  };

  const hoy = new Intl.DateTimeFormat("es-MX", {
    timeZone: "America/Mexico_City",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());

  return (
    <div
      style={{
        minHeight: "100dvh",
        /*
          El navy arriba y el claro abajo, en un solo fondo.

          Con `background` plano y el panel en `flex: 1`, cuando hay pocos
          pasos el panel no llega al fondo y queda una franja navy suelta bajo
          el contenido. El degradado duro corta en el mismo punto donde
          empieza el panel, así que da igual cuánto mida.
        */
        background:
          "linear-gradient(var(--cv-navy) 0 190px, var(--cv-faint) 190px)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* ─────────────────────────────────────────────────── cabecera ── */}
      <div
        style={{
          // `safe-area-inset-top`: instalada como app, la pantalla llega hasta
          // el borde y sin esto el reloj queda bajo la muesca.
          padding: "calc(26px + env(safe-area-inset-top)) 20px 20px",
          flexShrink: 0,
        }}
      >
        <span
          className="soh-mono"
          style={{
            display: "block",
            fontSize: 9.5,
            letterSpacing: ".14em",
            textTransform: "uppercase",
            color: "rgba(255,255,255,.5)",
          }}
        >
          Checador
        </span>
        <span
          className="soh-display"
          style={{
            display: "block",
            fontSize: 42,
            fontWeight: 700,
            color: "#fff",
            lineHeight: 1.05,
            marginTop: 6,
            // Reserva el alto antes de que el reloj llegue: sin esto todo
            // salta un renglón al montarse.
            minHeight: 44,
          }}
        >
          {ahora ?? " "}
        </span>
        <span
          style={{
            display: "block",
            fontSize: 12.5,
            color: "rgba(255,255,255,.62)",
            marginTop: 2,
            textTransform: "capitalize",
          }}
        >
          {hoy}
        </span>
        <span
          style={{
            display: "block",
            fontSize: 11,
            color: "rgba(255,255,255,.42)",
            marginTop: 8,
          }}
        >
          {nombre}
        </span>
      </div>

      {/* ──────────────────────────────────────────────── el contenido ── */}
      <div
        style={{
          flex: 1,
          background: "var(--cv-faint)",
          borderRadius: "22px 22px 0 0",
          // Otro tanto abajo: la barra de gestos del teléfono se come los
          // últimos píxeles, y ahí está el enlace al gestor.
          padding: "20px 16px calc(26px + env(safe-area-inset-bottom))",
        }}
      >
        {/*
          Lo PRIMERO es dónde, y solo se pregunta una vez al día.

          Se mira la modalidad y no la entrada: quien elige dónde y luego marca
          su comida —porque olvidó apuntar la entrada— ya no vuelve a decirlo.
        */}
        {!local.modalidad && !cerrado ? (
          <>
            <span
              className="soh-mono"
              style={{
                display: "block",
                fontSize: 9.5,
                letterSpacing: ".11em",
                textTransform: "uppercase",
                color: "var(--cv-ink-4)",
                marginBottom: 11,
              }}
            >
              ¿Dónde trabajas hoy?
            </span>
            <div style={{ display: "flex", gap: 11 }}>
              {(
                [
                  ["OFICINA", "Oficina", Building2],
                  ["HOME_OFFICE", "Home office", House],
                ] as const
              ).map(([valor, texto, Icono]) => (
                <button
                  key={valor}
                  type="button"
                  disabled={pendiente}
                  onClick={() => elegirDonde(valor)}
                  style={{
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 9,
                    // 96px de alto: el pulgar necesita blanco alrededor, no
                    // precisión. Es el mismo criterio de todos los botones.
                    padding: "26px 10px",
                    borderRadius: 16,
                    border: "1px solid var(--cv-line)",
                    background: "#fff",
                    fontFamily: "inherit",
                    cursor: "pointer",
                    opacity: pendiente ? 0.6 : 1,
                  }}
                >
                  <Icono size={26} style={{ color: "#178A49" }} />
                  <span
                    style={{ fontSize: 13, fontWeight: 700, color: "var(--cv-ink)" }}
                  >
                    {texto}
                  </span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            {/* Dónde se está trabajando, y el deshacer mientras se pueda. */}
            <span
              style={{
                display: "flex",
                alignItems: "center",
                gap: 7,
                marginBottom: 13,
                fontSize: 12,
                color: "var(--cv-ink-3)",
              }}
            >
              {local.modalidad === "HOME_OFFICE" ? (
                <House size={14} style={{ color: "#178A49" }} />
              ) : (
                <Building2 size={14} style={{ color: "#178A49" }} />
              )}
              <b style={{ color: "var(--cv-ink)" }}>
                {local.modalidad === "HOME_OFFICE"
                  ? "Trabajas desde casa"
                  : local.modalidad === "OFICINA"
                    ? "Estás en la oficina"
                    : "Jornada cerrada"}
              </b>
              {/* Un toque de más no debe quedarse: mientras no haya marcas, la
                  elección aún vive solo aquí y deshacerla es gratis. */}
              {local.modalidad && sinMarcas && !cerrado && (
                <button
                  type="button"
                  onClick={() => setLocal((v) => ({ ...v, modalidad: null }))}
                  disabled={pendiente}
                  style={{
                    border: "none",
                    background: "none",
                    padding: "4px 2px",
                    cursor: "pointer",
                    fontFamily: "inherit",
                    fontSize: 12,
                    fontWeight: 700,
                    color: "#178A49",
                    textDecoration: "underline",
                    textUnderlineOffset: 2,
                  }}
                >
                  cambiar
                </button>
              )}
            </span>

            <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
              {PASOS.map(({ marca, titulo, pie, Icono }) => {
                const hora = local[marca];
                const hecho = Boolean(hora);
                const sugerida = local.siguiente === marca;

                return (
                  <button
                    key={marca}
                    type="button"
                    disabled={hecho || pendiente}
                    onClick={() => marcar(marca)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 13,
                      width: "100%",
                      // 72px: alcanzable con el pulgar sin mirar.
                      padding: "18px 16px",
                      borderRadius: 15,
                      border: `1px solid ${
                        hecho
                          ? "rgba(23,138,73,.3)"
                          : sugerida
                            ? "var(--cv-green)"
                            : "var(--cv-line-soft)"
                      }`,
                      background: hecho ? "#E9F8EF" : "#fff",
                      textAlign: "left",
                      fontFamily: "inherit",
                      cursor: hecho || pendiente ? "default" : "pointer",
                      opacity: pendiente && !hecho ? 0.6 : 1,
                    }}
                  >
                    <span
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: 40,
                        height: 40,
                        borderRadius: 12,
                        background: hecho ? "#178A49" : "var(--cv-faint)",
                        flexShrink: 0,
                      }}
                    >
                      {hecho ? (
                        <Check size={19} strokeWidth={3} style={{ color: "#fff" }} />
                      ) : (
                        <Icono size={19} style={{ color: "var(--cv-ink-3)" }} />
                      )}
                    </span>

                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span
                        style={{
                          display: "block",
                          fontSize: 14.5,
                          fontWeight: 700,
                          color: "var(--cv-ink)",
                        }}
                      >
                        {titulo}
                      </span>
                      <span
                        style={{
                          display: "block",
                          fontSize: 11.5,
                          color: "var(--cv-ink-4)",
                          marginTop: 1,
                        }}
                      >
                        {hecho ? `Marcada a las ${hora}` : pie}
                      </span>
                    </span>

                    {!hecho && (
                      <span
                        className="soh-mono"
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          letterSpacing: ".06em",
                          textTransform: "uppercase",
                          color: sugerida ? "#178A49" : "var(--cv-ink-4)",
                          flexShrink: 0,
                        }}
                      >
                        Marcar
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </>
        )}

        {error && (
          <p
            style={{
              margin: "13px 0 0",
              fontSize: 12,
              color: "#B23A40",
              lineHeight: 1.5,
            }}
          >
            {error}
          </p>
        )}

        {cerrado && (
          <p
            style={{
              margin: "15px 0 0",
              fontSize: 12,
              color: "var(--cv-ink-4)",
              textAlign: "center",
              lineHeight: 1.6,
            }}
          >
            Tu jornada de hoy ya está completa.
          </p>
        )}

        {/* La salida al gestor completo, discreta: quien llega aquí viene a
            marcar, no a reportar horas. Pero si ya está dentro, que no tenga
            que teclear la dirección. */}
        <a
          href="/actividad"
          style={{
            display: "block",
            marginTop: 22,
            textAlign: "center",
            fontSize: 12,
            fontWeight: 600,
            color: "var(--cv-ink-4)",
            textDecoration: "none",
            padding: "10px 0",
          }}
        >
          Ir al gestor de actividad →
        </a>
      </div>
    </div>
  );
}
