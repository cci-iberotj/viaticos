# -*- coding: utf-8 -*-
"""Viáticos - servidor local para probar

    python servidor.py          → abre http://localhost:8798/

Sólo sirve los archivos de esta carpeta; los datos van a la base de
LA PIZARRA igual que en el sitio publicado. La cámara del celular
sólo se puede probar publicada (https).
"""

import os
import sys
import threading
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

RAIZ = os.path.dirname(os.path.abspath(__file__))
PUERTO = int(os.environ.get('PORT') or 8798)


class Manejador(SimpleHTTPRequestHandler):
    extensions_map = dict(SimpleHTTPRequestHandler.extensions_map, **{'.webmanifest': 'application/manifest+json', '.js': 'text/javascript'})

    def __init__(self, *a, **k):
        super().__init__(*a, directory=RAIZ, **k)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, fmt, *args):
        pass


def main():
    servidor = ThreadingHTTPServer(("127.0.0.1", PUERTO), Manejador)
    url = "http://localhost:{}/".format(PUERTO)
    print("\n  Viáticos: {}\n  Ctrl+C para cerrar.\n".format(url))
    if "--sin-navegador" not in sys.argv:
        threading.Timer(0.6, lambda: webbrowser.open(url)).start()
    try:
        servidor.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
