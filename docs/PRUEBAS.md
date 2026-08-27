# Guía de pruebas manuales

Qué probar, en qué orden y dónde acaba cada dato. Está pensada para **no
repetir flujos que por dentro son el mismo**: nueve pruebas cubren todo.

Al terminar: `npx tsx --env-file=.env.local scripts/limpiar-pruebas.ts --aplicar`

> **El Digital Core sigue en uso.** Mientras pruebas, tus compañeros marcan
> entrada y reportan horas de verdad en las MISMAS hojas. Por eso la limpieza
> ya no borra "todo lo que sobra": identifica tus filas por nombre y día, y
> deja el resto intacto. El 25/8/2026 sobraban 61 filas en `BDD ACTIVIDAD V02`
> y las 61 eran trabajo real de otras personas.

---

## Dónde se guarda cada cosa

| Lo que haces | Tabla en la base | Hoja | Cuándo sube |
|---|---|---|---|
| Reportar horas | `actividad.hora` | `BDD ACTIVIDAD V02` (A–L) | al guardar |
| Pedir ausencia | `actividad.ausencia` | — | no sube: aún es una solicitud |
| Aprobar / rechazar ausencia | `actividad.ausencia` | `BDD PERMISOS` (A–I) | al decidirla, **una fila por día hábil** |
| …y si se APRUEBA, además | — | `BDD ACTIVIDAD V02` (A–L) | con `AUSENCIAS` de proyecto, para que cuenten en los tableros |
| Levantar ticket | `actividad.ticket` + `ticket_evento` | `BDD MANTENIMIENTO` (A–G) | al crearlo |
| Mover ticket de estado | `actividad.ticket` + `ticket_evento` | — | no vuelve a subir |
| Comentar un ticket | `actividad.ticket_evento` | — | la hoja no tiene bitácora |
| Marcar entrada de home office | `actividad.checada` | `CHECK HO`, otro libro (A–E) | **al marcar**: la fila aparece al momento |
| Marcar salida | `actividad.checada` | `CHECK HO` | **actualiza esa misma fila**, no añade otra |
| Cambiar permisos de alguien | `core.persona`, `core.persona_rol`, `core.bitacora_permiso` | — | nunca: es configuración |

Lo que **solo se lee, nunca se escribe**: `public.Catalog` (proyectos,
entregables, tipos, fallas), `public.VacationBlock`, `core.proyecto`,
`core.persona`.

---

## Las nueve pruebas

### 1 · Reportar horas
`/actividad` → **Reportar horas**

Elige proyecto, entregable, tipo, esfuerzo, horas y comentario. Guarda.

- Aparece en el día de la semana, con su chip de proyecto
- **Comprueba en `BDD ACTIVIDAD V02`**: última fila, con tu nombre y las horas

Prueba también el **tope de jornada**: intenta reportar más horas de las que te
quedan del día. Debe rechazarlo diciendo cuántas te quedan.

Y el **fin de semana**: elige un sábado. Debe decir que no es laboral.

### 2 · Borrar una hora
`/actividad` → papelera en la hora que acabas de reportar.

- Desaparece de la pantalla
- **También desaparece de `BDD ACTIVIDAD V02`**: se busca su renglón por día,
  persona, horas y entregable, y se borra. Si no lo encuentra avisa, y el
  registro se borra igual: perderlo sería peor que dejar una fila suelta.
- Una hora con chip **HOJA** (importada) no tiene papelera: no se borra desde aquí

### 3 · Pedir un PERMISO (no descuenta vacaciones)
`/ausencias` → **Solicitar ausencia** → tipo **PERMISO CON GOCE DE SUELDO**

Elige fechas, horas y a quién se la mandas.

- Aparece en «Tus solicitudes» como **Pendiente**
- **Tus días disponibles NO cambian**: este tipo no toca el saldo
- **No sube a `BDD PERMISOS` todavía**: sigue siendo una solicitud

### 4 · Pedir VACACIONES (sí descuenta)
Lo mismo, pero tipo **VACACIONES**.

- Se piden por días completos: no deja poner medias jornadas
- **Los días disponibles siguen sin cambiar mientras esté pendiente**
- Si pides más días de los que tienes, lo rechaza diciendo cuántos te quedan

Es el mismo formulario que el punto 3, pero **el comportamiento cambia**: por
eso son dos pruebas y no una.

### 5 · Aprobar una ausencia
Entra como la persona a quien se la mandaste → `/ausencias` → **Por aprobar**.

- Solo aparece en la bandeja de **esa** persona, no en la de otro coordinador
- Al aprobar: **los días disponibles del solicitante bajan** (si eran vacaciones)
- **Comprueba en `BDD PERMISOS`**: sube **una fila por día hábil**. Una ausencia
  de tres días son tres renglones, como siempre.
- **La columna I trae el periodo** (1, 2, 3…), no «N/A»: es de qué año salieron
  los días. Se toma del bloque que antes vence, para que no se pierdan por
  caducar.
- **Y comprueba también `BDD ACTIVIDAD V02`**: la ausencia aprobada aparece ahí
  con `AUSENCIAS` en el lugar del proyecto. Sin eso, esas horas se caen de los
  tableros de la empresa. Las **rechazadas no** suben aquí.

Prueba también **rechazar** otra: sube igual, con `NO AUTORIZADO`.

### 6 · Cancelar una solicitud pendiente
`/ausencias` → papelera en una que siga **Pendiente**.

- Desaparece y **los días vuelven** si eran vacaciones
- Una ya decidida no tiene papelera

### 7 · Levantar un ticket
`/tickets` → **Nuevo ticket**

- Le toca folio correlativo (`TCK-0xx`)
- **Comprueba en `BDD MANTENIMIENTO`**: última fila con su código y urgencia

Después **muévelo de estado** (En proceso → Resuelto) y **coméntalo**:
- Cada paso deja línea en su historial
- **No vuelve a subir a la hoja**: solo sube al crearse

### 8 · Home office
`/actividad` → botón **Marcar entrada**, y más tarde **Marcar salida**.

> **Antes de probar**: si hoy ya marcaste entrada desde el Digital Core, esa
> checada está en la hoja pero NO en la base de esta herramienta. Marcar aquí
> crearía un renglón aparte. Haz esta prueba un día en que empieces desde aquí.

**La regla del corte (3:30 PM)**: si el PRIMER toque del día llega pasadas las
15:30, se registra como **salida**, no como entrada — a esa hora ya se trabajó
el día. El botón lo refleja: por la tarde ofrece «Marcar salida» directamente.
Es la misma regla del Gestor de siempre.

Al marcar la entrada:
- El botón cambia a **Marcar salida** y muestra la hora **al instante, sin
  recargar**
- **Comprueba en `CHECK HO`** (el otro libro): ya hay una fila con tu número,
  nombre, fecha y hora de entrada, con la salida vacía

Al marcar la salida (más tarde):
- El botón pasa a **Día cerrado** y muestra las dos horas, también al instante
- **En `CHECK HO`: se actualiza ESA MISMA FILA** con la hora de salida. No
  aparece un renglón nuevo — es lo que hacía el Gestor de siempre.

En la hoja apareces con tu nombre CORTO —"ALEJANDRO OROZCO"—, no con el
completo del padrón. Son distintos en 30 de las 34 personas con número, y
escribir el largo rompía dos cosas: verías un nombre que no es el tuyo de
siempre, y las diez personas sin número —que se localizan por nombre— no
encontrarían su propia fila y la duplicarían cada día.

La fila se busca por número de colaborador y fecha; cuando alguien no tiene
número, por nombre. Comprobado: entrada 09:02 → salida 17:47 sobre la misma
fila, en hora de México.

### 9 · Permisos del equipo
`/equipo` → cambia el papel de alguien, quién le aprueba, o qué secciones ve.

- El cambio se ve al instante en su menú
- **No sube a ninguna hoja**: es configuración, no un dato de trabajo
- No puedes quitarte a ti mismo la administración, ni dejar la plataforma sin
  ningún administrador

---

## Lo que NO hace falta probar por separado

Son el mismo camino por dentro; con una vez basta:

- **Ausencia sin paga / salida temprano / llegada tarde** → igual que el
  permiso del punto 3. Lo único que cambia entre tipos es si descuenta saldo, y
  eso ya lo cubren los puntos 3 y 4.
- **Ticket de software vs hardware** → solo cambia el catálogo de fallas.
- **Reportar en otra semana** → la navegación semanal no cambia cómo se guarda.
- **Las tres vistas de actividad** (semana / historial / consulta) → solo leen.
- **El radar de proyectos** → solo lee; no escribe nada en ningún sitio.

---

## Traer lo nuevo de las hojas

Mientras el Digital Core siga en uso, la gente sigue reportando ahí. Para que
la plataforma esté al día:

```bash
# Qué traería, sin escribir nada
npx tsx --env-file=.env.local scripts/ingesta-hojas.ts

# Traerlo
npx tsx --env-file=.env.local scripts/ingesta-hojas.ts --aplicar
```

Se puede correr **todos los días**: lo que ya está no se vuelve a insertar. Una
segunda pasada seguida tiene que decir «0 son nuevas»; si dice otra cosa, algo
va mal y conviene mirarlo antes de aplicar.

Reconoce lo que ya existe por el contenido completo —día, persona, horas,
proyecto, tipo, entregable y comentario—, no solo por el identificador. Hace
falta el comentario: hay quien reporta seis o siete ratos de media hora el
mismo día en el mismo proyecto, y es lo único que los distingue.

Al terminar sube el número de horas: ajusta la referencia en
`scripts/verificar-datos.ts` y `scripts/limpiar-pruebas.ts` (la constante
`BASE`), o el siguiente control avisará de un descuadre que no existe.

---

## Al terminar

```bash
# Qué se borraría, sin tocar nada
npx tsx --env-file=.env.local scripts/limpiar-pruebas.ts

# Borrar de la base
npx tsx --env-file=.env.local scripts/limpiar-pruebas.ts --aplicar

# Y de las hojas (las filas que subieron durante las pruebas)
npx tsx --env-file=.env.local scripts/limpiar-pruebas.ts --aplicar --hojas
```

El script sabe distinguir lo tuyo de lo importado: solo toca lo creado desde la
aplicación (`origen = "app"`) a partir de la fecha de corte.

**Estado de partida.** Las cifras de la BASE son las que deben volver a su
sitio al terminar. Las de las HOJAS solo orientan: crecen solas conforme la
gente trabaja en el Digital Core, y ya no se usan para decidir qué borrar.

| | Base | Hoja |
|---|---|---|
| horas | 9 236 (0 de la app) | `BDD ACTIVIDAD V02` 1 327 |
| ausencias | 442 | `BDD PERMISOS` 1 113 |
| tickets | 10 | `BDD MANTENIMIENTO` 14 |
| checadas | 0 | `CHECK HO` 2 005 |
| saldos | 119 | — |
