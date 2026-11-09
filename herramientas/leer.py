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


def nuevo(imagen, pares):
    """Ticket nuevo desde una imagen que Leo mandó al chat (no por la app).
    La foto se reduce igual que en el celular (1600 px, JPEG 75) y el viaje
    es el que abarca la fecha del ticket, o el activo."""
    import io as _io
    import random
    import time
    from PIL import Image, ImageOps
    im = ImageOps.exif_transpose(Image.open(imagen)).convert('RGB')
    im.thumbnail((1600, 1600))
    buf = _io.BytesIO()
    im.save(buf, 'JPEG', quality=75)
    datos = 'data:image/jpeg;base64,' + base64.b64encode(buf.getvalue()).decode()

    d = {}
    for p in pares:
        k, _, v = p.partition('=')
        d[k] = (float(v.replace(',', '')) if k in NUMERICOS else v) if v != '' else None
    base36 = lambda n: '' if n == 0 else base36(n // 36) + '0123456789abcdefghijklmnopqrstuvwxyz'[n % 36]
    id_ = 'tk-' + base36(int(time.time() * 1000)) + ''.join(random.choice('abcdefghijklmnopqrstuvwxyz0123456789') for _ in range(4))
    if not d.get('viaje'):
        v = sql("select id from viaticos.viajes where usuario = %s and not borrado and %s::date between "
                "coalesce((d->>'inicio')::date, '1900-01-01') and coalesce((d->>'fin')::date, '2999-01-01') limit 1"
                % (lit(USUARIO), lit(d.get('fecha') or '1900-01-01')))
        d['viaje'] = v[0]['id'] if v else None
    d.update({'id': id_, 'foto': True, 'leido': 'claude', 'origen': 'chat',
              'factura': d.get('factura') or 'pendiente', 'creado': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())})
    sql("insert into viaticos.tickets (id, usuario, viaje, d) values (%s, %s, %s, %s::jsonb); "
        "insert into viaticos.fotos (ticket, datos) values (%s, %s)"
        % (lit(id_), lit(USUARIO), lit(d['viaje']) if d['viaje'] else 'null', lit(json.dumps(d, ensure_ascii=False)), lit(id_), lit(datos)))
    sys.stdout.reconfigure(encoding='utf-8')
    print('%s  %s  %s  %s  (foto %d KB)' % (id_, d.get('fecha'), d.get('comercio'), d.get('total'), len(buf.getvalue()) // 1024))


def leer_cfdi(ruta):
    """Lo mismo que leerCfdi() de buzon.gs, en Python: por nombres locales."""
    import xml.etree.ElementTree as ET
    raiz = ET.parse(ruta).getroot()
    loc = lambda e: e.tag.split('}')[-1]
    hijo = lambda e, n: next((c for c in (e if e is not None else []) if loc(c) == n), None)
    hijos = lambda e, n: [c for c in (e if e is not None else []) if loc(c) == n]
    at = lambda e, n: e.get(n) if e is not None else None
    num = lambda v: float(v) if v else 0.0
    if loc(raiz) != 'Comprobante':
        return None
    em, re_ = hijo(raiz, 'Emisor'), hijo(raiz, 'Receptor')
    tfd = hijo(hijo(raiz, 'Complemento'), 'TimbreFiscalDigital')
    iva = sum(num(at(t, 'Importe')) for t in hijos(hijo(hijo(raiz, 'Impuestos'), 'Traslados'), 'Traslado') if at(t, 'Impuesto') == '002')
    fecha = at(raiz, 'Fecha') or ''
    return {
        'uuid': at(tfd, 'UUID').upper(), 'version': at(raiz, 'Version'), 'tipo': at(raiz, 'TipoDeComprobante'),
        'fecha': fecha[:10], 'fecha_hora': fecha, 'timbrado': at(tfd, 'FechaTimbrado'),
        'serie': at(raiz, 'Serie'), 'folio': at(raiz, 'Folio'),
        'emisor_rfc': at(em, 'Rfc'), 'emisor_nombre': at(em, 'Nombre'), 'emisor_regimen': at(em, 'RegimenFiscal'),
        'receptor_rfc': at(re_, 'Rfc'), 'receptor_nombre': at(re_, 'Nombre'),
        'receptor_cp': at(re_, 'DomicilioFiscalReceptor'), 'receptor_regimen': at(re_, 'RegimenFiscalReceptor'),
        'uso': at(re_, 'UsoCFDI'),
        'subtotal': num(at(raiz, 'SubTotal')), 'descuento': num(at(raiz, 'Descuento')),
        'iva': round(iva, 2), 'total': num(at(raiz, 'Total')),
        'moneda': at(raiz, 'Moneda'), 'forma_pago': at(raiz, 'FormaPago'), 'metodo_pago': at(raiz, 'MetodoPago'),
        'conceptos': [at(c, 'Descripcion') for c in hijos(hijo(raiz, 'Conceptos'), 'Concepto')[:3]],
    }


def estado_sat(f):
    import re
    import urllib.request
    expr = '?re=%s&rr=%s&tt=%.6f&id=%s' % (f['emisor_rfc'], f['receptor_rfc'], f['total'], f['uuid'])
    sobre = ('<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:tem="http://tempuri.org/">'
             '<soapenv:Header/><soapenv:Body><tem:Consulta><tem:expresionImpresa><![CDATA[%s]]></tem:expresionImpresa>'
             '</tem:Consulta></soapenv:Body></soapenv:Envelope>' % expr)
    try:
        r = urllib.request.urlopen(urllib.request.Request(
            'https://consultaqr.facturaelectronica.sat.gob.mx/ConsultaCFDIService.svc', data=sobre.encode(),
            headers={'Content-Type': 'text/xml; charset=utf-8', 'SOAPAction': 'http://tempuri.org/IConsultaCFDIService/Consulta'}), timeout=30)
        m = re.search(r'<a:Estado>([^<]*)</a:Estado>', r.read().decode())
        return {'estado': m.group(1), 'revisado': __import__('time').strftime('%Y-%m-%dT%H:%M:%SZ', __import__('time').gmtime())} if m else None
    except Exception:
        return None


def factura(xml, ticket=None):
    """Carga una factura desde su XML (cuando Leo la bajó del portal, sin
    esperar al buzón). Revisa, consulta al SAT y la liga a su ticket: el que
    se indique, o el que encuentre la misma regla del buzón. Copia PDF y XML
    a datos/facturas/; el buzón, cuando esté instalado, la subirá a Drive."""
    import shutil
    f = leer_cfdi(xml)
    if not f:
        sys.exit('  Ese XML no es un CFDI.')
    f['sat'] = estado_sat(f)
    f['origen'] = 'descarga'
    u = lit(USUARIO)
    r = sql("""insert into viaticos.facturas (uuid, usuario, d)
               values (%(id)s, %(u)s, %(f)s::jsonb || viaticos._revisar(%(f)s::jsonb) || jsonb_build_object('uuid', %(id)s, 'recibida', now()))
               on conflict (uuid) do update set d = viaticos.facturas.d || excluded.d, actualizado = now()
               returning ticket""" % {'id': lit(f['uuid']), 'u': u, 'f': lit(json.dumps(f, ensure_ascii=False))})
    t = ticket or (r and r[0]['ticket']) or (sql("select viaticos._empatar(%s, %s::jsonb) t" % (u, lit(json.dumps(f))))[0]['t'])
    if t:
        sql("select viaticos._ligar(%s, %s, %s)" % (u, lit(f['uuid']), lit(t)))
    destino = os.path.join(RAIZ, 'datos', 'facturas')
    os.makedirs(destino, exist_ok=True)
    for ext in ('.xml', '.pdf'):
        orig = os.path.splitext(xml)[0] + ext
        if os.path.exists(orig):
            shutil.copy2(orig, os.path.join(destino, f['uuid'] + ext))
    fila = sql("select d->'errores' errores, d->'avisos' avisos, ticket from viaticos.facturas where uuid = %s" % lit(f['uuid']))[0]
    sys.stdout.reconfigure(encoding='utf-8')
    print(json.dumps({k: f[k] for k in ('uuid', 'emisor_nombre', 'emisor_rfc', 'receptor_nombre', 'uso', 'subtotal', 'iva', 'total', 'fecha')}, ensure_ascii=False, indent=1))
    print('  SAT:', (f['sat'] or {}).get('estado', 'sin respuesta'), '· ticket:', fila['ticket'], '· errores:', fila['errores'], '· avisos:', fila['avisos'])


if __name__ == '__main__':
    a = sys.argv[1:]
    if not a or a[0] not in ('pendientes', 'todos', 'llenar', 'nuevo', 'qr', 'factura'):
        sys.exit(__doc__)
    if a[0] == 'factura':
        factura(a[1], a[2] if len(a) > 2 else None)
    elif a[0] == 'qr':
        sys.stdout.reconfigure(encoding='utf-8')
        print(leer_qr(a[1]) or '(sin QR legible)')
    elif a[0] == 'nuevo':
        nuevo(a[1], a[2:])
    elif a[0] == 'llenar':
        llenar(a[1], a[2:])
    else:
        bajar(a[0] == 'pendientes')
