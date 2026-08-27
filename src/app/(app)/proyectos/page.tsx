import { exigirSeccion } from "@/modules/identidad/infrastructure/wiring";
import { proyectosConHoras, radarDeProyecto } from "@/lib/proyectos/radar";
import { RadarScreen } from "@/components/proyectos/RadarScreen";

// Un minuto de caché: el radar mira meses de horas y no cambia de un segundo a
// otro. Es la única pantalla que se puede permitir servirse tibia.
export const revalidate = 60;

/**
 * Estatus de proyectos — la "Reunión de radar".
 *
 * Cruza lo cotizado con lo registrado para responder la pregunta de la
 * reunión: en qué entregable se están yendo las horas, y si alcanzan.
 */
export default async function ProyectosPage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string; periodo?: string }>;
}) {
  await exigirSeccion("proyectos");

  const { p, periodo } = await searchParams;
  const proyectos = await proyectosConHoras();

  /*
   * Sin proyecto en la dirección se abre el que más horas lleva: una pantalla
   * en blanco no dice nada, y ese suele ser el que interesa mirar.
   */
  const elegido = p ?? proyectos[0]?.nombre ?? null;

  // Solo 3, 6 o 12 meses: cualquier otra cosa en la dirección se ignora y se
  // muestra todo, que es el valor por omisión.
  const meses = ["3", "6", "12"].includes(periodo ?? "") ? Number(periodo) : null;
  const radar = elegido ? await radarDeProyecto(elegido, meses) : null;

  return (
    <RadarScreen
      proyectos={proyectos}
      inicial={radar}
      periodo={meses ? String(meses) : ""}
    />
  );
}
