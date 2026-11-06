alter table public.profiles
  add column if not exists avatar_path text;

-- Users may edit their nickname; the server alone changes generated avatar paths.
revoke update on public.profiles from authenticated;
grant update (username) on public.profiles to authenticated;
grant update on public.profiles to service_role;

create table if not exists public.avatar_generation_requests (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists avatar_generation_requests_day_idx
  on public.avatar_generation_requests (created_at, user_id);

alter table public.avatar_generation_requests enable row level security;
revoke all on public.avatar_generation_requests from anon, authenticated;
grant select, insert on public.avatar_generation_requests to service_role;
grant usage, select on sequence public.avatar_generation_requests_id_seq to service_role;

-- The server calls this with its service-role key after verifying the user's JWT.
-- Limits apply to requests, including requests that later fail upstream.
create or replace function public.reserve_avatar_generation(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  day_start timestamptz;
begin
  if p_user_id is null then
    raise exception 'USER_REQUIRED';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(2611050601);
  day_start := pg_catalog.date_trunc('day', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul';

  if (select count(*) from public.avatar_generation_requests
      where user_id = p_user_id and created_at >= day_start) >= 3 then
    raise exception 'USER_DAILY_LIMIT';
  end if;

  if (select count(*) from public.avatar_generation_requests
      where created_at >= day_start) >= 30 then
    raise exception 'GLOBAL_DAILY_LIMIT';
  end if;

  insert into public.avatar_generation_requests (user_id) values (p_user_id);
end;
$$;

revoke all on function public.reserve_avatar_generation(uuid) from public, anon, authenticated;
grant execute on function public.reserve_avatar_generation(uuid) to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 5242880, array['image/webp'])
on conflict (id) do nothing;
