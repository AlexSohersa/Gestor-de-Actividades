import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans, Inter, Space_Grotesk } from "next/font/google";
import "./globals.css";

/**
 * Las cuatro fuentes de la plataforma, con los mismos roles estrictos:
 *   Space Grotesk → cifras y títulos (.soh-display), y el cuerpo general
 *   IBM Plex Mono → kickers, identificadores y etiquetas con tracking amplio
 *   IBM Plex Sans → texto de párrafo
 *   Inter         → chrome (menú lateral, barra superior)
 *
 * Se declaran igual que en el resto de herramientas para que las hojas de
 * estilo copiadas encuentren las mismas variables.
 */
const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-inter",
  display: "swap",
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-space-grotesk",
  display: "swap",
});

const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-sans",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Gestor de Actividad · SOHERSA",
  description:
    "Registra las horas que dedicas a cada proyecto, gestiona tus ausencias y consulta el avance de tu trabajo.",
  // Para que iOS abra el acceso directo a pantalla completa: Safari no lee el
  // `display: standalone` del manifest, necesita lo suyo.
  appleWebApp: {
    capable: true,
    title: "Checador",
    statusBarStyle: "black-translucent",
  },
};

/**
 * Cómo se ve en un teléfono.
 *
 * `viewportFit: cover` deja que el contenido llegue hasta el borde en los que
 * tienen muesca, y `100dvh` con los `safe-area` de la hoja de estilos evita
 * que el botón de abajo quede bajo la barra del sistema.
 *
 * NO se bloquea el zoom: hay quien necesita agrandar el texto, y quitárselo
 * para que "parezca app" es cambiarle accesibilidad por estética.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0A1526",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="es"
      className={`${inter.variable} ${spaceGrotesk.variable} ${plexSans.variable} ${plexMono.variable} h-full`}
    >
      <body className="h-full">{children}</body>
    </html>
  );
}
