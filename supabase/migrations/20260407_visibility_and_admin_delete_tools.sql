create or replace function public.delete_test(p_test_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  delete from public.tests
  where id = p_test_id;

  if not found then
    raise exception 'Test not found';
  end if;

  perform public.refresh_admin_analytics();

  return p_test_id;
end;
$$;

create or replace function public.delete_test_attempt(p_attempt_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  delete from public.test_attempts
  where id = p_attempt_id;

  if not found then
    raise exception 'Result not found';
  end if;

  perform public.refresh_admin_analytics();

  return p_attempt_id;
end;
$$;

create or replace function public.delete_enrollment_query(p_query_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  delete from public.enrollment_queries
  where id = p_query_id;

  if not found then
    raise exception 'Enrollment query not found';
  end if;

  return p_query_id;
end;
$$;

create or replace function public.delete_scholarship_registration(p_registration_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  delete from public.scholarship_registrations
  where id = p_registration_id;

  if not found then
    raise exception 'Scholarship registration not found';
  end if;

  return p_registration_id;
end;
$$;

create or replace function public.delete_general_enquiry(p_enquiry_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  delete from public.general_enquiries
  where id = p_enquiry_id;

  if not found then
    raise exception 'Enquiry not found';
  end if;

  return p_enquiry_id;
end;
$$;

create or replace function public.delete_batch(p_batch_id text)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  if exists (
    select 1
    from public.tests
    where batch_id = p_batch_id
  ) then
    raise exception 'Delete the linked tests first, then remove this batch';
  end if;

  update public.profiles
  set
    batch_id = null,
    role = case when role = 'miitjee_student' then 'student' else role end
  where batch_id = p_batch_id;

  delete from public.enrollment_queries
  where batch_id = p_batch_id;

  delete from public.batches
  where id = p_batch_id;

  if not found then
    raise exception 'Batch not found';
  end if;

  perform public.refresh_admin_analytics();

  return p_batch_id;
end;
$$;

grant execute on function public.delete_test(uuid) to authenticated;
grant execute on function public.delete_test_attempt(uuid) to authenticated;
grant execute on function public.delete_enrollment_query(uuid) to authenticated;
grant execute on function public.delete_scholarship_registration(uuid) to authenticated;
grant execute on function public.delete_general_enquiry(uuid) to authenticated;
grant execute on function public.delete_batch(text) to authenticated;
