-- ═══════════════════════════════════════════════════════════
-- Viáticos · etapa 3: el buzón de facturas
--
-- Un script de Google (buzon.gs) vive en el Gmail personal de Leo.
-- Cada 15 min lee los XML de factura que le llegan, los manda aquí,
-- y guarda PDF + XML en su Drive en la carpeta que esto le diga.
--
-- El script no tiene sesión de la app: se identifica con la LLAVE
-- DEL BUZÓN, que la app genera (via_llave_buzon) y pega dentro del
-- script. Aquí sólo se guarda su huella sha256.
--
-- Lo que se decide aquí (y no en el script) para que viva en un
-- solo lugar: si la factura está bien hecha para la Ibero, con qué
-- ticket va, y en qué carpeta de Drive debe estar.
--
--   python supabase/correr.py supabase/buzon.sql --si-borra
-- ═══════════════════════════════════════════════════════════

alter table viaticos.usuarios add column if not exists buzon_llave text;
alter table viaticos.usuarios add column if not exists buzon jsonb not null default '{}';

create table if not exists viaticos.facturas (
  uuid text primary key,
  usuario text not null references viaticos.usuarios,
  ticket text,
  d jsonb not null,
  creado timestamptz not null default now(),
  actualizado timestamptz not null default now()
);
create index if not exists facturas_usuario on viaticos.facturas (usuario);
alter table viaticos.facturas enable row level security;
revoke all on viaticos.facturas from public, anon, authenticated;

-- minúsculas, sin acentos, sólo letras y números
create or replace function viaticos._norm(t text) returns text language sql immutable as $$
  select trim(regexp_replace(translate(lower(coalesce(t, '')), 'áéíóúüñàèìòù', 'aeiouunaeiou'), '[^a-z0-9]+', ' ', 'g'))
$$;

create or replace function viaticos._buzon(p_llave text) returns text language plpgsql as $$
declare u text;
begin
  select usuario into u from viaticos.usuarios
   where buzon_llave is not null and buzon_llave = encode(extensions.digest(coalesce(p_llave, ''), 'sha256'), 'hex');
  if u is null then perform pg_sleep(0.5); raise exception 'LLAVE_BUZON' using errcode = '28000'; end if;
  return u;
end $$;

-- ¿Está bien hecha para la Ibero? Errores = hay que pedir que la corrijan.
-- Avisos = puede servir, pero conviene revisarlo.
create or replace function viaticos._revisar(f jsonb) returns jsonb language plpgsql immutable as $$
declare e text[] := '{}'; a text[] := '{}';
begin
  if coalesce(f->>'version', '') <> '4.0' then
    e := e || ('Es CFDI ' || coalesce(f->>'version', '¿?') || '; desde 2023 sólo vale la versión 4.0');
  end if;
  if upper(coalesce(f->>'receptor_rfc', '')) <> 'PDO820623P92' then
    e := e || ('Está a nombre del RFC ' || coalesce(f->>'receptor_rfc', '¿?') || ', no del de la Ibero (PDO820623P92)');
  end if;
  if viaticos._norm(f->>'receptor_nombre') <> 'promocion y docencia' then
    e := e || ('La razón social dice «' || coalesce(f->>'receptor_nombre', '') || '»; debe decir PROMOCION Y DOCENCIA');
  end if;
  if coalesce(f->>'receptor_regimen', '') <> '603' then
    e := e || ('Régimen fiscal del receptor ' || coalesce(f->>'receptor_regimen', 'vacío') || '; debe ser 603');
  end if;
  if coalesce(f->>'receptor_cp', '') <> '22500' then
    e := e || ('Código postal del receptor ' || coalesce(f->>'receptor_cp', 'vacío') || '; debe ser 22500');
  end if;
  if f->'sat'->>'estado' = 'Cancelado' then
    e := e || 'El SAT la reporta CANCELADA'::text;
  end if;
  if coalesce(f->>'uso', '') <> 'G03' then
    a := a || ('Uso del CFDI ' || coalesce(f->>'uso', 'vacío') || ' (se pidió G03); pregunta a Contabilidad si sirve');
  end if;
  if coalesce(f->>'tipo', 'I') <> 'I' then
    a := a || ('Es de tipo ' || (f->>'tipo') || (case f->>'tipo' when 'E' then ' (nota de crédito)' when 'P' then ' (complemento de pago)' else '' end) || ', no una factura de ingreso');
  end if;
  if coalesce(f->>'moneda', 'MXN') not in ('MXN', 'XXX') then
    a := a || ('Está en ' || (f->>'moneda'));
  end if;
  if f->'sat'->>'estado' = 'No Encontrado' then
    a := a || 'El SAT todavía no la encuentra (es normal las primeras horas)'::text;
  end if;
  return jsonb_build_object('errores', to_jsonb(e), 'avisos', to_jsonb(a));
end $$;

-- Carpeta de Drive donde debe estar: la del viaje del ticket.
create or replace function viaticos._carpeta(u text, p_ticket text) returns text language sql stable as $$
  select coalesce(
    (select case when t.borrado then null
                 else coalesce(nullif(replace(trim(v.d->>'nombre'), '/', '-'), ''), 'Sin viaje') end
       from viaticos.tickets t left join viaticos.viajes v on v.id = t.viaje and not v.borrado
      where t.id = p_ticket and t.usuario = u),
    'Por asignar')
$$;

-- ¿Con qué ticket va? Mismo total (±1 peso), ticket de hasta 45 días
-- antes de la factura, todavía sin factura. Si hay varios: primero el
-- del mismo RFC, luego el del nombre parecido, luego el más cercano.
create or replace function viaticos._empatar(u text, f jsonb) returns text language sql stable as $$
  select t.id from viaticos.tickets t
   where t.usuario = u and not t.borrado
     and coalesce(t.d->>'factura', 'pendiente') in ('pendiente', 'solicitada')
     and coalesce(t.d->>'uuid', '') = ''
     and not exists (select 1 from viaticos.facturas x where x.ticket = t.id)
     and jsonb_typeof(t.d->'total') = 'number'
     and abs((t.d->>'total')::numeric - (f->>'total')::numeric) <= 1
     and (t.d->>'fecha' is null
          or (t.d->>'fecha')::date between (f->>'fecha')::date - 45 and (f->>'fecha')::date + 1)
   order by (upper(coalesce(t.d->>'rfc', '')) = upper(coalesce(f->>'emisor_rfc', '-'))) desc,
            (split_part(viaticos._norm(f->>'emisor_nombre'), ' ', 1) <> ''
              and viaticos._norm(t.d->>'comercio') like '%' || split_part(viaticos._norm(f->>'emisor_nombre'), ' ', 1) || '%') desc,
            abs((t.d->>'total')::numeric - (f->>'total')::numeric),
            abs((t.d->>'fecha')::date - (f->>'fecha')::date) nulls last
   limit 1
$$;

-- Liga (o suelta, con p_ticket null) una factura y un ticket.
create or replace function viaticos._ligar(u text, p_uuid text, p_ticket text) returns void language plpgsql as $$
declare f jsonb;
begin
  select d into f from viaticos.facturas where uuid = p_uuid and usuario = u;
  if f is null then raise exception 'FACTURA_NO_EXISTE'; end if;
  if p_ticket is not null and not exists (select 1 from viaticos.tickets where id = p_ticket and usuario = u) then
    raise exception 'AJENO';
  end if;
  -- el ticket que la tenía la suelta
  update viaticos.tickets set d = (d - 'uuid') || '{"factura":"pendiente"}'::jsonb, actualizado = now()
   where usuario = u and d->>'uuid' = p_uuid and id is distinct from p_ticket;
  update viaticos.facturas set ticket = p_ticket, actualizado = now() where uuid = p_uuid;
  if p_ticket is null then return; end if;
  -- si el ticket ya tenía otra factura, ésa queda sin ticket
  update viaticos.facturas set ticket = null, actualizado = now() where usuario = u and ticket = p_ticket and uuid <> p_uuid;
  update viaticos.tickets t set
    d = t.d || jsonb_build_object('factura', 'recibida', 'uuid', p_uuid, 'rfc', f->>'emisor_rfc')
        || (case when coalesce(t.d->>'comercio', '') = '' then jsonb_build_object('comercio', f->>'emisor_nombre') else '{}'::jsonb end)
        || (case when jsonb_typeof(t.d->'total') is distinct from 'number' then jsonb_build_object('total', (f->>'total')::numeric) else '{}'::jsonb end)
        || (case when coalesce(t.d->>'fecha', '') = '' then jsonb_build_object('fecha', f->>'fecha') else '{}'::jsonb end),
    actualizado = now()
  where id = p_ticket;
end $$;

-- ── Lo que llama el script de Gmail ────────────────────────

create or replace function public.via_buzon_factura(p_llave text, p_f jsonb) returns jsonb
language plpgsql security definer set search_path = viaticos, public as $$
declare u text := viaticos._buzon(p_llave); id text := upper(trim(coalesce(p_f->>'uuid', ''))); x viaticos.facturas; t text;
begin
  if id !~ '^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$' then raise exception 'UUID_INVALIDO'; end if;
  -- Su Gmail es personal: trae también facturas de sus compras. Sólo se
  -- toman las que son de la Ibero, o las que caen en las fechas de un viaje
  -- (ésas, aunque vengan a su nombre: es justo el error que hay que cachar).
  if upper(coalesce(p_f->>'receptor_rfc', '')) <> 'PDO820623P92'
     and not exists (select 1 from viaticos.viajes v
                      where v.usuario = u and not v.borrado
                        and (p_f->>'fecha')::date between coalesce((v.d->>'inicio')::date, '1900-01-01'::date) - 2
                                                      and coalesce((v.d->>'fin')::date, (v.d->>'inicio')::date, '2999-01-01'::date) + 45) then
    return jsonb_build_object('uuid', id, 'ignorada', true);
  end if;
  select * into x from viaticos.facturas where uuid = id;
  if found then
    if x.usuario <> u then raise exception 'AJENO'; end if;
    return jsonb_build_object('uuid', id, 'nuevo', false, 'drive', x.d->'drive', 'carpeta', viaticos._carpeta(u, x.ticket));
  end if;
  insert into viaticos.facturas (uuid, usuario, d)
  values (id, u, (p_f - 'drive') || viaticos._revisar(p_f) || jsonb_build_object('uuid', id, 'recibida', now()));
  -- sólo las de ingreso pagan un ticket
  if coalesce(p_f->>'tipo', 'I') = 'I' then
    t := viaticos._empatar(u, p_f);
    if t is not null then perform viaticos._ligar(u, id, t); end if;
  end if;
  return jsonb_build_object('uuid', id, 'nuevo', true, 'ticket', t, 'carpeta', viaticos._carpeta(u, t));
end $$;

create or replace function public.via_buzon_archivos(p_llave text, p_uuid text, p_drive jsonb) returns void
language plpgsql security definer set search_path = viaticos, public as $$
declare u text := viaticos._buzon(p_llave);
begin
  update viaticos.facturas set d = d || jsonb_build_object('drive', p_drive), actualizado = now()
   where uuid = upper(p_uuid) and usuario = u;
end $$;

-- Facturas cuyos archivos están en otra carpeta de la que les toca
-- (se asignaron a mano, se cambió el ticket de viaje, se renombró el viaje).
create or replace function public.via_buzon_pendientes(p_llave text) returns jsonb
language plpgsql security definer set search_path = viaticos, public as $$
declare u text := viaticos._buzon(p_llave);
begin
  return coalesce((select jsonb_agg(jsonb_build_object('uuid', f.uuid, 'drive', f.d->'drive', 'carpeta', viaticos._carpeta(u, f.ticket)))
    from viaticos.facturas f
   where f.usuario = u and f.d ? 'drive'
     and f.d->'drive'->>'carpeta' is distinct from viaticos._carpeta(u, f.ticket)), '[]'::jsonb);
end $$;

-- El script avisa que sigue vivo. Si Leo no ha puesto su correo en la
-- app, se toma el de la cuenta donde corre el script.
create or replace function public.via_buzon_latido(p_llave text, p_info jsonb) returns void
language plpgsql security definer set search_path = viaticos, public as $$
declare u text := viaticos._buzon(p_llave);
begin
  update viaticos.usuarios set
    buzon = coalesce(p_info, '{}'::jsonb) || jsonb_build_object('visto', now()),
    ajustes = case when coalesce(ajustes->>'correo', '') = '' and coalesce(p_info->>'cuenta', '') like '%@%'
                   then ajustes || jsonb_build_object('correo', p_info->>'cuenta') else ajustes end
  where usuario = u;
end $$;

-- ── Lo que llama la app ────────────────────────────────────

-- Llave nueva para el script. La anterior deja de servir.
create or replace function public.via_llave_buzon(p_token text) returns text
language plpgsql security definer set search_path = viaticos, public as $$
declare u text := viaticos._sesion(p_token); k text := encode(extensions.gen_random_bytes(24), 'hex');
begin
  update viaticos.usuarios set buzon_llave = encode(extensions.digest(k, 'sha256'), 'hex') where usuario = u;
  return k;
end $$;

create or replace function public.via_asignar_factura(p_token text, p_uuid text, p_ticket text) returns void
language plpgsql security definer set search_path = viaticos, public as $$
declare u text := viaticos._sesion(p_token);
begin
  perform viaticos._ligar(u, upper(p_uuid), nullif(p_ticket, ''));
end $$;

-- via_datos ahora trae también las facturas y el estado del buzón.
create or replace function public.via_datos(p_token text) returns jsonb
language plpgsql security definer set search_path = viaticos, public as $$
declare u text := viaticos._sesion(p_token);
begin
  return jsonb_build_object(
    'nombre',  (select nombre from viaticos.usuarios where usuario = u),
    'ajustes', (select ajustes from viaticos.usuarios where usuario = u),
    'buzon',   (select buzon || jsonb_build_object('conectado', buzon_llave is not null) from viaticos.usuarios where usuario = u),
    'viajes',  coalesce((select jsonb_agg(d order by d->>'inicio' desc nulls last) from viaticos.viajes
                          where usuario = u and not borrado), '[]'::jsonb),
    'tickets', coalesce((select jsonb_agg(d || jsonb_build_object('actualizado', actualizado)
                                          order by d->>'fecha' desc nulls last, creado desc)
                          from viaticos.tickets where usuario = u and not borrado), '[]'::jsonb),
    'facturas', coalesce((select jsonb_agg(f.d || jsonb_build_object('ticket',
                            case when t.id is null or t.borrado then null else f.ticket end)
                                           order by f.d->>'fecha' desc)
                          from viaticos.facturas f left join viaticos.tickets t on t.id = f.ticket
                          where f.usuario = u), '[]'::jsonb),
    'ahora', now());
end $$;

revoke all on function viaticos._buzon(text) from public, anon, authenticated;
