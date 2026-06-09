import { endpoints } from './config';
import { maybeSingleRow, selectRows } from '../supabase/client';
import { mapProfile } from '../supabase/mappers';
import { ProfileRow } from '../supabase/types';
import { AppUser } from '../../types';

export async function fetchProfileById(userId: string): Promise<AppUser | null> {
  const profileFields =
    'id,full_name,email,role,approval_status,batch_id,target_exam,class_label,avatar_seed';

  // Use direct profile reads for auth hydration to avoid admin-view specific SQL issues.
  const profile = await maybeSingleRow<
    Pick<
      ProfileRow,
      'id' | 'full_name' | 'email' | 'role' | 'approval_status' | 'batch_id' | 'target_exam' | 'class_label' | 'avatar_seed'
    >
  >('profiles', profileFields, {
    id: `eq.${userId}`,
  });

  return profile
    ? mapProfile({
        ...profile,
        rank: 0,
        average_score: 0,
        streak_days: 0,
      })
    : null;
}

export async function fetchProfiles(): Promise<AppUser[]> {
  const rows = await selectRows<ProfileRow>(
    'admin_user_directory',
    'id,full_name,email,role,approval_status,batch_id,target_exam,class_label,avatar_seed,rank,average_score,streak_days',
    {
    order: 'full_name.asc',
    },
  );
  return rows.map(mapProfile);
}
