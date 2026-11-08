-- ═══════════════════════════════════════════════════════════
-- Viáticos · comprobación de gastos de viaje (CFDI 4.0)
-- Vive en la base de LA PIZARRA, en su propio esquema «viaticos».
-- (Un proyecto gratis aparte se pausa a los 7 días sin uso, como le
-- pasó a Nuestra Órbita; éste se usa a rachas, viaje por viaje.)
--
-- REGLA DE ORO: las tablas NO se ven desde la página. El esquema no
-- está expuesto en la API y además tiene RLS sin políticas. Todo pasa
-- por funciones public.via_* (security definer) que revisan la sesión
-- que da via_entrar (usuario + clave propia de Viáticos; NO son
-- cuentas de LA PIZARRA). Cada persona sólo ve lo suyo.
--
-- GUARDAR SIN PISAR: los tickets se guardan por DIFERENCIA
-- (d = d || cambios), no completos. Así, si Claude llena el total de
-- un ticket mientras el celular trae otro cambio en la cola, ninguno
-- borra al otro.
--
-- Se puede volver a correr: todo es «if not exists» / «or replace».
--   python supabase/correr.py supabase/esquema.sql --si-borra
-- ═══════════════════════════════════════════════════════════

create schema if not exists viaticos;
revoke all on schema viaticos from public, anon, authenticated;

create table if not exists viaticos.usuarios (
  usuario text primary key, nombre text not null, clave text not null,
  ajustes jsonb not null default '{}'
);
create table if not exists viaticos.sesiones (
  token text primary key, usuario text not null references viaticos.usuarios on delete cascade,
  expira timestamptz not null
);
create table if not exists viaticos.viajes (
  id text primary key, usuario text not null references viaticos.usuarios,
  d jsonb not null, borrado boolean not null default false,
  actualizado timestamptz not null default now()
);
create table if not exists viaticos.tickets (
  id text primary key, usuario text not null references viaticos.usuarios,
  viaje text, d jsonb not null, borrado boolean not null default false,
  creado timestamptz not null default now(),
  actualizado timestamptz not null default now()
);
create index if not exists tickets_usuario_viaje on viaticos.tickets (usuario, viaje);
-- La foto aparte: la lista no la carga, sólo la ficha cuando se abre.
create table if not exists viaticos.fotos (
  ticket text primary key references viaticos.tickets on delete cascade,
  datos text not null,                -- data:image/jpeg;base64,...
  creado timestamptz not null default now()
);

do $$ declare t text; begin
  foreach t in array array['usuarios','sesiones','viajes','tickets','fotos'] loop
    execute format('alter table viaticos.%I enable row level security', t);
    execute format('revoke all on viaticos.%I from public, anon, authenticated', t);
  end loop;
end $$;

-- ── Ayudantes privados ─────────────────────────────────────

create or replace function viaticos._sesion(t text) returns text language plpgsql as $$
declare u text;
begin
  select usuario into u from viaticos.sesiones where token = t and expira > now();
  if u is null then raise exception 'SIN_SESION' using errcode = '28000'; end if;
  return u;
end $$;

-- ── Lo que llama la página ─────────────────────────────────

-- Sesión de 180 días: en el celular se entra una vez y ya.
create or replace function public.via_entrar(p_usuario text, p_clave text) returns jsonb
language plpgsql security definer set search_path = viaticos, public as $$
declare u viaticos.usuarios; t text; exp timestamptz;
begin
  select * into u from viaticos.usuarios
   where usuario = lower(trim(coalesce(p_usuario, '')))
     and clave = extensions.crypt(coalesce(p_clave, ''), clave);
  if u.usuario is null then perform pg_sleep(0.8); raise exception 'CLAVE'; end if;
  delete from viaticos.sesiones where expira < now();
  t := encode(extensions.gen_random_bytes(24), 'hex');
  exp := now() + interval '180 days';
  insert into viaticos.sesiones values (t, u.usuario, exp);
  return jsonb_build_object('token', t, 'usuario', u.usuario, 'nombre', u.nombre, 'expira', exp);
end $$;

create or replace function public.via_salir(p_token text) returns void
language sql security definer set search_path = viaticos, public as
$$ delete from viaticos.sesiones where token = p_token $$;

create or replace function public.via_datos(p_token text) returns jsonb
language plpgsql security definer set search_path = viaticos, public as $$
declare u text := viaticos._sesion(p_token);
begin
  return jsonb_build_object(
    'nombre',  (select nombre from viaticos.usuarios where usuario = u),
    'ajustes', (select ajustes from viaticos.usuarios where usuario = u),
    'viajes',  coalesce((select jsonb_agg(d order by d->>'inicio' desc nulls last) from viaticos.viajes
                          where usuario = u and not borrado), '[]'::jsonb),
    'tickets', coalesce((select jsonb_agg(d || jsonb_build_object('actualizado', actualizado)
                                          order by d->>'fecha' desc nulls last, creado desc)
                          from viaticos.tickets where usuario = u and not borrado), '[]'::jsonb),
    'ahora', now());
end $$;

create or replace function public.via_guardar_ajustes(p_token text, p_cambios jsonb) returns jsonb
language plpgsql security definer set search_path = viaticos, public as $$
declare u text := viaticos._sesion(p_token); r jsonb;
begin
  update viaticos.usuarios set ajustes = ajustes || coalesce(p_cambios, '{}') where usuario = u
  returning ajustes into r;
  return r;
end $$;

create or replace function public.via_guardar_viaje(p_token text, p_v jsonb) returns jsonb
language plpgsql security definer set search_path = viaticos, public as $$
declare u text := viaticos._sesion(p_token); id text := p_v->>'id'; r jsonb;
begin
  if coalesce(id, '') = '' then raise exception 'SIN_ID'; end if;
  if exists (select 1 from viaticos.viajes v where v.id = p_v->>'id' and v.usuario <> u) then raise exception 'AJENO'; end if;
  insert into viaticos.viajes (id, usuario, d) values (id, u, p_v)
  on conflict on constraint viajes_pkey do update set d = viaticos.viajes.d || excluded.d, borrado = false, actualizado = now()
  returning d into r;
  return r;
end $$;

-- Un viaje con tickets no se borra: primero se mueven o se borran ellos.
create or replace function public.via_borrar_viaje(p_token text, p_id text) returns void
language plpgsql security definer set search_path = viaticos, public as $$
declare u text := viaticos._sesion(p_token);
begin
  if exists (select 1 from viaticos.tickets where usuario = u and viaje = p_id and not borrado) then
    raise exception 'VIAJE_CON_TICKETS';
  end if;
  update viaticos.viajes set borrado = true, actualizado = now() where id = p_id and usuario = u;
end $$;

-- Por diferencia: crea el ticket si no existe, o le funde los cambios.
create or replace function public.via_guardar_ticket(p_token text, p_id text, p_cambios jsonb) returns jsonb
language plpgsql security definer set search_path = viaticos, public as $$
declare u text := viaticos._sesion(p_token); c jsonb := coalesce(p_cambios, '{}') - 'actualizado'; r jsonb; ts timestamptz;
begin
  if coalesce(p_id, '') = '' then raise exception 'SIN_ID'; end if;
  if exists (select 1 from viaticos.tickets t where t.id = p_id and t.usuario <> u) then raise exception 'AJENO'; end if;
  insert into viaticos.tickets (id, usuario, viaje, d)
  values (p_id, u, c->>'viaje', c || jsonb_build_object('id', p_id))
  on conflict (id) do update set
    d = viaticos.tickets.d || excluded.d,
    viaje = coalesce(excluded.d->>'viaje', viaticos.tickets.viaje),
    actualizado = now()
  returning d, actualizado into r, ts;
  return r || jsonb_build_object('actualizado', ts);
end $$;

-- Borrar es reversible: p_si = false lo devuelve (botón «Deshacer»).
create or replace function public.via_borrar_ticket(p_token text, p_id text, p_si boolean default true) returns void
language plpgsql security definer set search_path = viaticos, public as $$
declare u text := viaticos._sesion(p_token);
begin
  update viaticos.tickets set borrado = coalesce(p_si, true), actualizado = now() where id = p_id and usuario = u;
end $$;

create or replace function public.via_guardar_foto(p_token text, p_id text, p_datos text) returns void
language plpgsql security definer set search_path = viaticos, public as $$
declare u text := viaticos._sesion(p_token);
begin
  if p_datos !~ '^data:image/(jpeg|png|webp);base64,' then raise exception 'FOTO_INVALIDA'; end if;
  if length(p_datos) > 4000000 then raise exception 'FOTO_GRANDE'; end if;
  -- si el ticket todavía no llegó (cola sin señal), se crea vacío
  insert into viaticos.tickets (id, usuario, d) values (p_id, u, jsonb_build_object('id', p_id))
  on conflict (id) do nothing;
  if not exists (select 1 from viaticos.tickets where id = p_id and usuario = u) then raise exception 'AJENO'; end if;
  insert into viaticos.fotos (ticket, datos) values (p_id, p_datos)
  on conflict (ticket) do update set datos = excluded.datos, creado = now();
  update viaticos.tickets set d = d || '{"foto": true}', actualizado = now() where id = p_id;
end $$;

create or replace function public.via_foto(p_token text, p_id text) returns text
language plpgsql security definer set search_path = viaticos, public as $$
declare u text := viaticos._sesion(p_token);
begin
  return (select f.datos from viaticos.fotos f join viaticos.tickets t on t.id = f.ticket
           where f.ticket = p_id and t.usuario = u);
end $$;

-- Las funciones privadas no se llaman desde fuera.
revoke all on function viaticos._sesion(text) from public, anon, authenticated;
