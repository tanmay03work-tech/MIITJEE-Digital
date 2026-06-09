alter table if exists public.batches
  add column if not exists description text not null default '',
  add column if not exists image_url text;

create or replace function public.create_batch(
  p_id text,
  p_label text,
  p_target_exam text,
  p_class_label text,
  p_description text,
  p_image_url text
)
returns public.batches
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch public.batches;
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  insert into public.batches (
    id,
    label,
    target_exam,
    class_label,
    description,
    image_url,
    is_active
  )
  values (
    upper(regexp_replace(coalesce(nullif(trim(p_id), ''), trim(p_label)), '[^A-Za-z0-9]+', '_', 'g')),
    trim(p_label),
    trim(p_target_exam),
    trim(p_class_label),
    trim(coalesce(p_description, '')),
    nullif(trim(coalesce(p_image_url, '')), ''),
    true
  )
  returning * into v_batch;

  return v_batch;
end;
$$;

create table if not exists public.general_enquiries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete set null,
  full_name text not null,
  phone text not null,
  email text not null,
  message text not null,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.general_enquiries enable row level security;

drop policy if exists general_enquiries_admin_read on public.general_enquiries;
create policy general_enquiries_admin_read on public.general_enquiries
for select using (public.is_admin());

create or replace view public.admin_general_enquiries
with (security_invoker = true) as
select
  ge.id,
  ge.user_id,
  ge.full_name,
  ge.phone,
  ge.email,
  ge.message,
  ge.created_at
from public.general_enquiries ge
order by ge.created_at desc;

create or replace function public.submit_general_enquiry(
  p_full_name text,
  p_phone text,
  p_email text,
  p_message text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.general_enquiries (
    user_id,
    full_name,
    phone,
    email,
    message
  )
  values (
    auth.uid(),
    trim(p_full_name),
    trim(p_phone),
    trim(p_email),
    trim(p_message)
  );
end;
$$;

grant execute on function public.create_batch(text, text, text, text, text, text) to authenticated;
grant execute on function public.submit_general_enquiry(text, text, text, text) to authenticated;
grant select on public.admin_general_enquiries to authenticated;
