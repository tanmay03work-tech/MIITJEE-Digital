-- Create app_versions table in Supabase for global update checking across Android, Web, and Desktop

create table if not exists public.app_versions (
  id text primary key default 'default',
  latest_version text not null default '1.2.0',
  min_required_version text not null default '1.0.0',
  download_url text not null default 'https://miitjee.com',
  force_update boolean not null default false,
  release_notes text default 'Updated web app icon to match Android, fixed question set deletion, and performance improvements.',
  title text default 'New Update Available! 🚀',
  updated_at timestamptz default timezone('utc', now())
);

alter table public.app_versions enable row level security;

drop policy if exists app_versions_read_all on public.app_versions;
create policy app_versions_read_all on public.app_versions
for select
using (true);

drop policy if exists app_versions_insert_authenticated on public.app_versions;
create policy app_versions_insert_authenticated on public.app_versions
for insert to authenticated
with check (true);

drop policy if exists app_versions_update_authenticated on public.app_versions;
create policy app_versions_update_authenticated on public.app_versions
for update to authenticated
using (true)
with check (true);

-- Insert or update default version row
insert into public.app_versions (id, latest_version, min_required_version, download_url, force_update, release_notes, title)
values (
  'default',
  '1.2.0',
  '1.0.0',
  'https://miitjee.com',
  false,
  'Updated web app icon to match Android, fixed question set deletion, and performance improvements.',
  'New Update Available! 🚀'
)
on conflict (id) do update set
  latest_version = excluded.latest_version,
  min_required_version = excluded.min_required_version,
  download_url = excluded.download_url,
  force_update = excluded.force_update,
  release_notes = excluded.release_notes,
  title = excluded.title,
  updated_at = timezone('utc', now());
