-- Discord booking reminders. Run once in Supabase → SQL Editor (safe to run again).
-- The webhook link is read from settings.discord_webhook (Settings page); nothing is sent while it is empty.
-- Times are Sri Lanka time (Asia/Colombo). The functions live in a schema the public API cannot reach.
alter table settings add column if not exists discord_webhook text;
create extension if not exists pg_net;
create extension if not exists pg_cron;
create schema if not exists private;

-- Post a message to the Discord channel, split into chunks under Discord's 2000-character limit.
create or replace function private.discord_post(msg text) returns void
language plpgsql security definer set search_path = public as $fn$
declare hook text; rest text := coalesce(msg, ''); cut int;
begin
  select discord_webhook into hook from settings where id = 1;
  -- only ever call a real Discord webhook address
  if hook is null or hook !~ '^https://(discord|discordapp)\.com/api/webhooks/' then return; end if;
  while length(rest) > 0 loop
    if length(rest) <= 1900 then cut := length(rest);
    else cut := 1900 - position(E'\n' in reverse(left(rest, 1900))); if cut < 200 then cut := 1900; end if;
    end if;
    perform net.http_post(url := hook, body := jsonb_build_object('content', left(rest, cut)));
    rest := ltrim(substr(rest, cut + 1), E'\n');
  end loop;
end $fn$;

-- The services of one day, from accepted quotations, one line each.
create or replace function private.services_text(d date) returns text
language sql security definer set search_path = public as $fn$
  select string_agg(line, E'\n' order by srt, line) from (
    select coalesce(nullif(i->>'time', ''), 'zz') as srt,
      '• ' || coalesce(nullif(i->>'time', ''), 'time not set') || ' – '
      || case i->>'section' when 'arrival' then 'Arrival ' || coalesce(i->>'flight', '')
                            when 'departure' then 'Departure ' || coalesce(i->>'flight', '')
                            else split_part(coalesce(i->>'activity', 'Traveling'), E'\n', 1) end
      || ' – ' || coalesce(i->>'guests', '?') || ' pax – ' || coalesce(nullif(i->>'vehicle', ''), 'vehicle not chosen')
      || ' – ' || c.name || ' (' || q.number || ')'
      || case when coalesce(i->'assign'->>'driver', '') = '' and coalesce(i->'assign'->>'vehicle_no', '') = '' and coalesce(i->'assign'->>'provider', '') = ''
              then ' – ⚠️ NOT ASSIGNED'
              else ' – 🚐 ' || concat_ws(', ', nullif(i->'assign'->>'provider', ''), nullif(i->'assign'->>'vehicle_no', ''), nullif(i->'assign'->>'driver', ''), nullif(i->'assign'->>'driver_phone', '')) end as line
    from documents q join customers c on c.id = q.customer_id, jsonb_array_elements(q.items) i
    where q.type = 'quotation' and q.status = 'accepted' and i->>'date' = d::text
      and coalesce(i->'assign'->>'status', '') <> 'cancelled'
  ) s
$fn$;

-- Unpaid invoice instalments due on a day (or, with overdue = true, due before it).
create or replace function private.payments_text(d date, overdue boolean) returns text
language sql security definer set search_path = public as $fn$
  select string_agg('• ' || v.number || ' – ' || c.name || ' – ' || coalesce(p->>'label', 'Payment') || ' – Rs'
      || to_char(round(v.total * coalesce((p->>'percent')::numeric, 100) / 100, 2), 'FM999,999,999,990.00') || ' – due ' || (p->>'due'), E'\n' order by p->>'due', v.number)
  from documents v join customers c on c.id = v.customer_id,
    jsonb_array_elements(case when jsonb_typeof(v.data->'payments') = 'array' and jsonb_array_length(v.data->'payments') > 0 then v.data->'payments'
      else jsonb_build_array(jsonb_build_object('label', 'Full payment', 'percent', 100, 'due', v.due_date, 'paid', false)) end) p
  where v.type = 'invoice' and v.status not in ('paid', 'cancelled') and coalesce(p->>'paid', 'false') <> 'true'
    and case when (p->>'due') ~ '^\d{4}-\d{2}-\d{2}$'
             then case when overdue then (p->>'due')::date < d else (p->>'due')::date = d end
             else false end
$fn$;

-- Morning ('today') and evening ('tomorrow') summary. Sends nothing when there is nothing to report.
create or replace function private.daily_digest(kind text) returns void
language plpgsql security definer set search_path = public as $fn$
declare td date := (now() at time zone 'Asia/Colombo')::date; d date; s text; p text; o text;
begin
  d := case when kind = 'tomorrow' then td + 1 else td end;
  s := private.services_text(d);
  p := private.payments_text(d, false);
  o := case when kind = 'today' then private.payments_text(td, true) end;
  if s is null and p is null and o is null then return; end if;
  perform private.discord_post('**Shammi Travels – ' || case when kind = 'tomorrow' then 'tomorrow' else 'today' end || ', ' || to_char(d, 'Dy DD Mon YYYY') || '**'
    || coalesce(E'\n**Services**\n' || s, '') || coalesce(E'\n**Payments due**\n' || p, '') || coalesce(E'\n**Overdue payments**\n' || o, ''));
end $fn$;

-- Runs every 15 minutes: alerts for flights whose time falls 3 hours from now (each flight is caught exactly once).
create or replace function private.flight_alerts() returns void
language plpgsql security definer set search_path = public as $fn$
declare t timestamp := date_trunc('minute', now() at time zone 'Asia/Colombo') + interval '3 hours'; r record;
begin
  for r in
    select i, c.name as customer, q.number
    from documents q join customers c on c.id = q.customer_id, jsonb_array_elements(q.items) i
    where q.type = 'quotation' and q.status = 'accepted' and i->>'section' in ('arrival', 'departure')
      and coalesce(i->'assign'->>'status', '') <> 'cancelled'
      and case when (i->>'date') ~ '^\d{4}-\d{2}-\d{2}$' and (i->>'time') ~ '^\d{1,2}:\d{2}$'
               then ((i->>'date')::date + (i->>'time')::time) >= t and ((i->>'date')::date + (i->>'time')::time) < t + interval '15 minutes'
               else false end
  loop
    perform private.discord_post('✈️ **In 3 hours:** ' || initcap(r.i->>'section') || ' ' || coalesce(r.i->>'flight', '') || ' at ' || (r.i->>'time')
      || ' – ' || coalesce(r.i->>'guests', '?') || ' pax – ' || coalesce(nullif(r.i->>'vehicle', ''), 'vehicle not chosen') || ' – ' || r.customer || ' (' || r.number || ')'
      || case when coalesce(r.i->'assign'->>'driver', '') = '' and coalesce(r.i->'assign'->>'vehicle_no', '') = '' and coalesce(r.i->'assign'->>'provider', '') = ''
              then E'\n⚠️ NOT ASSIGNED'
              else E'\n🚐 ' || concat_ws(', ', nullif(r.i->'assign'->>'provider', ''), nullif(r.i->'assign'->>'vehicle_no', ''), nullif(r.i->'assign'->>'driver', ''), nullif(r.i->'assign'->>'driver_phone', '')) end
      || case when replace(coalesce(r.i->>'flight', ''), ' ', '') ~* '^[a-z0-9]{2}\d{1,4}[a-z]?$'
              then E'\nFlight status: <https://www.flightradar24.com/data/flights/' || lower(replace(r.i->>'flight', ' ', '')) || '>' else '' end);
  end loop;
end $fn$;

-- The "Send a test to Discord" button on the Settings page. Signed-in users only.
create or replace function public.discord_test() returns text
language plpgsql security definer set search_path = public as $fn$
begin
  if not exists (select 1 from settings where id = 1 and discord_webhook ~ '^https://(discord|discordapp)\.com/api/webhooks/') then return 'no-webhook'; end if;
  perform private.discord_post('✅ Shammi Travels reminders are connected. You will get today''s services at 7:00 am, tomorrow''s at 6:00 pm, payments due, and an alert 3 hours before each flight.');
  perform private.daily_digest('today');
  perform private.daily_digest('tomorrow');
  return 'sent';
end $fn$;
revoke execute on function public.discord_test() from public, anon;
grant execute on function public.discord_test() to authenticated;

-- Timers (UTC): 01:30 = 7:00 am and 12:30 = 6:00 pm in Sri Lanka.
select cron.schedule('shammi-today', '30 1 * * *', 'select private.daily_digest(''today'')');
select cron.schedule('shammi-tomorrow', '30 12 * * *', 'select private.daily_digest(''tomorrow'')');
select cron.schedule('shammi-flights', '*/15 * * * *', 'select private.flight_alerts()');
