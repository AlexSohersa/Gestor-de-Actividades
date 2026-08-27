/**
 * PREPARA producción: aplica a Neon los cambios de estructura que ya están
 * probados en local.
 *
 *   npx tsx --env-file=.env.local scripts/preparar-produccion.ts            (simulacro)
 *   npx tsx --env-file=.env.local scripts/preparar-produccion.ts --aplicar
 *
 * Todo lo que hace es ADITIVO: añade columnas, tablas e índices. No borra ni
 * modifica un solo dato existente, y cada instrucción lleva `IF NOT EXISTS` o
 * su equivalente, así que correrlo dos veces es inofensivo.
 *
 * Lo que NO hace, a propósito: mover datos. Para eso están los scripts
 * `migrar-saldos-vacaciones`, `recuperar-entregables` e `ingesta-hojas`, que se
 * corren después y cada uno con su propio simulacro.
 *
 * Antes de aplicar imprime qué falta y qué ya está, para que se vea de
 * antemano lo que va a pasar.
 */

/*
 * Habla con Neon por HTTP, no por el puerto 5432.
 *
 * Desde esta máquina el puerto de Postgres no completa el saludo —el TCP abre
 * y ahí se queda—, mientras que el endpoint SQL sobre HTTPS responde al
 * instante. Es la misma base: solo cambia por dónde entra la consulta.
 *
 * La aplicación desplegada NO usa esto; Vercel se conecta por el puerto normal
 * a través de Prisma. Es solo para poder operar desde aquí.
 */
import { ejecutar, servidor, sql } from "./lib/neon-http";

const APLICAR = process.argv.includes("--aplicar");

/** Cada paso: qué comprueba y qué ejecuta si falta. */
interface Paso {
  nombre: string;
  /** Consulta que devuelve 1 si el cambio YA está aplicado. */
  comprobar: string;
  sql: string[];
}

const columna = (schema: string, tabla: string, col: string) => `
  SELECT count(*)::int AS n FROM information_schema.columns
   WHERE table_schema='${schema}' AND table_name='${tabla}' AND column_name='${col}'`;

const tabla = (schema: string, t: string) => `
  SELECT count(*)::int AS n FROM information_schema.tables
   WHERE table_schema='${schema}' AND table_name='${t}'`;

const PASOS: Paso[] = [
  {
    nombre: "core.persona · es_admin y google_refresco",
    comprobar: columna("core", "persona", "es_admin"),
    sql: [
      `ALTER TABLE core.persona
         ADD COLUMN IF NOT EXISTS es_admin boolean NOT NULL DEFAULT false,
         ADD COLUMN IF NOT EXISTS google_refresco text`,
    ],
  },
  {
    nombre: "actividad.hora · entregable_texto (lo perdió la migración anterior)",
    comprobar: columna("actividad", "hora", "entregable_texto"),
    sql: [`ALTER TABLE actividad.hora ADD COLUMN IF NOT EXISTS entregable_texto text`],
  },
  {
    nombre: "actividad.hora · categoria (NORMAL · EXTRA · AUSENCIA)",
    comprobar: columna("actividad", "hora", "categoria"),
    sql: [
      `ALTER TABLE actividad.hora
         ADD COLUMN IF NOT EXISTS categoria text NOT NULL DEFAULT 'NORMAL'`,
      // Las horas que ya son ausencias quedan marcadas como tales: es la
      // columna J de la hoja y sin ella el tablero no puede separarlas de
      // las horas de trabajo.
      `UPDATE actividad.hora SET categoria = 'AUSENCIA'
         WHERE categoria = 'NORMAL'
           AND (proyecto_codigo = 'AUSENCIAS'
                OR upper(coalesce(proyecto_texto, '')) = 'AUSENCIAS')`,
    ],
  },
  {
    nombre: "actividad · cola de subida a las hojas (sheet_sync)",
    comprobar: columna("actividad", "hora", "sheet_sync"),
    sql: [
      `ALTER TABLE actividad.hora
         ADD COLUMN IF NOT EXISTS sheet_sync text NOT NULL DEFAULT 'pendiente',
         ADD COLUMN IF NOT EXISTS actualizado_en timestamptz NOT NULL DEFAULT now()`,
      `ALTER TABLE actividad.ausencia
         ADD COLUMN IF NOT EXISTS sheet_sync text NOT NULL DEFAULT 'pendiente',
         ADD COLUMN IF NOT EXISTS actualizado_en timestamptz NOT NULL DEFAULT now()`,
      `ALTER TABLE actividad.ticket
         ADD COLUMN IF NOT EXISTS sheet_sync text NOT NULL DEFAULT 'pendiente'`,
      `ALTER TABLE actividad.checada
         ADD COLUMN IF NOT EXISTS sheet_sync text NOT NULL DEFAULT 'pendiente',
         ADD COLUMN IF NOT EXISTS actualizado_en timestamptz NOT NULL DEFAULT now()`,
      // Lo importado YA está en la hoja: devolverlo la duplicaría.
      `UPDATE actividad.hora SET sheet_sync = 'hoja' WHERE origen = 'hoja'`,
      `CREATE INDEX IF NOT EXISTS hora_sync_idx     ON actividad.hora (sheet_sync)`,
      `CREATE INDEX IF NOT EXISTS ausencia_sync_idx ON actividad.ausencia (sheet_sync)`,
      `CREATE INDEX IF NOT EXISTS ticket_sync_idx   ON actividad.ticket (sheet_sync)`,
      `CREATE INDEX IF NOT EXISTS checada_sync_idx  ON actividad.checada (sheet_sync)`,
    ],
  },
  {
    nombre: "actividad.ausencia · enviada_a (solo decide quien la recibió)",
    comprobar: columna("actividad", "ausencia", "enviada_a"),
    sql: [
      `ALTER TABLE actividad.ausencia ADD COLUMN IF NOT EXISTS enviada_a text`,
      `ALTER TABLE actividad.ausencia DROP CONSTRAINT IF EXISTS ausencia_enviada_a_fkey`,
      `ALTER TABLE actividad.ausencia
         ADD CONSTRAINT ausencia_enviada_a_fkey
         FOREIGN KEY (enviada_a) REFERENCES core.persona(id) ON DELETE SET NULL`,
      `CREATE INDEX IF NOT EXISTS ausencia_enviada_a_idx
         ON actividad.ausencia (enviada_a, estado)`,
    ],
  },
  {
    nombre: "actividad.saldo_vacaciones · liberado_en y clave por bloque",
    comprobar: columna("actividad", "saldo_vacaciones", "liberado_en"),
    sql: [
      `ALTER TABLE actividad.saldo_vacaciones
         ADD COLUMN IF NOT EXISTS liberado_en date,
         ADD COLUMN IF NOT EXISTS id text`,
      // Una persona puede tener VARIOS bloques del mismo periodo con fechas
      // distintas; con la clave (persona, periodo) se fusionaban y se perdía
      // la diferencia entre lo liberado y lo que aún no toca.
      `UPDATE actividad.saldo_vacaciones SET id = gen_random_uuid()::text WHERE id IS NULL`,
      `ALTER TABLE actividad.saldo_vacaciones ALTER COLUMN id SET NOT NULL`,
      `ALTER TABLE actividad.saldo_vacaciones DROP CONSTRAINT IF EXISTS saldo_vacaciones_pkey`,
      `ALTER TABLE actividad.saldo_vacaciones ADD PRIMARY KEY (id)`,
      `CREATE INDEX IF NOT EXISTS saldo_vacaciones_persona_idx
         ON actividad.saldo_vacaciones (persona_id, vence_en)`,
    ],
  },
  {
    nombre: "actividad.ticket · folio, prioridad, equipo y los 4 estados",
    comprobar: columna("actividad", "ticket", "numero"),
    sql: [
      `ALTER TABLE actividad.ticket
         ADD COLUMN IF NOT EXISTS numero integer GENERATED BY DEFAULT AS IDENTITY,
         ADD COLUMN IF NOT EXISTS prioridad text NOT NULL DEFAULT 'MEDIA',
         ADD COLUMN IF NOT EXISTS equipo text,
         ADD COLUMN IF NOT EXISTS anydesk text,
         ADD COLUMN IF NOT EXISTS dynamics_id text,
         ADD COLUMN IF NOT EXISTS actualizado_en timestamptz NOT NULL DEFAULT now()`,
      `ALTER TABLE actividad.ticket DROP CONSTRAINT IF EXISTS ticket_estado`,
      `ALTER TABLE actividad.ticket ADD CONSTRAINT ticket_estado
         CHECK (estado IN ('EN_REVISION','EN_PROCESO','EN_ESPERA','RESUELTO'))`,
      `ALTER TABLE actividad.ticket ALTER COLUMN estado SET DEFAULT 'EN_REVISION'`,
      `ALTER TABLE actividad.ticket DROP CONSTRAINT IF EXISTS ticket_prioridad`,
      `ALTER TABLE actividad.ticket ADD CONSTRAINT ticket_prioridad
         CHECK (prioridad IN ('ALTA','MEDIA','BAJA'))`,
      `CREATE UNIQUE INDEX IF NOT EXISTS ticket_numero_key ON actividad.ticket (numero)`,
    ],
  },
  {
    nombre: "actividad.saldo_vacaciones · usados y corte (evita el doble descuento)",
    comprobar: columna("actividad", "saldo_vacaciones", "usados"),
    sql: [
      // `dias` del origen es lo que QUEDA, no lo otorgado: el portal ya
      // descontó las ausencias. Sin guardar esa referencia, derivar el consumo
      // de las ausencias importadas lo resta por segunda vez.
      `ALTER TABLE actividad.saldo_vacaciones
         ADD COLUMN IF NOT EXISTS usados numeric(5,2) NOT NULL DEFAULT 0,
         ADD COLUMN IF NOT EXISTS corte date`,
    ],
  },
  {
    nombre: "actividad.ausencia_bloque · de qué periodo salió cada día",
    comprobar: tabla("actividad", "ausencia_bloque"),
    sql: [
      `CREATE TABLE IF NOT EXISTS actividad.ausencia_bloque (
         id           text PRIMARY KEY,
         ausencia_id  text NOT NULL REFERENCES actividad.ausencia(id) ON DELETE CASCADE,
         saldo_id     text NOT NULL REFERENCES actividad.saldo_vacaciones(id) ON DELETE RESTRICT,
         periodo      integer NOT NULL,
         dias         numeric(5,2) NOT NULL,
         vence_en     date,
         creado_en    timestamptz NOT NULL DEFAULT now())`,
      `CREATE INDEX IF NOT EXISTS ausencia_bloque_ausencia_idx
         ON actividad.ausencia_bloque (ausencia_id)`,
    ],
  },
  {
    nombre: "core.resolver_persona · red de seguridad para persona_id",
    comprobar: `SELECT count(*)::int AS n FROM pg_proc p
                  JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname='core' AND p.proname='resolver_persona'`,
    sql: [
      // Quita acentos sin depender de la extensión `unaccent`, que puede no
      // estar en Neon. Cubre las letras que aparecen en nombres en español.
      `CREATE OR REPLACE FUNCTION core.unaccent_simple(t text)
       RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $u$
         SELECT translate(coalesce(t, ''),
           'áàäâãéèëêíìïîóòöôõúùüûñçÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ',
           'aaaaaeeeeiiiiooooouuuuncAAAAAEEEEIIIIOOOOOUUUUNC')
       $u$`,
      // Resuelve persona_id a partir de lo que HAYA en la fila. La aplicación
      // siempre lo manda resuelto; esto cubre scripts y cargas manuales.
      `CREATE OR REPLACE FUNCTION core.resolver_persona()
       RETURNS trigger LANGUAGE plpgsql AS $fn$
       DECLARE v_texto text; v_id text; v_n int;
       BEGIN
         IF NEW.persona_id IS NOT NULL AND NEW.persona_id <> '' THEN RETURN NEW; END IF;
         v_texto := coalesce(
           to_jsonb(NEW) ->> 'email', to_jsonb(NEW) ->> 'correo',
           to_jsonb(NEW) ->> 'colaborador', to_jsonb(NEW) ->> 'nombre',
           to_jsonb(NEW) ->> 'usuario');
         IF v_texto IS NULL OR btrim(v_texto) = '' THEN RETURN NEW; END IF;
         v_texto := btrim(v_texto);
         SELECT persona_id INTO v_id FROM core.persona_correo
          WHERE correo = lower(v_texto) LIMIT 1;
         IF v_id IS NULL THEN
           SELECT id INTO v_id FROM core.persona WHERE numero = v_texto LIMIT 1;
         END IF;
         IF v_id IS NULL THEN
           SELECT id INTO v_id FROM core.persona
            WHERE upper(core.unaccent_simple(nombre)) = upper(core.unaccent_simple(v_texto))
               OR upper(core.unaccent_simple(coalesce(nombre_usuario, ''))) = upper(core.unaccent_simple(v_texto))
            LIMIT 1;
         END IF;
         IF v_id IS NULL THEN
           SELECT count(*) INTO v_n FROM core.persona
            WHERE upper(core.unaccent_simple(nombre)) LIKE upper(core.unaccent_simple(v_texto)) || ' %';
           IF v_n = 1 THEN
             SELECT id INTO v_id FROM core.persona
              WHERE upper(core.unaccent_simple(nombre)) LIKE upper(core.unaccent_simple(v_texto)) || ' %'
              LIMIT 1;
           END IF;
         END IF;
         IF v_id IS NOT NULL THEN NEW.persona_id := v_id; END IF;
         RETURN NEW;
       END; $fn$`,
      `DROP TRIGGER IF EXISTS resolver_persona ON actividad.hora`,
      `CREATE TRIGGER resolver_persona BEFORE INSERT OR UPDATE ON actividad.hora
         FOR EACH ROW EXECUTE FUNCTION core.resolver_persona()`,
      `DROP TRIGGER IF EXISTS resolver_persona ON actividad.ausencia`,
      `CREATE TRIGGER resolver_persona BEFORE INSERT OR UPDATE ON actividad.ausencia
         FOR EACH ROW EXECUTE FUNCTION core.resolver_persona()`,
      `DROP TRIGGER IF EXISTS resolver_persona ON actividad.ticket`,
      `CREATE TRIGGER resolver_persona BEFORE INSERT OR UPDATE ON actividad.ticket
         FOR EACH ROW EXECUTE FUNCTION core.resolver_persona()`,
      `DROP TRIGGER IF EXISTS resolver_persona ON actividad.checada`,
      `CREATE TRIGGER resolver_persona BEFORE INSERT OR UPDATE ON actividad.checada
         FOR EACH ROW EXECUTE FUNCTION core.resolver_persona()`,
      `DROP TRIGGER IF EXISTS resolver_persona ON actividad.saldo_vacaciones`,
      `CREATE TRIGGER resolver_persona BEFORE INSERT OR UPDATE ON actividad.saldo_vacaciones
         FOR EACH ROW EXECUTE FUNCTION core.resolver_persona()`,
    ],
  },
  {
    nombre: "actividad.ticket_evento · la bitácora de cada ticket",
    comprobar: tabla("actividad", "ticket_evento"),
    sql: [
      `CREATE TABLE IF NOT EXISTS actividad.ticket_evento (
         id         text PRIMARY KEY,
         ticket_id  text NOT NULL REFERENCES actividad.ticket(id) ON DELETE CASCADE,
         persona_id text REFERENCES core.persona(id) ON DELETE SET NULL,
         texto      text NOT NULL,
         creado_en  timestamptz NOT NULL DEFAULT now()
       )`,
      `CREATE INDEX IF NOT EXISTS ticket_evento_ticket_idx
         ON actividad.ticket_evento (ticket_id, creado_en)`,
    ],
  },
];

async function main() {
  console.log("\n╭──────────────────────────────────────────────╮");
  console.log("│  Preparar PRODUCCIÓN (Neon)                  │");
  console.log("╰──────────────────────────────────────────────╯");
  console.log(`  Servidor: ${servidor}`);
  console.log(`  Modo: ${APLICAR ? "\x1b[31mAPLICAR (escribe)\x1b[0m" : "simulacro"}\n`);

  const pendientes: Paso[] = [];

  for (const paso of PASOS) {
    const [{ n }] = await sql<{ n: number }>(paso.comprobar);
    if (n > 0) {
      console.log(`  \x1b[32m✓\x1b[0m ya está · ${paso.nombre}`);
    } else {
      console.log(`  \x1b[33m·\x1b[0m falta   · ${paso.nombre}`);
      pendientes.push(paso);
    }
  }

  if (pendientes.length === 0) {
    console.log("\n  \x1b[32mProducción ya está al día.\x1b[0m\n");
    return;
  }

  if (!APLICAR) {
    console.log(
      `\n  \x1b[33m!\x1b[0m ${pendientes.length} cambio(s) por aplicar. ` +
        "Todos son aditivos: no borran ni modifican datos.",
    );
    console.log("     Añade --aplicar para ejecutarlos.\n");
    return;
  }

  console.log("");
  for (const paso of pendientes) {
    for (const sentencia of paso.sql) {
      await ejecutar(sentencia);
    }
    console.log(`  \x1b[32m✓\x1b[0m aplicado · ${paso.nombre}`);
  }

  console.log("\n  Estructura lista. Ahora los datos, cada uno con su simulacro:");
  console.log("    npx tsx --env-file=.env.local scripts/migrar-saldos-vacaciones.ts --produccion --aplicar");
  console.log("    npx tsx --env-file=.env.local scripts/recuperar-entregables.ts    --produccion --aplicar");
  console.log("    npx tsx --env-file=.env.local scripts/verificar-datos.ts          --produccion\n");
}

main().catch((e) => {
  console.error("\n  \x1b[31m✗\x1b[0m", e instanceof Error ? e.message : e, "\n");
  process.exitCode = 1;
});
