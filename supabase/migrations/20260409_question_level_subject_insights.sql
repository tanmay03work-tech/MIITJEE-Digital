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
        with subject_answers as (
          select
            coalesce(nullif(trim(q.subject_label), ''), nullif(trim(t.subject), ''), 'General Section') as subject,
            a.id as attempt_id,
            a.submitted_at,
            a.percentile,
            case when taa.is_correct then 1 else 0 end as is_correct_int
          from public.test_attempt_answers taa
          join public.test_attempts a on a.id = taa.attempt_id
          join public.test_questions q on q.id = taa.question_id
          join public.tests t on t.id = q.test_id
          where a.user_id = v_uid
        ),
        per_subject_attempt as (
          select
            subject,
            attempt_id,
            submitted_at,
            max(percentile)::int as percentile,
            count(*)::int as total_questions,
            sum(is_correct_int)::int as correct_answers,
            round(avg(is_correct_int::numeric) * 100)::int as subject_score
          from subject_answers
          group by subject, attempt_id, submitted_at
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
        with subject_answers as (
          select
            coalesce(nullif(trim(q.subject_label), ''), nullif(trim(t.subject), ''), 'General Section') as subject,
            a.id as attempt_id,
            a.submitted_at,
            a.percentile,
            case when taa.is_correct then 1 else 0 end as is_correct_int
          from public.test_attempt_answers taa
          join public.test_attempts a on a.id = taa.attempt_id
          join public.test_questions q on q.id = taa.question_id
          join public.tests t on t.id = q.test_id
          where a.user_id = v_uid
        ),
        per_subject_attempt as (
          select
            subject,
            attempt_id,
            submitted_at,
            max(percentile)::int as percentile,
            count(*)::int as total_questions,
            sum(is_correct_int)::int as correct_answers,
            round(avg(is_correct_int::numeric) * 100)::int as subject_score
          from subject_answers
          group by subject, attempt_id, submitted_at
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

grant execute on function public.get_student_insights() to authenticated;
grant execute on function public.get_student_insights(uuid) to authenticated;
