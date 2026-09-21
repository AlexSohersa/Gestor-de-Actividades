"use client";

import { useEffect, useState } from "react";

function initials(name?: string | null, email?: string | null): string {
  const source = name?.trim() || email?.split("@")[0] || "?";
  return source
    .split(/[\s.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

/**
 * Foto de perfil de Google con anillo verde, sobre superficie oscura.
 *
 * Dos detalles imprescindibles, tomados de Evaluación 360:
 *
 *   - `referrerPolicy="no-referrer"`: sin esto, Google rechaza la petición
 *     de la foto desde localhost y la imagen sale rota.
 *   - `onError`: si el enlace caduca (pasa con Workspace), cae a las
 *     iniciales en vez de dejar el hueco de imagen rota.
 *
 * Por eso usa <img> y no next/image: necesita ambos, y el avatar es una sola
 * imagen pequeña donde la optimización no aporta nada.
 */
export function Avatar({
  name,
  email,
  image,
  size = 76,
  online = true,
}: {
  name?: string | null;
  email?: string | null;
  image?: string | null;
  size?: number;
  /** Punto verde de "en línea" en la esquina. */
  online?: boolean;
}) {
  /*
   * Un fallo al cargar no es definitivo.
   *
   * Antes, un solo `onError` dejaba las iniciales para el resto de la sesión:
   * una petición que no llegó, un momento de red o un límite pasajero de
   * Google bastaban, y la foto no volvía hasta cerrar sesión —que es lo único
   * que monta este componente de cero—.
   *
   * Ahora se reintenta una vez, con la dirección marcada para que el navegador
   * no sirva el fallo que acaba de guardar. Si el segundo intento también
   * falla, entonces sí se queda en iniciales: la foto no existe o la cuenta no
   * tiene.
   */
  const [intento, setIntento] = useState(0);
  const rendido = intento > 1;
  const showPhoto = Boolean(image) && !rendido;

  /* Al cambiar de persona —o de dirección— se empieza de nuevo: el avatar de
     alguien no debe heredar el fallo del anterior. */
  useEffect(() => {
    setIntento(0);
  }, [image]);

  const src = intento === 0 ? image : `${image}${String(image).includes("?") ? "&" : "?"}r=${intento}`;
  const dot = Math.round(size * 0.21);

  return (
    <div style={{ position: "relative", flex: "0 0 auto" }}>
      <div
        style={{
          width: size,
          height: size,
          borderRadius: 999,
          padding: 3,
          background: "linear-gradient(135deg,#37D35B,#57E06A)",
          boxShadow: "0 8px 24px rgba(55,211,91,.3)",
        }}
      >
        {showPhoto ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src as string}
            alt=""
            referrerPolicy="no-referrer"
            onError={() => setIntento((n) => n + 1)}
            style={{
              width: "100%",
              height: "100%",
              borderRadius: 999,
              objectFit: "cover",
              border: "2px solid var(--soh-navy)",
              display: "block",
            }}
          />
        ) : (
          <div
            className="soh-display"
            style={{
              width: "100%",
              height: "100%",
              borderRadius: 999,
              background: "var(--soh-tile)",
              border: "2px solid var(--soh-navy)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: Math.round(size * 0.32),
              fontWeight: 700,
              color: "var(--soh-green)",
            }}
          >
            {initials(name, email)}
          </div>
        )}
      </div>

      {online && (
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            bottom: Math.round(size * 0.05),
            right: Math.round(size * 0.05),
            width: dot,
            height: dot,
            borderRadius: 999,
            background: "var(--soh-green)",
            border: "3px solid var(--soh-deep)",
          }}
        />
      )}
    </div>
  );
}
