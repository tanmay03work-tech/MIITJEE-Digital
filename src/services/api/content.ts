import { Batch, Course } from '../../types';
import { endpoints } from './config';
import { rpc, selectRows } from '../supabase/client';
import { mapBatch, mapCourse } from '../supabase/mappers';
import { BatchRow, CourseRow } from '../supabase/types';
import { CreateBatchPayload } from '../../types';

export async function fetchCourses(): Promise<Course[]> {
  const rows = await selectRows<CourseRow>(endpoints.content.courses, '*', {
    order: 'title.asc',
  });
  return rows.map(mapCourse);
}

export async function fetchBatches(): Promise<Batch[]> {
  const rows = await selectRows<BatchRow>(endpoints.content.batches, 'id,label,target_exam,class_label,description,image_url', {
    is_active: 'eq.true',
    order: 'label.asc',
  });
  return rows.map(mapBatch);
}

export async function createBatch(payload: CreateBatchPayload): Promise<Batch> {
  const row = await rpc<BatchRow>(endpoints.admin.createBatch, {
    p_id: payload.id ?? null,
    p_label: payload.label,
    p_target_exam: payload.targetExam,
    p_class_label: payload.classLabel,
    p_description: payload.description,
    p_image_url: payload.imageUrl ?? null,
  });

  return mapBatch(row);
}
