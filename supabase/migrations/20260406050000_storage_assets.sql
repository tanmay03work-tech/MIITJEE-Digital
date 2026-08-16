insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'exam-assets',
  'exam-assets',
  true,
  52428800,
  array[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic'
  ]::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists exam_assets_public_read on storage.objects;
create policy exam_assets_public_read on storage.objects
for select
to public
using (bucket_id = 'exam-assets');

drop policy if exists exam_assets_authenticated_upload on storage.objects;
create policy exam_assets_authenticated_upload on storage.objects
for insert
to authenticated
with check (bucket_id = 'exam-assets');

drop policy if exists exam_assets_authenticated_update on storage.objects;
create policy exam_assets_authenticated_update on storage.objects
for update
to authenticated
using (bucket_id = 'exam-assets')
with check (bucket_id = 'exam-assets');

drop policy if exists exam_assets_authenticated_delete on storage.objects;
create policy exam_assets_authenticated_delete on storage.objects
for delete
to authenticated
using (bucket_id = 'exam-assets');
