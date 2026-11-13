-- Live flight status (AeroDataBox via RapidAPI). Run once in Supabase → SQL Editor, after reminders.sql (safe to run again).
-- The API key is read from settings.flight_api_key (Settings page); nothing is requested while it is empty.
-- Each check costs 2 API units (the free plan has 400 a month), so flights are checked sparingly:
-- once within 24 hours, every 2 hours from 6 hours out, every 45 minutes in the last 2 hours until it lands or departs.
alter table settings add column if not exists flight_api_key text;

create table if not exists flight_status (
  flight text not null, flight_date date not null, section text not null check (section in ('arrival', 'departure')),
  planned timestamp,                 -- the time on the quotation (Sri Lanka time)
  status text, scheduled timestamp, estimated timestamp, terminal text, gate text, belt text, live boolean,
  checked_at timestamptz, error text,
  request_id bigint, requested_at timestamptz, notified_status text, notified_est timestamp,
  primary key (flight, flight_date, section)
);
alter table flight_status enable row level security;
drop policy if exists "auth read" on flight_status;
create policy "auth read" on flight_status for select to authenticated using (true);

-- "2026-11-12 23:30+05:30" or "2026-11-12T23:30" -> the local time as written
create or replace function private.ts16(x text) returns timestamp language sql immutable as $fn$
  select case when x ~ '^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}' then replace(left(x, 16), 'T', ' ')::timestamp end
$fn$;

-- Airport lines of accepted quotations that have a usable flight number, date and 24-hour time.
create or replace function private.flight_lines() returns table(flight text, flight_date date, section text, planned timestamp, info text)
language sql security definer set search_path = public as $fn$
  select upper(replace(i->>'flight', ' ', '')), (i->>'date')::date, i->>'section', (i->>'date')::date + (i->>'time')::time,
    c.name || ' (' || q.number || '), ' || coalesce(i->>'guests', '?') || ' pax, ' || coalesce(nullif(i->>'vehicle', ''), 'vehicle not chosen')
    || case when coalesce(i->'assign'->>'driver', '') = '' and coalesce(i->'assign'->>'vehicle_no', '') = '' and coalesce(i->'assign'->>'provider', '') = ''
            then ' – ⚠️ NOT ASSIGNED'
            else ' – 🚐 ' || concat_ws(', ', nullif(i->'assign'->>'provider', ''), nullif(i->'assign'->>'vehicle_no', ''), nullif(i->'assign'->>'driver', ''), nullif(i->'assign'->>'driver_phone', '')) end
  from documents q join customers c on c.id = q.customer_id, jsonb_array_elements(q.items) i
  where q.type = 'quotation' and q.status = 'accepted' and i->>'section' in ('arrival', 'departure')
    and coalesce(i->'assign'->>'status', '') <> 'cancelled'
    and (i->>'date') ~ '^\d{4}-\d{2}-\d{2}$' and (i->>'time') ~ '^([01]?\d|2[0-3]):[0-5]\d$'
    and upper(replace(coalesce(i->>'flight', ''), ' ', '')) ~ '^[A-Z0-9]{2}\d{1,4}[A-Z]?$'
$fn$;

-- Keep one row per flight that is between 3 hours ago and 24 hours ahead.
create or replace function private.flight_sync() returns void
language sql security definer set search_path = public as $fn$
  insert into flight_status (flight, flight_date, section, planned)
  select flight, flight_date, section, min(planned) from private.flight_lines()
  where planned between (now() at time zone 'Asia/Colombo') - interval '3 hours' and (now() at time zone 'Asia/Colombo') + interval '24 hours'
  group by 1, 2, 3
  on conflict (flight, flight_date, section) do update set planned = excluded.planned
$fn$;

-- Store one reply from the flight service and post to Discord when something changed.
create or replace function private.flight_apply(f text, d date, sec text, payload jsonb) returns void
language plpgsql security definer set search_path = public as $fn$
declare leg jsonb; m jsonb; r flight_status; st text; sched timestamp; est timestamp; cand timestamp; diff int; total int; msg text; info text; mark text;
begin
  select * into r from flight_status where flight = f and flight_date = d and section = sec;
  if not found then return; end if;
  if payload is null or jsonb_typeof(payload) <> 'array' or jsonb_array_length(payload) = 0 then
    update flight_status set error = 'No data for this flight on this date', checked_at = now() where flight = f and flight_date = d and section = sec;
    return;
  end if;
  -- prefer the leg that touches Colombo (CMB), then the operating airline's own record
  select x into leg from jsonb_array_elements(payload) x
    order by (x->sec->'airport'->>'iata' = 'CMB') desc nulls last, (x->>'codeshareStatus' = 'IsOperator') desc nulls last limit 1;
  m := coalesce(leg->sec, '{}'::jsonb);
  st := coalesce(leg->>'status', 'Unknown');
  sched := private.ts16(m->'scheduledTime'->>'local');
  est := coalesce(private.ts16(m->'revisedTime'->>'local'), private.ts16(m->'runwayTime'->>'local'));
  cand := coalesce(est, sched);
  diff := round(extract(epoch from cand - coalesce(r.notified_est, r.planned)) / 60);   -- change since the last alert
  total := round(extract(epoch from cand - r.planned) / 60);                             -- against the quotation
  mark := case when sec = 'departure' and st in ('Departed', 'EnRoute', 'Approaching', 'Arrived') then 'Departed' else st end;

  if st in ('Canceled', 'CanceledUncertain', 'Diverted') and r.notified_status is distinct from mark then
    msg := '❌ **' || f || ' ' || sec || ': ' || case st when 'Diverted' then 'DIVERTED' when 'Canceled' then 'CANCELLED' else 'possibly cancelled' end || '**';
  elsif sec = 'arrival' and st = 'Arrived' and r.notified_status is distinct from mark then
    msg := '🛬 **' || f || ' has landed**' || coalesce(' at ' || to_char(cand, 'HH24:MI'), '');
  elsif sec = 'departure' and mark = 'Departed' and r.notified_status is distinct from mark then
    msg := '🛫 **' || f || ' has departed**' || coalesce(' at ' || to_char(cand, 'HH24:MI'), '');
  elsif abs(diff) >= 15 then
    msg := '⏱️ **' || f || ' ' || sec || ' time changed:** now ' || to_char(cand, 'HH24:MI')
      || case when cand::date <> r.planned::date then ' on ' || to_char(cand, 'Dy DD Mon') else '' end
      || ' (' || abs(total) || ' min ' || case when total >= 0 then 'later' else 'earlier' end || ' than the ' || to_char(r.planned, 'HH24:MI') || ' on the quotation)';
  end if;

  update flight_status set status = st, scheduled = sched, estimated = est, terminal = m->>'terminal', gate = m->>'gate', belt = m->>'baggageBelt',
    live = coalesce(m->'quality' ? 'Live', false), checked_at = now(), error = null,
    notified_status = case when msg is not null then mark else notified_status end,
    notified_est = case when msg is not null then cand else notified_est end
  where flight = f and flight_date = d and section = sec;

  if msg is not null then
    select string_agg('• ' || l.info, E'\n') into info from private.flight_lines() l where l.flight = f and l.flight_date = d and l.section = sec;
    perform private.discord_post(msg || coalesce(E'\n' || info, '') || E'\nStatus: ' || st || ' · <https://www.flightradar24.com/data/flights/' || lower(f) || '>');
  end if;
end $fn$;

-- Read the replies to earlier requests.
create or replace function private.flight_collect() returns void
language plpgsql security definer set search_path = public as $fn$
declare r record;
begin
  for r in
    select fs.flight, fs.flight_date, fs.section, h.status_code, h.content, h.error_msg
    from flight_status fs join net._http_response h on h.id = fs.request_id where fs.request_id is not null
  loop
    if r.status_code = 200 then
      begin
        perform private.flight_apply(r.flight, r.flight_date, r.section, r.content::jsonb);
      exception when others then
        update flight_status set error = 'Could not read the reply from the flight service', checked_at = now()
          where flight = r.flight and flight_date = r.flight_date and section = r.section;
      end;
    else
      update flight_status set checked_at = now(), error = case
          when r.status_code = 204 then 'Flight not found for this date'
          when r.status_code in (401, 403) then 'The flight API key was rejected'
          when r.status_code = 429 then 'The flight API quota is used up'
          else 'Flight service error (' || coalesce(r.status_code::text, r.error_msg, 'no reply') || ')' end
        where flight = r.flight and flight_date = r.flight_date and section = r.section;
    end if;
    update flight_status set request_id = null where flight = r.flight and flight_date = r.flight_date and section = r.section;
  end loop;
  update flight_status set request_id = null, checked_at = now(), error = 'No reply from the flight service'
    where request_id is not null and requested_at < now() - interval '10 minutes';
end $fn$;

-- Ask about ONE flight (the service allows one request a second): the soonest one that is due for a check.
-- Returns -1 when no key is saved, otherwise the number of requests sent (0 or 1).
create or replace function private.flight_queue(force boolean) returns int
language plpgsql security definer set search_path = public as $fn$
declare key text; t timestamp := now() at time zone 'Asia/Colombo'; r flight_status; id bigint;
begin
  select flight_api_key into key from settings where id = 1;
  if coalesce(key, '') !~ '^[A-Za-z0-9_-]{20,100}$' then return -1; end if;
  perform private.flight_sync();
  select * into r from flight_status fs
  where fs.request_id is null and fs.planned between t - interval '3 hours' and t + interval '24 hours'
    and coalesce(fs.status, '') not in ('Arrived', 'Canceled', 'CanceledUncertain', 'Diverted')
    and not (fs.section = 'departure' and coalesce(fs.status, '') in ('Departed', 'EnRoute', 'Approaching'))
    and (force or fs.checked_at is null or fs.checked_at < now() - case
          when fs.error in ('The flight API key was rejected', 'The flight API quota is used up') then interval '6 hours'
          when fs.planned - t > interval '6 hours' then interval '18 hours'
          when fs.planned - t > interval '2 hours' then interval '2 hours'
          else interval '45 minutes' end)
  order by fs.planned limit 1;
  if not found then return 0; end if;
  id := net.http_get(
    url := 'https://aerodatabox.p.rapidapi.com/flights/number/' || r.flight || '/' || r.flight_date::text || '?dateLocalRole=' || initcap(r.section),
    headers := jsonb_build_object('X-RapidAPI-Key', key, 'X-RapidAPI-Host', 'aerodatabox.p.rapidapi.com'));
  update flight_status set request_id = id, requested_at = now() where flight = r.flight and flight_date = r.flight_date and section = r.section;
  return 1;
end $fn$;

-- The "Check the next flight now" button on the Schedule page. Signed-in users only.
create or replace function public.flight_refresh(queue boolean) returns text
language plpgsql security definer set search_path = public as $fn$
declare n int;
begin
  perform private.flight_collect();
  if not queue then return 'collected'; end if;
  n := private.flight_queue(true);
  return case n when -1 then 'no-key' when 0 then 'none' else 'queued' end;
end $fn$;
revoke execute on function public.flight_refresh(boolean) from public, anon;
grant execute on function public.flight_refresh(boolean) to authenticated;

select cron.schedule('shammi-flight-status', '*/5 * * * *', 'select private.flight_collect(); select private.flight_queue(false)');
