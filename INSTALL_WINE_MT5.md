# Instalación de MetaTrader 5 en Linux con Wine

Guía para instalar MT5 en Linux usando Wine y conectarlo con el agente Free JT7.
**Sin mocks. Conexión real. Datos reales. Ejecución real de operaciones.**

---

## Requisitos previos

- Linux (Ubuntu 22.04+ / Debian 12+ recomendado)
- Python 3.8+
- Acceso a una cuenta MT5 real (broker)
- Pantalla activa o virtual (`Xvfb` en servidores headless)

---

## Paso 1 — Instalar Wine 64-bit

```bash
# Habilitar arquitectura i386 (necesaria para Wine)
sudo dpkg --add-architecture i386

# Agregar repositorio oficial de Wine
sudo mkdir -pm755 /etc/apt/keyrings
sudo wget -O /etc/apt/keyrings/winehq-archive.key https://dl.winehq.org/wine-builds/winehq.key
sudo wget -NP /etc/apt/sources.list.d/ \
  https://dl.winehq.org/wine-builds/ubuntu/dists/$(lsb_release -sc)/winehq-$(lsb_release -sc).sources

# Instalar Wine estable
sudo apt update
sudo apt install --install-recommends winehq-stable -y

# Verificar instalación
wine --version
```

### Alternativa rápida (sin repositorio oficial)

```bash
sudo apt install wine64 wine32 winetricks -y
```

---

## Paso 2 — Crear prefijo Wine para MT5

```bash
# Crear prefijo dedicado de 64 bits
WINEPREFIX=~/.wine-mt5 WINEARCH=win64 winecfg
```

En la ventana de `winecfg` que aparece:
- Selecciona **Windows 10** como versión
- Haz clic en **OK**

---

## Paso 3 — Instalar dependencias de Windows con Winetricks

```bash
WINEPREFIX=~/.wine-mt5 winetricks vcrun2019 corefonts
```

---

## Paso 4 — Descargar e instalar MetaTrader 5

```bash
# Descargar instalador oficial de MT5
wget -O /tmp/mt5setup.exe "https://download.mql5.com/cdn/web/metaquotes.software.corp/mt5/mt5setup.exe"

# Instalar MT5 en el prefijo Wine
WINEPREFIX=~/.wine-mt5 DISPLAY=:0 wine /tmp/mt5setup.exe
```

> **Nota:** Si estás en un servidor sin pantalla, instala Xvfb:
> ```bash
> sudo apt install xvfb -y
> Xvfb :99 -screen 0 1024x768x24 &
> export DISPLAY=:99
> ```

Sigue el asistente gráfico de MT5:
1. Acepta el acuerdo de licencia
2. Elige la carpeta de instalación (por defecto: `C:\Program Files\MetaTrader 5\`)
3. Espera a que termine la descarga e instalación
4. Cierra MT5 al finalizar

Verifica que el ejecutable existe:

```bash
ls ~/.wine-mt5/drive_c/Program\ Files/MetaTrader\ 5/terminal64.exe
```

---

## Paso 5 — Instalar el paquete Python de MetaTrader5

```bash
pip install MetaTrader5
```

> **Nota:** El paquete `MetaTrader5` de Python se comunica con `terminal64.exe` via named pipe.
> MT5 debe estar ejecutándose antes de llamar a `mt5.initialize()`.

---

## Paso 6 — Iniciar MT5 con Wine

Usa el script incluido en el proyecto:

```bash
./start_mt5_wine.sh
```

O manualmente:

```bash
WINEPREFIX=~/.wine-mt5 WINEARCH=win64 DISPLAY=:0 \
  wine ~/.wine-mt5/drive_c/Program\ Files/MetaTrader\ 5/terminal64.exe &
sleep 5
```

---

## Paso 7 — Verificar conexión Python ↔ MT5

```bash
python3 - <<'EOF'
import MetaTrader5 as mt5

ok = mt5.initialize()
print("MT5 initialize:", ok)
if ok:
    info = mt5.terminal_info()
    print("Terminal:", info)
    mt5.shutdown()
else:
    print("Error:", mt5.last_error())
EOF
```

Si devuelve `MT5 initialize: True`, la conexión está funcionando.

---

## Paso 8 — Configurar credenciales del broker

Edita `.openclaw/config.json` con tus datos:

```json
{
  "mcp_servers": {
    "mt5": {
      "mock_on_linux": false,
      "wine_prefix": "~/.wine-mt5",
      "wine_display": ":0",
      "mt5_path": "~/.wine-mt5/drive_c/Program Files/MetaTrader 5/terminal64.exe",
      "login": 12345678,
      "password": "tu_contraseña",
      "server": "NombreBroker-Server"
    }
  }
}
```

O usa variables de entorno:

```bash
export MT5_LOGIN=12345678
export MT5_PASSWORD=tu_contraseña
export MT5_SERVER=NombreBroker-Server
```

---

## Paso 9 — Iniciar el servidor MCP de MT5

```bash
cd mcp-servers/mt5
pip install -r requirements.txt
python mt5_server.py
```

---

## Verificación completa del stack

```bash
# 1. MT5 corriendo
pgrep -f terminal64.exe && echo "MT5 OK" || echo "MT5 NO CORRIENDO"

# 2. Python conecta
python3 -c "import MetaTrader5 as mt5; print('MT5 pkg:', mt5.initialize()); mt5.shutdown()"

# 3. MCP server responde
curl -s http://localhost:8765/health || echo "MCP server no responde en :8765"
```

---

## Solución de problemas

| Problema | Causa probable | Solución |
|---|---|---|
| `wine: command not found` | Wine no instalado | `sudo apt install wine64` |
| `terminal64.exe no encontrado` | MT5 no instalado en prefijo | Repetir paso 4 |
| `MT5 initialize: False` | MT5 no corriendo | Ejecutar `./start_mt5_wine.sh` |
| Pantalla en negro / sin display | Falta `DISPLAY` | `export DISPLAY=:0` o usar Xvfb |
| `MT5_AVAILABLE = False` en logs | Paquete no instalado | `pip install MetaTrader5` |
| Named pipe error | MT5 cerrado o incompatible | Reiniciar MT5 y esperar 5 seg |

---

## Notas de seguridad

- **Nunca** pongas credenciales en texto plano en archivos versionados.
- Usa variables de entorno o un archivo `.env` ignorado por `.gitignore`.
- Revisa que `.openclaw/config.json` esté en `.gitignore` si contiene contraseñas.

---

*Free JT7 — Real MT5 Integration on Linux via Wine*
