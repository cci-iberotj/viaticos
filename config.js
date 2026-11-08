/* ═══════════════════════════════════════════════════════════
   Viáticos · IBERO Tijuana
   Lo fijo vive aquí. Lo que cambia por persona (su correo para
   facturas, el viaje activo) se guarda en la base.
   ═══════════════════════════════════════════════════════════ */
'use strict';

const CONFIG = {

  version: '1.7',

  nube: {
    /* La llave publicable está hecha para vivir en el navegador: lo
       que protege los datos es que las tablas no se ven y cada
       función via_* revisa la sesión. */
    url:   'https://wrezcukptrtmnhnlxmao.supabase.co',
    llave: 'sb_publishable_XTkkarWw-P3Ls31g5ZDTOA_ZghkWshN',
  },

  /* Receptor de las facturas. En CFDI 4.0 el nombre, el régimen y el
     código postal tienen que coincidir con la constancia del SAT. */
  fiscales: [
    { id: 'rfc',     etiqueta: 'RFC',            valor: 'PDO820623P92' },
    { id: 'razon',   etiqueta: 'Razón social',   valor: 'PROMOCION Y DOCENCIA',
      nota: 'Tal cual, en mayúsculas, sin acento y sin agregar «A.C.».' },
    { id: 'regimen', etiqueta: 'Régimen fiscal', valor: '603', detalle: 'Personas Morales con Fines no Lucrativos' },
    { id: 'cp',      etiqueta: 'Código postal',  valor: '22500' },
    { id: 'uso',     etiqueta: 'Uso del CFDI',   valor: 'G03', detalle: 'Gastos en general',
      nota: 'Por confirmar con Contabilidad.' },
  ],

  categorias: [
    { id: 'hospedaje',  nombre: 'Hospedaje' },
    { id: 'alimentos',  nombre: 'Alimentos' },
    { id: 'transporte', nombre: 'Transporte' },
    { id: 'otros',      nombre: 'Otros' },
  ],

  /* Estado de la factura de cada ticket */
  facturas: [
    { id: 'pendiente', nombre: 'Por pedir' },
    { id: 'solicitada', nombre: 'Pedida' },
    { id: 'recibida',  nombre: 'Recibida' },
    { id: 'sin',       nombre: 'No tiene' },
  ],

  /* Días antes de la fecha límite en que el ticket se pinta de alerta */
  avisoDias: 5,

  /* Foto: lado largo máximo y calidad JPEG. 1600 px deja leer el
     folio de un ticket térmico y pesa unos 200 KB. */
  foto: { lado: 1600, calidad: 0.75 },
};
