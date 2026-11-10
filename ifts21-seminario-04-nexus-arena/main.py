# Nexus Arena: API real contra el esquema oficial NEXUS_ARENA1 (MySQL).
from contextlib import contextmanager
from datetime import date, datetime, timedelta
from decimal import Decimal
from pathlib import Path
from zoneinfo import ZoneInfo
import os
import re

import mysql.connector
from mysql.connector import Error, IntegrityError
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

BASE = Path(__file__).resolve().parent
load_dotenv(BASE / '.env')
TZ = ZoneInfo('America/Argentina/Buenos_Aires')
PUESTOS = {'pc': 1, 'sim': 2, 'stream': 3, 'ps5': 4}
DESCUENTOS = {1: Decimal('1'), 2: Decimal('.90'), 4: Decimal('.80'), 8: Decimal('.65')}
app = FastAPI(title='Nexus Arena — MySQL', version='1.0.0')

@contextmanager
def db():
    try:
        conn = mysql.connector.connect(
            host=os.getenv('DB_HOST', '127.0.0.1'),
            port=int(os.getenv('DB_PORT', '3306')),
            user=os.getenv('DB_USER', 'root'),
            password=os.getenv('DB_PASSWORD', ''),
            database=os.getenv('DB_NAME', 'NEXUS_ARENA1'),
            connection_timeout=5,
        )
    except Error as exc:
        print('Error de conexión MySQL:', exc)
        raise HTTPException(503, 'No se pudo conectar con MySQL. Revisá .env y que MySQL esté encendido.') from exc
    try:
        yield conn
    finally:
        conn.close()

def obtener_puesto(cur, setup):
    if setup not in PUESTOS:
        raise HTTPException(400, 'El tipo de puesto no es válido.')
    cur.execute('SELECT ID_PUESTO, TIPO_PUESTO, PRECIO FROM Puesto WHERE ID_PUESTO=%s', (PUESTOS[setup],))
    puesto = cur.fetchone()
    if not puesto:
        raise HTTPException(404, 'El puesto seleccionado no existe en la base de datos.')
    return puesto

class UsuarioNuevo(BaseModel):
    dni: str = Field(pattern=r'^\d{7,8}$')
    nombre: str = Field(min_length=2, max_length=45)
    email: str = Field(min_length=5, max_length=45)

class ReservaNueva(BaseModel):
    dni: str = Field(pattern=r'^\d{7,8}$')
    setup_type: str
    hours: int
    fecha: date
    hora_inicio: str

@app.get('/api/salud')
def salud():
    with db() as conn:
        cur = conn.cursor()
        try:
            cur.execute('SELECT 1')
            cur.fetchone()
        finally:
            cur.close()
    return {'ok': True, 'database': os.getenv('DB_NAME', 'NEXUS_ARENA1')}

@app.get('/api/puestos')
def listar_puestos():
    with db() as conn:
        cur = conn.cursor(dictionary=True)
        try:
            cur.execute('SELECT ID_PUESTO, TIPO_PUESTO, PRECIO FROM Puesto ORDER BY ID_PUESTO')
            rows = cur.fetchall()
        finally:
            cur.close()
    return rows

@app.get('/api/horas')
def listar_horas():
    with db() as conn:
        cur = conn.cursor(dictionary=True)
        try:
            cur.execute('SELECT ID_HORA_JUEGO, NOMBRE_HORA_JUEGO, CANT_HORAS_JUEGO FROM Hora_De_Juego ORDER BY CANT_HORAS_JUEGO')
            rows = cur.fetchall()
        finally:
            cur.close()
    return rows

@app.get('/api/usuarios/{dni}')
def buscar_usuario(dni: str):
    if not re.fullmatch(r'\d{7,8}', dni):
        raise HTTPException(400, 'DNI inválido (7 u 8 dígitos).')
    with db() as conn:
        cur = conn.cursor(dictionary=True)
        try:
            cur.execute('SELECT DNI, NOMBRE, EMAIL FROM Jugador WHERE DNI=%s', (int(dni),))
            row = cur.fetchone()
        finally:
            cur.close()
    if not row:
        raise HTTPException(404, 'El DNI no está registrado.')
    return {'dni': str(row['DNI']), 'nombre': row['NOMBRE'], 'email': row['EMAIL']}

@app.post('/api/usuarios', status_code=201)
def crear_usuario(datos: UsuarioNuevo):
    nombre = ' '.join(datos.nombre.split())
    email = datos.email.strip().lower()
    if len(nombre) < 2 or not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', email):
        raise HTTPException(400, 'Nombre o mail inválidos.')
    with db() as conn:
        cur = conn.cursor()
        try:
            cur.execute('INSERT INTO Jugador (DNI, NOMBRE, EMAIL) VALUES (%s, %s, %s)', (int(datos.dni), nombre, email))
            conn.commit()
        except IntegrityError as exc:
            conn.rollback()
            if exc.errno == 1062:
                raise HTTPException(409, 'Ese DNI ya está registrado. Usá Buscar DNI.') from exc
            raise HTTPException(400, 'No se pudo registrar el usuario.') from exc
        except Error as exc:
            conn.rollback()
            print('Error MySQL al crear jugador:', exc)
            raise HTTPException(500, 'Error al guardar el usuario.') from exc
        finally:
            cur.close()
    return {'dni': datos.dni, 'nombre': nombre, 'email': email}

@app.post('/api/reservas', status_code=201)
def crear_reserva(datos: ReservaNueva):
    if datos.hours not in DESCUENTOS or datos.setup_type not in PUESTOS:
        raise HTTPException(400, 'Puesto u horas inválidos.')
    if not re.fullmatch(r'(?:09|1\d|2[0-2]):00', datos.hora_inicio):
        raise HTTPException(400, 'Elegí una hora en punto entre las 09:00 y las 22:00.')
    inicio = datetime.strptime(f'{datos.fecha} {datos.hora_inicio}', '%Y-%m-%d %H:%M').replace(tzinfo=TZ)
    fin = inicio + timedelta(hours=datos.hours)
    if inicio <= datetime.now(TZ):
        raise HTTPException(400, 'La fecha y hora elegidas ya pasaron.')
    if fin.date() != datos.fecha or fin.hour > 23 or (fin.hour == 23 and fin.minute > 0):
        raise HTTPException(400, 'La sesión debe terminar como máximo a las 23:00 del mismo día.')

    with db() as conn:
        cur = conn.cursor(dictionary=True)
        lock = False
        try:
            # MySQL advisory lock serializa altas y evita reservas simultáneas solapadas.
            cur.execute("SELECT GET_LOCK('nexus_arena_reservar', 10) AS adquirido")
            lock = cur.fetchone()['adquirido'] == 1
            if not lock:
                raise HTTPException(503, 'Hay otra reserva en proceso. Intentá de nuevo.')
            # La lectura de GET_LOCK ya inicia la transacción con autocommit desactivado.
            cur.execute('SELECT DNI FROM Jugador WHERE DNI=%s', (int(datos.dni),))
            if not cur.fetchone():
                raise HTTPException(404, 'El DNI no está registrado.')
            puesto = obtener_puesto(cur, datos.setup_type)
            cur.execute('SELECT ID_HORA_JUEGO FROM Hora_De_Juego WHERE CANT_HORAS_JUEGO=%s ORDER BY ID_HORA_JUEGO LIMIT 1', (datos.hours,))
            hora = cur.fetchone()
            if not hora:
                raise HTTPException(400, 'La duración no está cargada en Hora_De_Juego.')
            # En el esquema cada tipo representa un solo puesto físico.
            cur.execute('''SELECT p.ID_PASE, p.HORARIO_PASE, h.CANT_HORAS_JUEGO
                FROM Pase p JOIN Hora_De_Juego h ON h.ID_HORA_JUEGO=p.HORA_JUEGO_PASE
                WHERE p.PUESTO_PASE=%s AND p.FECHA_PASE=%s''', (puesto['ID_PUESTO'], datos.fecha))
            for ocupado in cur.fetchall():
                hora_guardada = ocupado['HORARIO_PASE']
                if isinstance(hora_guardada, timedelta):
                    minuto_inicio = int(hora_guardada.total_seconds() // 60)
                else:
                    minuto_inicio = hora_guardada.hour * 60 + hora_guardada.minute
                minuto_fin = minuto_inicio + int(ocupado['CANT_HORAS_JUEGO']) * 60
                nuevo_inicio = inicio.hour * 60 + inicio.minute
                nuevo_fin = nuevo_inicio + datos.hours * 60
                if nuevo_inicio < minuto_fin and nuevo_fin > minuto_inicio:
                    raise HTTPException(409, 'Ese puesto ya está reservado en el horario elegido.')
            cur.execute('SELECT COALESCE(MAX(ID_PASE),0)+1 AS proximo FROM Pase')
            nuevo_id = int(cur.fetchone()['proximo'])
            cur.execute('SELECT ID_ESTADO FROM ESTADO WHERE NOMBRE_ESTADO=%s LIMIT 1', ('Reserva',))
            estado = cur.fetchone()
            if not estado:
                raise HTTPException(500, 'Falta el estado «Reserva» en la tabla ESTADO.')
            cur.execute('''INSERT INTO Pase (ID_PASE, JUGADOR_PASE, PUESTO_PASE, HORA_JUEGO_PASE, FECHA_PASE, HORARIO_PASE, ESTADO_PASE)
                VALUES (%s,%s,%s,%s,%s,%s,%s)''',
                (nuevo_id, int(datos.dni), puesto['ID_PUESTO'], hora['ID_HORA_JUEGO'], datos.fecha, inicio.strftime('%H:%M:%S'), estado['ID_ESTADO']))
            conn.commit()
            total = round(Decimal(puesto['PRECIO']) * datos.hours * DESCUENTOS[datos.hours])
        except HTTPException:
            conn.rollback()
            raise
        except Error as exc:
            conn.rollback()
            print('Error MySQL al crear pase:', exc)
            raise HTTPException(500, 'No se pudo guardar el pase en MySQL.') from exc
        finally:
            if lock:
                try:
                    cur.execute("SELECT RELEASE_LOCK('nexus_arena_reservar')")
                    cur.fetchone()
                except Error:
                    pass
            cur.close()
    return {'id': f'NX-{nuevo_id:08X}', 'id_pase': nuevo_id, 'dni': datos.dni,
            'setup_type': datos.setup_type, 'estacion': puesto['TIPO_PUESTO'].replace('_', ' '),
            'hours': datos.hours, 'fecha': datos.fecha.isoformat(),
            'hora_inicio': inicio.strftime('%H:%M'), 'hora_fin': fin.strftime('%H:%M'),
            'total': int(total), 'estado': 'Reserva'}

@app.get('/api/reservas/{codigo}')
def consultar_reserva(codigo: str):
    if not re.fullmatch(r'NX-[0-9A-Fa-f]{8}', codigo):
        raise HTTPException(400, 'Código de reserva inválido.')
    numero = int(codigo[3:], 16)
    with db() as conn:
        cur = conn.cursor(dictionary=True)
        try:
            cur.execute('''SELECT p.ID_PASE, p.FECHA_PASE, p.HORARIO_PASE, pu.TIPO_PUESTO,
                pu.PRECIO, h.CANT_HORAS_JUEGO, e.NOMBRE_ESTADO
                FROM Pase p JOIN Puesto pu ON pu.ID_PUESTO=p.PUESTO_PASE
                JOIN Hora_De_Juego h ON h.ID_HORA_JUEGO=p.HORA_JUEGO_PASE
                JOIN ESTADO e ON e.ID_ESTADO=p.ESTADO_PASE
                WHERE p.ID_PASE=%s''', (numero,))
            reserva = cur.fetchone()
        finally:
            cur.close()
    if reserva is None:
        raise HTTPException(404, 'No encontramos ese pase.')
    hora_guardada = reserva['HORARIO_PASE']
    if isinstance(hora_guardada, timedelta):
        minutos = int(hora_guardada.total_seconds() // 60)
    else:
        minutos = hora_guardada.hour * 60 + hora_guardada.minute
    duracion = int(reserva['CANT_HORAS_JUEGO'])
    total = round(Decimal(reserva['PRECIO']) * duracion * DESCUENTOS.get(duracion, Decimal(1)))
    return {'id': f"NX-{reserva['ID_PASE']:08X}",
            'estacion': reserva['TIPO_PUESTO'].replace('_', ' '),
            'hours': duracion, 'fecha': reserva['FECHA_PASE'].isoformat(),
            'hora_inicio': f'{minutos//60:02}:{minutos%60:02}',
            'hora_fin': f'{(minutos + duracion*60)//60:02}:{(minutos + duracion*60)%60:02}',
            'total': int(total), 'estado': reserva['NOMBRE_ESTADO']}

app.mount('/', StaticFiles(directory=str(BASE / 'public'), html=True), name='frontend')
