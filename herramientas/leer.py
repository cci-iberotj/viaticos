# -*- coding: utf-8 -*-
"""Leer tickets: la parte que en otra app haría la IA.

La app no trae IA a propósito (Leo lo decidió el 8-nov-2026). Él toma
la foto y el ticket queda «Por leer»; Claude baja las fotos, las lee y
llena los campos desde aquí.

    python herramientas/leer.py pendientes          baja a datos/por_leer/ las fotos sin leer
    python herramientas/leer.py todos               baja todas (para revisar)
    python herramientas/leer.py llenar ID campo=valor campo=valor ...

Campos: total, comercio, rfc, fecha (AAAA-MM-DD), folio, portal,
categoria (hospedaje|alimentos|transporte|otros), factura
(pendiente|solicitada|recibida|sin), limite (AAAA-MM-DD), notas.

Se guarda POR DIFERENCIA (d = d || cambios), igual que la app: si Leo
está editando el mismo ticket en el celular, no se pisan.
"""

import base64
import json
import os
import sys

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(AQUI)
SALIDA = os.path.join(RAIZ, 'datos', 'por_leer')
USUARIO = os.environ.get('VIATICOS_USUARIO', 'leo')
NUMERICOS = {'total'}


sys.path.insert(0, os.path.join(RAIZ, 'supabase'))
from correr import ejecutar as sql   # noqa: E402  (la salida de correr.py se corta a 6000 caracteres)


def lit(s):
    return "'" + str(s).replace("'", "''") + "'"


def bajar(solo_pendientes):
    os.makedirs(SALIDA, exist_ok=True)
    filtro = ("and (coalesce((t.d->>'total')::numeric, 0) <= 0 or coalesce(t.d->>'comercio', '') = '') "
              "and coalesce(t.d->>'factura', '') <> 'sin'") if solo_pendientes else ''
    filas = sql("select t.id, t.d, f.datos from viaticos.tickets t join viaticos.fotos f on f.ticket = t.id "
                "where t.usuario = %s and not t.borrado %s order by t.creado" % (lit(USUARIO), filtro))
    sys.stdout.reconfigure(encoding='utf-8')
    if not filas:
        print('  Nada por leer.')
        return
    for f in filas:
        datos = f['datos'].split(',', 1)[1]
        ruta = os.path.join(SALIDA, f['id'] + '.jpg')
        with open(ruta, 'wb') as a:
            a.write(base64.b64decode(datos))
        d = f['d']
        print('%s  %s  %s  %s' % (ruta, d.get('fecha', ''), d.get('comercio', '') or '¿comercio?', d.get('total', '') or '¿total?'))
        qr = leer_qr(ruta)
        if qr:
            print('    QR: ' + qr)


def leer_qr(ruta):
    """Muchos tickets traen un QR «para facturar» con el folio ya puesto
    en la dirección. Se prueba la foto entera y a dos escalas."""
    try:
        import cv2
    except ImportError:
        return ''
    img = cv2.imread(ruta)
    if img is None:
        return ''
    det = cv2.QRCodeDetector()
    gris = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    def probar(im):
        for p in (im, cv2.threshold(im, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)[1]):
            try:
                t, _, _ = det.detectAndDecode(p)
            except cv2.error:
                t = ''
            if t:
                return t
        return ''

    t = probar(gris)
    if t:
        return t
    # En la foto de un ticket entero el QR queda chico (~100 px): se recorre
    # la foto en ventanas que se enciman y cada una se amplía 3 veces.
    h, w = gris.shape
    lado = max(300, min(h, w) // 3)
    paso = lado // 2
    for y in range(0, max(1, h - lado + paso), paso):
        for x in range(0, max(1, w - lado + paso), paso):
            v = gris[y:y + lado, x:x + lado]
            t = probar(cv2.resize(v, None, fx=3, fy=3, interpolation=cv2.INTER_CUBIC))
            if t:
                return t
    return ''


def llenar(id_, pares):
    cambios = {}
    for p in pares:
        k, _, v = p.partition('=')
        cambios[k] = (float(v.replace(',', '')) if k in NUMERICOS else v) if v != '' else None
    cambios['leido'] = 'claude'
    r = sql("update viaticos.tickets set d = d || %s::jsonb, actualizado = now() "
            "where id = %s and usuario = %s returning d" % (lit(json.dumps(cambios, ensure_ascii=False)), lit(id_), lit(USUARIO)))
    sys.stdout.reconfigure(encoding='utf-8')
    print(json.dumps(r, ensure_ascii=False, indent=1) if r else '  No existe ese ticket.')


if __name__ == '__main__':
    a = sys.argv[1:]
    if not a or a[0] not in ('pendientes', 'todos', 'llenar'):
        sys.exit(__doc__)
    if a[0] == 'llenar':
        llenar(a[1], a[2:])
    else:
        bajar(a[0] == 'pendientes')
