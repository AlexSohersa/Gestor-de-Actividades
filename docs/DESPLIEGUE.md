# Desplegar el Gestor de Actividad

Los pasos en orden. Cada script tiene simulacro: se corre primero sin
`--aplicar` para ver qué haría, y solo después con él.

---

## Antes de empezar

Comprueba en local que todo sigue en pie:

```bash
npm run build          # debe terminar sin errores
npm run verificar      # debe decir "Todo cuadra"
```

---

## 1. Autorizar el dominio en Google

En **console.cloud.google.com → APIs y servicios → Credenciales**, al cliente
OAuth `210274889599-s855sr193pjdq…` (el mismo del portal y de Deal Engine),
añade el URI de redirección:

```
https://<tu-dominio>/api/auth/callback/google
```

Y el de local si aún no está:

```
http://localhost:3005/api/auth/callback/google
```

Sin esto Google responde `redirect_uri_mismatch` y nadie entra.

---

## 2. Preparar la estructura de producción

```bash
# Simulacro: dice qué falta, sin tocar nada
npx tsx --env-file=.env.local scripts/preparar-produccion.ts

# Aplicar
npx tsx --env-file=.env.local scripts/preparar-produccion.ts --aplicar
```

Son diez cambios, **todos aditivos**: columnas, tablas e índices nuevos. No
borra ni modifica un dato existente, y correrlo dos veces es inofensivo.

Qué añade y por qué:

| Cambio | Para qué |
|---|---|
| `core.persona.es_admin`, `google_refresco` | quién administra; token de Google |
| `actividad.hora.entregable_texto` | recuperar el entregable que perdió la migración anterior |
| `actividad.hora.categoria` | separar NORMAL / EXTRA / AUSENCIA (columna J de la hoja) |
| `sheet_sync` en las cuatro tablas | la cola de copia a las hojas |
| `actividad.ausencia.enviada_a` | que solo decida quien recibió la solicitud |
| `saldo_vacaciones.liberado_en` + clave por bloque | que no cuenten como disponibles días aún no liberados |
| `actividad.ticket`: folio, prioridad, equipo, 4 estados | el modelo del gestor de siempre |
| `actividad.ticket_evento` | la bitácora de cada ticket |

---

## 3. Llevar los datos

En este orden, cada uno con su simulacro primero:

```bash
# Saldos de vacaciones (119 bloques, 29 personas)
npx tsx --env-file=.env.local scripts/migrar-saldos-vacaciones.ts --produccion
npx tsx --env-file=.env.local scripts/migrar-saldos-vacaciones.ts --produccion --aplicar

# El entregable de las horas ya migradas (~9 000 filas)
npx tsx --env-file=.env.local scripts/recuperar-entregables.ts --produccion
npx tsx --env-file=.env.local scripts/recuperar-entregables.ts --produccion --aplicar

# El número real de los tickets, el de la hoja (26020, 26022...)
npx tsx --env-file=.env.local scripts/recuperar-folios-tickets.ts --produccion
npx tsx --env-file=.env.local scripts/recuperar-folios-tickets.ts --produccion --aplicar

# Comprobar que todo cuadra
npx tsx --env-file=.env.local scripts/verificar-datos.ts --produccion
```

La ingesta desde las hojas (`ingesta-hojas.ts`) trae lo que se haya capturado
en el gestor antiguo desde el último corte. Se puede correr cuando haga falta,
tantas veces como se quiera: es idempotente.

---

## 4. Vercel

Importa el repositorio y define estas variables (Configuración → Environment
Variables). Ver `.env.example` para el detalle de cada una.

**Imprescindibles:**

```
DATABASE_URL          la cadena de Neon, con el parámetro de zona horaria
AUTH_SECRET           EL MISMO que el portal y Deal Engine
AUTH_GOOGLE_ID        el cliente OAuth compartido
AUTH_GOOGLE_SECRET
AUTH_URL              https://<tu-dominio>
ALLOWED_DOMAIN        gruposohersa.com
```

**Para que suba a las hojas:**

```
GOOGLE_OAUTH_REFRESH_TOKEN    (o la pareja GOOGLE_SERVICE_ACCOUNT_*)
```

**Que NO debe existir en producción:**

```
DEV_CORREO_SIMULADO   abre la aplicación como cualquiera sin pasar por Google
```

La aplicación lo ignora cuando `NODE_ENV` es `production`, pero no tiene por
qué viajar.

El `build` ya corre `prisma generate`, así que no hace falta configurar nada
más. Los tres motores de Prisma (Windows, RHEL y Debian) están declarados en el
schema para que funcione tanto aquí como en Vercel.

---

## 5. Después de desplegar

1. Entra y comprueba que el login pasa por Google y te reconoce.
2. Reporta una hora de prueba y confirma que aparece en `BDD ACTIVIDAD V02`.
3. Bórrala desde la aplicación.
4. Registra la herramienta en `src/lib/apps.ts` del Digital Core con su URL.
5. Retira las cinco secciones de `src/lib/sections.ts` del portal.

`core.herramienta` ya tiene la fila `actividad` con 45 personas asignadas
(42 colaboradores y 3 coordinadores), así que los permisos ya existen: nadie
tiene que volver a configurarlos.

---

## Volver atrás

Si algo sale mal, los cambios de estructura son aditivos y **no rompen al
portal**: sigue leyendo solo de `public`, que no se toca. Basta con apagar el
despliegue; los datos de `actividad` se quedan como estén y no afectan a nadie.

Lo único que no se deshace solo son las filas subidas a las hojas. Si hubo una
subida de prueba, hay que borrar esos renglones a mano.
