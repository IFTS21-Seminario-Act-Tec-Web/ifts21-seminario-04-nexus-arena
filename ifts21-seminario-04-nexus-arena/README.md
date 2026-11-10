# Nexus Arena — reservas conectadas a MySQL

## Qué se implementó

El botón **Reservar este Rig** abre el formulario; **Buscar DNI** consulta `Jugador`; si no existe, **Crear usuario** inserta en `Jugador`. Se elige fecha con calendario mensual del navegador, hora inicial y duración (1/2/4/8 h) desde la tabla `Hora_De_Juego`; **Pedir reserva** inserta en `Pase` con `ESTADO_PASE` vinculado al estado «Reserva». El ID entero de `ID_PASE` se muestra como código `NX-00000004`, que se consulta en **Mi Sesión**.

**El proyecto usa exclusivamente MySQL; se eliminó la base SQLite de demostración.** Los precios de `Puesto` se cargan vía `/api/puestos` y el total aplica los descuentos de la interfaz (1 h 0%, 2 h 10%, 4 h 20%, 8 h 35%). El precio calculado no se almacena en `Pase`, porque la estructura oficial no tiene campo para el total. Las tablas `Consultas` y `Hora_De_Juego.PRECIO` no se alteran.

## Requisitos y preparación

1. Tener **MySQL Server** instalado y encendido (Workbench es la interfaz de administración, no el servidor).
2. En **MySQL Workbench**, importar y ejecutar `nexus_arena_oficial.sql` **solo si todavía no creaste la base**. Atención: el archivo original contiene `DROP database NEXUS_ARENA1;` y **borra esa base y todos sus datos** si ya existe. Si ya la creaste, **NO ejecutes nuevamente el SQL**, usá la existente directamente.
3. Copiar `.env.example` a `.env` y cambiar `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_PORT` según tu instalación. Nunca subir `.env` a GitHub.
4. Desde una terminal abierta en la carpeta del proyecto:

```powershell
py -m pip install -r requirements.txt
py -m uvicorn main:app --reload
```

5. Abrir **http://127.0.0.1:8000** (no usar Live Server). Comprobar `http://127.0.0.1:8000/api/salud` para confirmar que MySQL responde.

## Tablas utilizadas

- `Jugador(DNI, NOMBRE, EMAIL)` — altas y consultas por DNI.
- `Puesto(ID_PUESTO, TIPO_PUESTO, PRECIO)` — estación seleccionada y valor por hora.
- `Hora_De_Juego(ID_HORA_JUEGO, NOMBRE_HORA_JUEGO, CANT_HORAS_JUEGO)` — duraciones.
- `ESTADO(ID_ESTADO, NOMBRE_ESTADO)` — estado inicial «Reserva».
- `Pase(ID_PASE, JUGADOR_PASE, PUESTO_PASE, HORA_JUEGO_PASE, FECHA_PASE, HORARIO_PASE, ESTADO_PASE)` — nuevas reservas y seguimiento.

El backend busca `ID_PASE` máximo + 1 bajo un candado MySQL para evitar IDs repetidos y verifica superposición de horarios para cada tipo de puesto. Se considera 1 puesto físico por ID de `Puesto`; si hay múltiples unidades reales de un mismo tipo, el modelo de datos debería ampliarse. Los turnos arrancan en horas enteras entre 09:00 y 22:00, y deben terminar antes o a las 23:00. Se usa hora de Buenos Aires.

**Seguridad**: es una implementación educativa/local. Buscar DNI revela el nombre a quien lo ingrese y consultar pases solo exige el ID. Antes de publicar en producción se necesita autenticación, permisos, protección de datos, rate limiting y configuración HTTPS.

## Nota sobre la conexión

El código está conectado **a nivel de configuración y consultas SQL**; para abrir una conexión real necesitás ejecutar el servidor en una PC con MySQL y credenciales válidas. No puedo comprobar tu servidor MySQL local desde este entorno.
