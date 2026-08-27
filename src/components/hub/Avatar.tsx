"use client";

import { useState } from "react";

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
  const [failed, setFailed] = useState(false);
  const showPhoto = Boolean(image) && !failed;
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
            src={image as string}
            alt=""
            referrerPolicy="no-referrer"
            onError={() => setFailed(true)}
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
