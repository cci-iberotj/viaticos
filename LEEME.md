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
2. Asistente para facturar: portal del comercio con los datos listos, avisos de vencimiento.
3. Gmail personal → Drive con Apps Script: recoger PDF + XML, validar receptor y montos, empatar con el ticket.
4. Paquete para contadores: Excel (con sección aparte de gastos sin factura) + ZIP con archivos renombrados + enlace de Drive.
