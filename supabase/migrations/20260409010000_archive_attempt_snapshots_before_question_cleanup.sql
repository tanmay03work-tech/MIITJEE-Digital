create table if not exists public.archived_test_question_reviews (
  attempt_id uuid not null references public.test_attempts (id) on delete cascade,
  position integer not null,
  test_id uuid not null,
  question_type text not null,
  prompt text not null,
  options jsonb not null default '[]'::jsonb,
  user_answer text not null,
  correct_answer text not null,
  is_correct boolean not null,
  explanation text not null default '',
  image_url text,
  subject_label text,
  primary key (attempt_id, position)
);

create table if not exists public.archived_test_subject_insights (
  attempt_id uuid not null references public.test_attempts (id) on delete cascade,
  test_id uuid not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  submitted_at timestamptz not null,
  percentile integer not null,
  subject text not null,
  total_questions integer not null,
  correct_answers integer not null,
  accuracy_percent integer not null,
  primary key (attempt_id, subject)
);

create index if not exists idx_archived_test_question_reviews_attempt_id
  on public.archived_test_question_reviews (attempt_id, position);

create index if not exists idx_archived_test_subject_insights_user_id
  on public.archived_test_subject_insights (user_id, submitted_at desc);

create index if not exists idx_archived_test_subject_insights_test_id
  on public.archived_test_subject_insights (test_id);

create or replace function public.archive_test_attempt_snapshots(p_test_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.archived_test_question_reviews (
    attempt_id,
    position,
    test_id,
    question_type,
    prompt,
    options,
    user_answer,
    correct_answer,
    is_correct,
    explanation,
    image_url,
    subject_label
  )
  select
    ta.id as attempt_id,
    q.position,
    ta.test_id,
    q.question_type::text,
    q.prompt,
    q.options,
    taa.selected_answer,
    taa.correct_answer,
    taa.is_correct,
    q.explanation,
    q.image_url,
    q.subject_label
  from public.test_attempt_answers taa
  join public.test_attempts ta on ta.id = taa.attempt_id
  join public.test_questions q on q.id = taa.question_id
  where ta.test_id = p_test_id
  on conflict (attempt_id, position) do update
  set
    test_id = excluded.test_id,
    question_type = excluded.question_type,
    prompt = excluded.prompt,
    options = excluded.options,
    user_answer = excluded.user_answer,
    correct_answer = excluded.correct_answer,
    is_correct = excluded.is_correct,
    explanation = excluded.explanation,
    image_url = excluded.image_url,
    subject_label = excluded.subject_label;

  insert into public.archived_test_subject_insights (
    attempt_id,
    test_id,
    user_id,
    submitted_at,
    percentile,
    subject,
    total_questions,
    correct_answers,
    accuracy_percent
  )
  select
    ta.id as attempt_id,
    ta.test_id,
    ta.user_id,
    ta.submitted_at,
    ta.percentile,
    coalesce(nullif(trim(q.subject_label), ''), nullif(trim(t.subject), ''), 'General Section') as subject,
    count(*)::int as total_questions,
    count(*) filter (where taa.is_correct)::int as correct_answers,
    coalesce(
      round(
        (
          count(*) filter (where taa.is_correct)::numeric
          / nullif(count(*), 0)::numeric
        ) * 100
      ),
      0
    )::int as accuracy_percent
  from public.test_attempt_answers taa
  join public.test_attempts ta on ta.id = taa.attempt_id
  join public.test_questions q on q.id = taa.question_id
  join public.tests t on t.id = ta.test_id
  where ta.test_id = p_test_id
  group by
    ta.id,
    ta.test_id,
    ta.user_id,
    ta.submitted_at,
    ta.percentile,
    coalesce(nullif(trim(q.subject_label), ''), nullif(trim(t.subject), ''), 'General Section')
  on conflict (attempt_id, subject) do update
  set
    test_id = excluded.test_id,
    user_id = excluded.user_id,
    submitted_at = excluded.submitted_at,
    percentile = excluded.percentile,
    total_questions = excluded.total_questions,
    correct_answers = excluded.correct_answers,
    accuracy_percent = excluded.accuracy_percent;
end;
$$;

create or replace function public.review_answers(p_attempt_id uuid)
returns table (
  question_id uuid,
  test_id uuid,
  question_type text,
  prompt text,
  options text[],
  user_answer text,
  correct_answer text,
  is_correct boolean,
  explanation text,
  image_url text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.archived_test_question_reviews ar
    join public.test_attempts ta on ta.id = ar.attempt_id
    where ar.attempt_id = p_attempt_id
      and (ta.user_id = auth.uid() or public.is_admin())
  ) then
    return query
    select
      null::uuid as question_id,
      ar.test_id,
      ar.question_type,
      ar.prompt,
      coalesce(array(select jsonb_array_elements_text(ar.options)), array[]::text[]) as options,
      ar.user_answer,
      ar.correct_answer,
      ar.is_correct,
      ar.explanation,
      ar.image_url
    from public.archived_test_question_reviews ar
    join public.test_attempts ta on ta.id = ar.attempt_id
    where ar.attempt_id = p_attempt_id
      and (ta.user_id = auth.uid() or public.is_admin())
    order by ar.position asc;
    return;
  end if;

  return query
  select
    q.id as question_id,
    q.test_id,
    q.question_type::text,
    q.prompt,
    coalesce(array(select jsonb_array_elements_text(q.options)), array[]::text[]) as options,
    taa.selected_answer as user_answer,
    taa.correct_answer,
    taa.is_correct,
    q.explanation,
    q.image_url
  from public.test_attempt_answers taa
  join public.test_attempts ta on ta.id = taa.attempt_id
  join public.test_questions q on q.id = taa.question_id
  where taa.attempt_id = p_attempt_id
    and (ta.user_id = auth.uid() or public.is_admin())
  order by q.position asc;
end;
$$;

create or replace function public.get_student_insights(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := coalesce(p_user_id, auth.uid());
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  return jsonb_build_object(
    'summary',
    (
      with ordered_attempts as (
        select
          a.score,
          a.percentile,
          a.submitted_at
        from public.test_attempts a
        where a.user_id = v_uid
        order by a.submitted_at asc
      )
      select to_jsonb(summary_row)
      from (
        select
          count(*)::int as tests_attempted,
          coalesce(round(avg(score)), 0)::int as avg_score,
          coalesce(round(avg(percentile)), 0)::int as avg_percentile,
          coalesce(max(score), 0)::int as best_score,
          coalesce(max(percentile), 0)::int as best_percentile,
          coalesce((array_agg(score order by submitted_at desc))[1], 0)::int as latest_score,
          coalesce((array_agg(percentile order by submitted_at desc))[1], 0)::int as latest_percentile,
          case
            when count(*) <= 1 then 0
            else coalesce((array_agg(score order by submitted_at desc))[1], 0)::int
              - coalesce((array_agg(score order by submitted_at asc))[1], 0)::int
          end as improvement_score
        from ordered_attempts
      ) summary_row
    ),
    'history',
    coalesce(
      (
        select jsonb_agg(to_jsonb(history_row) order by history_row.submitted_at desc)
        from (
          select
            tas.id as attempt_id,
            tas.test_id,
            t.title as test_title,
            t.subject,
            tas.score,
            tas.percentile,
            tas.rank,
            tas.submitted_at
          from public.test_attempt_summaries tas
          join public.tests t on t.id = tas.test_id
          where tas.user_id = v_uid
          order by tas.submitted_at desc
        ) history_row
      ),
      '[]'::jsonb
    ),
    'subject_breakdown',
    coalesce(
      (
        with archived_attempts as (
          select distinct attempt_id
          from public.archived_test_subject_insights
        ),
        per_subject_attempt as (
          select
            ai.subject,
            ai.attempt_id,
            ai.submitted_at,
            ai.percentile,
            ai.total_questions,
            ai.correct_answers,
            ai.accuracy_percent as subject_score
          from public.archived_test_subject_insights ai
          where ai.user_id = v_uid
          union all
          select
            coalesce(nullif(trim(q.subject_label), ''), nullif(trim(t.subject), ''), 'General Section') as subject,
            a.id as attempt_id,
            a.submitted_at,
            a.percentile,
            count(*)::int as total_questions,
            count(*) filter (where taa.is_correct)::int as correct_answers,
            round(avg(case when taa.is_correct then 1 else 0 end::numeric) * 100)::int as subject_score
          from public.test_attempt_answers taa
          join public.test_attempts a on a.id = taa.attempt_id
          join public.test_questions q on q.id = taa.question_id
          join public.tests t on t.id = q.test_id
          where a.user_id = v_uid
            and not exists (
              select 1
              from archived_attempts aa
              where aa.attempt_id = a.id
            )
          group by
            coalesce(nullif(trim(q.subject_label), ''), nullif(trim(t.subject), ''), 'General Section'),
            a.id,
            a.submitted_at,
            a.percentile
        ),
        subject_rollup as (
          select
            subject,
            count(*)::int as attempts,
            sum(total_questions)::int as total_questions,
            sum(correct_answers)::int as correct_answers,
            round((sum(correct_answers)::numeric / nullif(sum(total_questions), 0)) * 100)::int as accuracy_percent,
            round(avg(subject_score))::int as avg_score,
            round(avg(percentile))::int as avg_percentile
          from per_subject_attempt
          group by subject
        ),
        latest_subject as (
          select distinct on (subject)
            subject,
            subject_score as latest_score,
            percentile as latest_percentile
          from per_subject_attempt
          order by subject, submitted_at desc
        ),
        subject_trend as (
          select
            subject,
            case
              when count(*) <= 1 then 0
              else coalesce((array_agg(subject_score order by submitted_at desc))[1], 0)
                - coalesce((array_agg(subject_score order by submitted_at desc))[2], 0)
            end::int as recent_delta
          from per_subject_attempt
          group by subject
        )
        select jsonb_agg(to_jsonb(subject_row) order by subject_row.accuracy_percent asc, subject_row.avg_percentile asc, subject_row.subject asc)
        from (
          select
            sr.subject,
            sr.attempts,
            sr.total_questions,
            sr.correct_answers,
            sr.accuracy_percent,
            sr.avg_score,
            sr.avg_percentile,
            coalesce(ls.latest_score, 0)::int as latest_score,
            coalesce(ls.latest_percentile, 0)::int as latest_percentile,
            coalesce(st.recent_delta, 0)::int as recent_delta
          from subject_rollup sr
          left join latest_subject ls on ls.subject = sr.subject
          left join subject_trend st on st.subject = sr.subject
        ) subject_row
      ),
      '[]'::jsonb
    ),
    'weak_areas',
    coalesce(
      (
        with archived_attempts as (
          select distinct attempt_id
          from public.archived_test_subject_insights
        ),
        per_subject_attempt as (
          select
            ai.subject,
            ai.attempt_id,
            ai.submitted_at,
            ai.percentile,
            ai.total_questions,
            ai.correct_answers,
            ai.accuracy_percent as subject_score
          from public.archived_test_subject_insights ai
          where ai.user_id = v_uid
          union all
          select
            coalesce(nullif(trim(q.subject_label), ''), nullif(trim(t.subject), ''), 'General Section') as subject,
            a.id as attempt_id,
            a.submitted_at,
            a.percentile,
            count(*)::int as total_questions,
            count(*) filter (where taa.is_correct)::int as correct_answers,
            round(avg(case when taa.is_correct then 1 else 0 end::numeric) * 100)::int as subject_score
          from public.test_attempt_answers taa
          join public.test_attempts a on a.id = taa.attempt_id
          join public.test_questions q on q.id = taa.question_id
          join public.tests t on t.id = q.test_id
          where a.user_id = v_uid
            and not exists (
              select 1
              from archived_attempts aa
              where aa.attempt_id = a.id
            )
          group by
            coalesce(nullif(trim(q.subject_label), ''), nullif(trim(t.subject), ''), 'General Section'),
            a.id,
            a.submitted_at,
            a.percentile
        ),
        subject_rollup as (
          select
            subject,
            count(*)::int as attempts,
            sum(total_questions)::int as total_questions,
            sum(correct_answers)::int as correct_answers,
            round((sum(correct_answers)::numeric / nullif(sum(total_questions), 0)) * 100)::int as accuracy_percent,
            round(avg(subject_score))::int as avg_score,
            round(avg(percentile))::int as avg_percentile
          from per_subject_attempt
          group by subject
        ),
        latest_subject as (
          select distinct on (subject)
            subject,
            subject_score as latest_score,
            percentile as latest_percentile
          from per_subject_attempt
          order by subject, submitted_at desc
        ),
        subject_trend as (
          select
            subject,
            case
              when count(*) <= 1 then 0
              else coalesce((array_agg(subject_score order by submitted_at desc))[1], 0)
                - coalesce((array_agg(subject_score order by submitted_at desc))[2], 0)
            end::int as recent_delta
          from per_subject_attempt
          group by subject
        )
        select jsonb_agg(to_jsonb(weak_row) order by weak_row.accuracy_percent asc, weak_row.avg_percentile asc, weak_row.latest_score asc, weak_row.subject asc)
        from (
          select
            sr.subject,
            sr.attempts,
            sr.total_questions,
            sr.correct_answers,
            sr.accuracy_percent,
            sr.avg_score,
            sr.avg_percentile,
            coalesce(ls.latest_score, 0)::int as latest_score,
            coalesce(ls.latest_percentile, 0)::int as latest_percentile,
            coalesce(st.recent_delta, 0)::int as recent_delta
          from subject_rollup sr
          left join latest_subject ls on ls.subject = sr.subject
          left join subject_trend st on st.subject = sr.subject
          order by sr.accuracy_percent asc, sr.avg_percentile asc, coalesce(ls.latest_score, 0) asc, sr.subject asc
          limit 3
        ) weak_row
      ),
      '[]'::jsonb
    )
  );
end;
$$;

create or replace function public.get_student_insights()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.get_student_insights(auth.uid());
end;
$$;

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

  perform public.archive_test_attempt_snapshots(p_test_id);

  delete from public.test_questions
  where test_id = p_test_id;

  update public.tests
  set
    is_published = false,
    deleted_at = timezone('utc', now()),
    description = 'Archived after completion. Student history retained.',
    subject = coalesce(nullif(trim(subject), ''), 'Archived Test')
  where id = p_test_id
    and deleted_at is null;

  if not found then
    raise exception 'Test not found';
  end if;

  perform public.refresh_admin_analytics();

  return p_test_id;
end;
$$;

grant execute on function public.archive_test_attempt_snapshots(uuid) to authenticated;
grant execute on function public.review_answers(uuid) to authenticated;
grant execute on function public.get_student_insights() to authenticated;
grant execute on function public.get_student_insights(uuid) to authenticated;
grant execute on function public.delete_test(uuid) to authenticated;
