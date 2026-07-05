create extension if not exists pgcrypto;

create table if not exists public.footprints (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  owner_name text not null default '旅人',
  region_id text not null,
  region_name text not null,
  province text,
  kind text,
  visited boolean not null default true,
  visit_date date,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, region_id)
);

create table if not exists public.photos (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  owner_name text not null default '旅人',
  region_id text not null,
  region_name text not null,
  storage_path text not null,
  public_url text not null,
  created_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists footprints_set_updated_at on public.footprints;
create trigger footprints_set_updated_at
before update on public.footprints
for each row execute function public.set_updated_at();

alter table public.footprints enable row level security;
alter table public.photos enable row level security;

drop policy if exists "Everyone can read footprints" on public.footprints;
create policy "Everyone can read footprints"
on public.footprints for select
to authenticated
using (true);

drop policy if exists "Users can insert own footprints" on public.footprints;
create policy "Users can insert own footprints"
on public.footprints for insert
to authenticated
with check (auth.uid() = owner_id);

drop policy if exists "Users can update own footprints" on public.footprints;
create policy "Users can update own footprints"
on public.footprints for update
to authenticated
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);

drop policy if exists "Users can delete own footprints" on public.footprints;
create policy "Users can delete own footprints"
on public.footprints for delete
to authenticated
using (auth.uid() = owner_id);

drop policy if exists "Everyone can read photos" on public.photos;
create policy "Everyone can read photos"
on public.photos for select
to authenticated
using (true);

drop policy if exists "Users can insert own photos" on public.photos;
create policy "Users can insert own photos"
on public.photos for insert
to authenticated
with check (auth.uid() = owner_id);

drop policy if exists "Users can update own photos" on public.photos;
create policy "Users can update own photos"
on public.photos for update
to authenticated
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);

drop policy if exists "Users can delete own photos" on public.photos;
create policy "Users can delete own photos"
on public.photos for delete
to authenticated
using (auth.uid() = owner_id);

insert into storage.buckets (id, name, public)
values ('travel-photos', 'travel-photos', true)
on conflict (id) do update set public = true;

drop policy if exists "Public can read travel photos" on storage.objects;
create policy "Public can read travel photos"
on storage.objects for select
to public
using (bucket_id = 'travel-photos');

drop policy if exists "Users can upload to own folder" on storage.objects;
create policy "Users can upload to own folder"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'travel-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users can update own photo files" on storage.objects;
create policy "Users can update own photo files"
on storage.objects for update
to authenticated
using (
  bucket_id = 'travel-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'travel-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users can delete own photo files" on storage.objects;
create policy "Users can delete own photo files"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'travel-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);
