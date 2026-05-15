# HUB OPERATIVO NAL · ABC Ximple Logistics
## Instrucciones completas de configuración y despliegue

---

## PASO 1 — GOOGLE SHEETS

### 1.1 Configura tus hojas con estos nombres EXACTOS:

| Nombre en Sheets | Contenido |
|---|---|
| `Estatus_Diario` | EstatusDiarioDetalle |
| `Incidencias` | Incidencias mensuales |
| `Rendimientos` | Rendimientos por unidad |
| `Solicitudes_Mtto` | Solicitudes de mantenimiento |
| `Data` | Circuitos y utilidad |
| `Movimientos_RH` | Movimientos de RH |
| `Whats App` | Pega aquí conversaciones de WhatsApp |
| `Urgencias` | Se llena automáticamente |

### 1.2 Crea las hojas nuevas:
1. En tu Sheets abre el menú **+** abajo
2. Crea hoja llamada exactamente `Whats App`
3. Crea hoja llamada exactamente `Urgencias`

---

## PASO 2 — GOOGLE APPS SCRIPT

### 2.1 Abrir el editor:
1. En tu Sheets: **Extensiones → Apps Script**
2. Borra todo el código que aparece
3. Pega el contenido completo de `Apps Script.gs`
4. Guarda (Ctrl+S)

### 2.2 Inicializar hojas (solo primera vez):
1. En el editor de Apps Script
2. Selecciona la función `inicializarHojas` en el menú desplegable
3. Haz clic en **▶ Ejecutar**
4. Acepta los permisos que te pida

### 2.3 Desplegar como Web App:
1. Clic en **Implementar → Nueva implementación**
2. Tipo: **Aplicación web**
3. Ejecutar como: **Yo**
4. Quién tiene acceso: **Cualquier persona**
5. Clic en **Implementar**
6. **COPIA la URL que te da** — la necesitas para el paso 3

### 2.4 Configurar trigger de WhatsApp (automático):
1. En Apps Script: **Activadores → + Agregar activador**
2. Función: `triggerWhatsapp`
3. Origen del evento: **Basado en el tiempo**
4. Tipo: **Cada 10 minutos**
5. Guardar

---

## PASO 3 — CONFIGURAR LA APP

### 3.1 Abre `config.js` y actualiza:
```javascript
APPS_SCRIPT_URL: 'PEGA_AQUI_LA_URL_DEL_PASO_2.3',
```

También verifica que los nombres de hojas coincidan exactamente:
```javascript
SHEETS: {
  ESTATUS:     'Estatus_Diario',  // ← nombre exacto en tu Sheets
  INCIDENCIAS: 'Incidencias',
  // etc...
}
```

---

## PASO 4 — ICONOS

Necesitas 2 imágenes en la carpeta `icons/`:
- `icon-192.png` (192×192 px)
- `icon-512.png` (512×512 px)

**Opción rápida:** Usa cualquier herramienta online para crear un ícono de trailer/logística y redimensiona a esos tamaños.

Estructura de carpetas:
```
hub_nal/
├── index.html
├── config.js
├── app.js
├── sheets.js
├── service-worker.js
├── manifest.json
├── Apps Script.gs
├── README.md
└── icons/
    ├── icon-192.png
    └── icon-512.png
```

---

## PASO 5 — SUBIR A GITHUB PAGES

### 5.1 Crear repositorio:
1. Ve a github.com → **New repository**
2. Nombre: `hub-nal-abc` (o el que quieras)
3. Visibilidad: **Public** (necesario para Pages gratuito)
4. Crea el repositorio

### 5.2 Subir archivos:
**Opción A (sin instalar nada):**
1. En GitHub, clic en **Add file → Upload files**
2. Arrastra TODOS los archivos de la carpeta `hub_nal`
3. Arrastra también la carpeta `icons` con los íconos
4. Commit: "Versión inicial HUB NAL"

**Opción B (con Git instalado):**
```bash
cd hub_nal
git init
git add .
git commit -m "Versión inicial HUB NAL"
git remote add origin https://github.com/TU_USUARIO/hub-nal-abc.git
git push -u origin main
```

### 5.3 Activar GitHub Pages:
1. En tu repositorio: **Settings → Pages**
2. Source: **Deploy from a branch**
3. Branch: **main** / **(root)**
4. Clic en **Save**
5. En 2-3 minutos tendrás una URL: `https://TU_USUARIO.github.io/hub-nal-abc`

**Esa URL es la que le mandas a tu jefe.** Nunca cambia.

---

## PASO 6 — USO DIARIO

### Para actualizar datos:
1. Actualiza tus archivos Excel normalmente
2. Ve a tu Google Sheets
3. Pega los datos actualizados en las hojas correspondientes
4. El Hub se actualiza automáticamente en el intervalo configurado

### Para analizar WhatsApp:
1. Ve a la hoja `Whats App` en tu Sheets
2. Pega el texto de las conversaciones
3. El sistema detecta automáticamente urgencias cada 10 minutos
4. Las urgencias aparecen en el Hub en la sección "Urgencias WhatsApp"

### Para instalar como app en el teléfono:
**iPhone:**
1. Abre la URL en Safari
2. Toca el botón de compartir (cuadrado con flecha)
3. "Agregar a pantalla de inicio"
4. La app aparece como cualquier app normal

**Android:**
1. Abre la URL en Chrome
2. Menú (3 puntos) → "Instalar app"
3. O aparece un banner automático de instalación

---

## CÓMO VE TU JEFE EL REPORTE

1. Tú le mandas la URL de GitHub Pages **una sola vez**
2. Él la guarda en favoritos o la instala como app
3. Cada vez que la abre, ve los datos más recientes
4. No tiene que hacer nada — solo abrir la liga

---

## SOLUCIÓN DE PROBLEMAS

| Problema | Solución |
|---|---|
| La app no carga datos | Verifica que el Apps Script esté desplegado con acceso "Cualquier persona" |
| Error CORS | Vuelve a desplegar el Apps Script como nueva versión |
| Los datos no coinciden | Revisa que los nombres de hojas sean exactos (mayúsculas incluidas) |
| No detecta mis unidades | Verifica en `config.js` que la lista `UNIDADES_NACIONALES` tenga los 83 IDs |
| WhatsApp no procesa | Activa el trigger en Apps Script (Paso 2.4) |

---

## ACTUALIZAR LISTA DE UNIDADES

Cuando agregues o quites unidades, solo edita `config.js`:
```javascript
UNIDADES_NACIONALES: [
  '014-ABC',
  '019-ABC',
  // ... agrega o quita aquí
],
```

Vuelve a subir el archivo a GitHub y listo.
