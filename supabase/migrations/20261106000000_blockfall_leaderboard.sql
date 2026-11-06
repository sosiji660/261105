-- Supabase SQL Editor may also run the companion ../schema.sql file.
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null check (char_length(username) between 2 and 20),
  created_at timestamptz not null default now()
);

create unique index if not exists profiles_username_lower_unique
  on public.profiles (lower(username));

create table if not exists public.scores (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  score integer not null check (score >= 0 and score <= 100000000),
  lines integer not null check (lines >= 0 and lines <= 100000),
  level integer not null check (level between 1 and 10001),
  created_at timestamptz not null default now()
);

create index if not exists scores_leaderboard_idx on public.scores (score desc, created_at asc);

alter table public.profiles enable row level security;
alter table public.scores enable row level security;

drop policy if exists "Profiles are publicly readable" on public.profiles;
create policy "Profiles are publicly readable" on public.profiles for select using (true);
drop policy if exists "Users can create their profile" on public.profiles;
create policy "Users can create their profile" on public.profiles for insert to authenticated with check (auth.uid() = id);
drop policy if exists "Users can update their profile" on public.profiles;
create policy "Users can update their profile" on public.profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);
drop policy if exists "Scores are publicly readable" on public.scores;
create policy "Scores are publicly readable" on public.scores for select using (true);
drop policy if exists "Users can submit their own scores" on public.scores;
create policy "Users can submit their own scores" on public.scores for insert to authenticated with check (auth.uid() = user_id);

create or replace function public.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_name text;
begin
  requested_name := trim(coalesce(new.raw_user_meta_data ->> 'username', ''));
  if char_length(requested_name) < 2 or char_length(requested_name) > 20 then
    requested_name := 'player-' || left(new.id::text, 8);
  end if;
  insert into public.profiles (id, username) values (new.id, requested_name);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile after insert on auth.users
  for each row execute function public.create_profile_for_new_user();

grant select on public.profiles, public.scores to anon, authenticated;
grant insert, update on public.profiles to authenticated;
grant insert on public.scores to authenticated;
grant usage, select on sequence public.scores_id_seq to authenticated;
