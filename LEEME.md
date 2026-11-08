# Viáticos · IBERO Tijuana

Tickets y facturas (CFDI 4.0) de los viajes de trabajo de Leo, desde el celular.

**Publicada en:** https://cci-iberotj.github.io/viaticos/
**Acceso:** usuario y clave en `datos/clave.txt` (fuera del repositorio). La sesión dura 6 meses.

## Cómo está hecha

| Pieza | Dónde |
|---|---|
| Página (se instala como app) | `index.html`, `app.js`, `estilos.css`, `config.js`, `sw.js`, `manifest.webmanifest` |
| Base | Supabase de LA PIZARRA (`wrezcukptrtmnhnlxmao`), esquema **`viaticos`** — `supabase/esquema.sql` |
| Publicación | `python publicar.py "qué cambió"` (sube versión, commit y `empujar.py` por la API de GitHub) |
| Probar en local | `ABRIR.bat` → http://localhost:8798/ |

- Las tablas no se ven desde la página: todo pasa por funciones `public.via_*` que revisan la sesión.
- Va dentro de LA PIZARRA porque un Supabase gratis aparte se pausa a los 7 días sin uso.
- **Sin señal no se pierde nada:** cada cambio entra a una cola en el celular (IndexedDB) y se sube solo.
- **Se guarda por diferencia:** sólo los campos que cambiaron (`d = d || cambios`).
- La foto se reduce a 1600 px (≈200 KB) y vive aparte (`viaticos.fotos`), base64.

## La lectura de tickets la hace Claude

La app no trae IA (decisión de Leo, 8-nov-2026). El ticket con foto y sin total o comercio queda «Por leer».

```
python herramientas/leer.py pendientes                     # baja las fotos a datos/por_leer/
python herramientas/leer.py llenar tk-... total=87.50 comercio="OXXO" folio=48213 categoria=alimentos
```

## Datos del receptor

PROMOCION Y DOCENCIA · RFC PDO820623P92 · régimen 603 · CP 22500 · uso G03 (por confirmar con Contabilidad).
Viven en `config.js` → `fiscales`.

## Etapas

1. ✅ Captura, lista, viajes con monto asignado, datos fiscales para copiar, fecha límite por ticket.
2. ✅ Asistente «Pedir factura» (4 pasos con todo para copiar), portales aprendidos por comercio (sin lista de fábrica: una dirección inventada es peor que ninguna), pistas por tipo de comercio, fecha límite rápida (mismo día · 24 h · 72 h · fin de mes), «Pedida hace N días», filtros de la lista.
3. ✅ Buzón de Gmail (`buzon.gs`, Apps Script en la cuenta de Leo, cada 15 min): lee XML (y ZIP), consulta estatus ante el SAT,
   `via_buzon_factura` revisa receptor/régimen/CP/uso y empata con el ticket (total ±1 peso, hasta 45 días antes, prefiere mismo RFC
   y nombre), guarda PDF + XML en Drive `Viáticos/<viaje>` y `via_buzon_pendientes` los reacomoda si cambian de viaje.
   El script se identifica con una LLAVE DEL BUZÓN (sólo se guarda su sha256); la app la genera al copiar el script (Viajes › Gmail).
   La app: tarjeta «Factura» en el ticket, «Facturas sin ticket» para asignar o crear ticket. Base: `supabase/buzon.sql`.
4. Paquete para contadores: Excel (con sección aparte de gastos sin factura) + ZIP con archivos renombrados + enlace de Drive.
