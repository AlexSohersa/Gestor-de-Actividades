import type { Metadata } from "next";
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
