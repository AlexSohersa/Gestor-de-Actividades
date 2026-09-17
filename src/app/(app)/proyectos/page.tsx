import { exigirSeccion } from "@/modules/identidad/infrastructure/wiring";
import {
  comparativaDeProyectos,
  proyectosConHoras,
  radarDeProyecto,
} from "@/lib/proyectos/radar";
import { RadarScreen } from "@/components/proyectos/RadarScreen";

// Un minuto de caché: el radar mira meses de horas y no cambia de un segundo a
// otro. Es la única pantalla que se puede permitir servirse tibia.
export const revalidate = 60;

/**
 * Estatus de proyectos — la "Reunión de radar".
 *
 * Cruza lo cotizado con lo registrado para responder la pregunta de la
 * reunión: en qué entregable se están yendo las horas, y si alcanzan.
 *
 * Con VARIOS proyectos elegidos cambia de pregunta: ya no es "cómo va este"
 * sino "cómo vamos con estos", y entonces enseña los totales del grupo y una
 * barra por proyecto en vez del detalle de uno solo.
 */
export default async function ProyectosPage({
  searchParams,
}: {
  searchParams: Promise<{
    p?: string;
    periodo?: string;
    desde?: string;
    hasta?: string;
    cliente?: string;
  }>;
}) {
  await exigirSeccion("proyectos");

  const { p, periodo, desde, hasta, cliente } = await searchParams;
  const proyectos = await proyectosConHoras();

  /*
   * Los proyectos elegidos viajan separados por "|" en un solo parámetro.
   *
   * Se usa "|" y no la coma porque hay proyectos con coma en el nombre, y
   * partir por ella los rompería en dos.
   */
  const pedidos = (p ?? "")
    .split("|")
    .map((n) => n.trim())
    .filter(Boolean);

  /*
   * Sin proyecto en la dirección se abre el que más horas lleva: una pantalla
   * en blanco no dice nada, y ese suele ser el que interesa mirar.
   */
  const elegidos =
    pedidos.length > 0
      ? pedidos
      : proyectos[0]
        ? [proyectos[0].nombre]
        : [];

  // Solo 3, 6 o 12 meses: cualquier otra cosa en la dirección se ignora y se
  // muestra todo, que es el valor por omisión.
  const meses = ["3", "6", "12"].includes(periodo ?? "") ? Number(periodo) : null;

  // Un día suelto o medio rango también sirven: "desde el 1 de agosto" es una
  // pregunta legítima, y exigir las dos fechas obligaría a inventar la otra.
  const dia = (v?: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v ?? "") ? v : undefined);
  const rango = { desde: dia(desde), hasta: dia(hasta) };
  const hayRango = Boolean(rango.desde || rango.hasta);

  /*
   * Uno solo trae su tablero completo; varios, la comparativa.
   *
   * Son dos consultas distintas porque enseñan cosas distintas: el detalle de
   * un proyecto —serie diaria, dona, entregables— no tiene sentido sumado
   * entre varios, y pedirlo para quince sería quince consultas pesadas para
   * pintar quince barras.
   */
  const [radar, comparativa] = await Promise.all([
    elegidos.length === 1
      ? radarDeProyecto(elegidos[0], meses, rango)
      : Promise.resolve(null),
    elegidos.length > 1
      ? comparativaDeProyectos(elegidos, meses, rango)
      : Promise.resolve(null),
  ]);

  return (
    <RadarScreen
      proyectos={proyectos}
      inicial={radar}
      comparativa={comparativa}
      elegidos={elegidos}
      // Un rango escrito manda sobre el atajo, así que el atajo se desmarca:
      // dejar los dos encendidos haría creer que se están aplicando ambos.
      periodo={hayRango ? "" : meses ? String(meses) : ""}
      desde={rango.desde ?? ""}
      hasta={rango.hasta ?? ""}
      cliente={cliente ?? ""}
    />
  );
}
