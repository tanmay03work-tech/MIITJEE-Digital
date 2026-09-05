import AsyncStorage from '@react-native-async-storage/async-storage';
import { ReattemptRequestRecord } from '../../types';
import { deleteRows, insertRow, selectRows, updateRows } from '../supabase/client';

const REATTEMPT_STORAGE_KEY = '@miitjee:reattempt_requests_cache';

interface ReattemptRequestRow {
  id: string;
  test_id: string;
  test_title: string;
  user_id?: string | null;
  student_name: string;
  phone?: string | null;
  reason?: string | null;
  status: string;
  created_at: string;
  approved_at?: string | null;
}

function mapReattemptRow(row: ReattemptRequestRow): ReattemptRequestRecord {
  return {
    id: row.id,
    testId: row.test_id,
    testTitle: row.test_title,
    userId: row.user_id || undefined,
    studentName: row.student_name,
    phone: row.phone || undefined,
    reason: row.reason || undefined,
    status: (row.status as 'pending' | 'approved' | 'rejected') || 'pending',
    createdAt: row.created_at,
    approvedAt: row.approved_at || undefined,
  };
}

let inMemoryReattempts: ReattemptRequestRecord[] = [];

async function loadLocalReattempts(): Promise<ReattemptRequestRecord[]> {
  try {
    const raw = await AsyncStorage.getItem(REATTEMPT_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        inMemoryReattempts = parsed;
        return parsed;
      }
    }
  } catch {
    // Ignore
  }
  return inMemoryReattempts;
}

async function saveLocalReattempts(records: ReattemptRequestRecord[]): Promise<void> {
  inMemoryReattempts = records;
  try {
    await AsyncStorage.setItem(REATTEMPT_STORAGE_KEY, JSON.stringify(records));
  } catch {
    // Ignore
  }
}

export async function submitReattemptRequest(payload: {
  testId: string;
  testTitle: string;
  userId?: string;
  studentName: string;
  phone?: string;
  reason?: string;
}): Promise<ReattemptRequestRecord> {
  const localList = await loadLocalReattempts();

  const tempRecord: ReattemptRequestRecord = {
    id: `local_reattempt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    testId: payload.testId,
    testTitle: payload.testTitle,
    userId: payload.userId,
    studentName: payload.studentName,
    phone: payload.phone,
    reason: payload.reason,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };

  // Prepend to local storage immediately
  const updatedLocal = [tempRecord, ...localList.filter((r) => !(r.testId === payload.testId && r.studentName.toLowerCase() === payload.studentName.toLowerCase()))];
  await saveLocalReattempts(updatedLocal);

  try {
    const inserted = await insertRow<ReattemptRequestRow>('reattempt_requests', {
      test_id: payload.testId,
      test_title: payload.testTitle,
      user_id: payload.userId || null,
      student_name: payload.studentName,
      phone: payload.phone || null,
      reason: payload.reason || null,
      status: 'pending',
    });

    if (inserted) {
      const mapped = mapReattemptRow(inserted);
      const replacedLocal = [mapped, ...localList.filter((r) => r.id !== tempRecord.id && !(r.testId === payload.testId && r.studentName.toLowerCase() === payload.studentName.toLowerCase()))];
      await saveLocalReattempts(replacedLocal);
      return mapped;
    }
  } catch (err) {
    console.warn('[submitReattemptRequest] Remote Supabase insert skipped or failed:', err);
  }

  return tempRecord;
}

export async function fetchReattemptRequests(): Promise<ReattemptRequestRecord[]> {
  const localList = await loadLocalReattempts();

  try {
    const rows = await selectRows<ReattemptRequestRow>(
      'reattempt_requests',
      'id,test_id,test_title,user_id,student_name,phone,reason,status,created_at,approved_at',
      { order: 'created_at.desc' }
    );

    if (rows && rows.length > 0) {
      const mapped = rows.map(mapReattemptRow);
      await saveLocalReattempts(mapped);
      return mapped;
    }
  } catch (err) {
    console.warn('[fetchReattemptRequests] Remote Supabase fetch skipped:', err);
  }

  return localList;
}

export async function fetchReattemptStatusForTest(
  testId: string,
  userId?: string,
  studentName?: string,
): Promise<ReattemptRequestRecord | null> {
  const localList = await loadLocalReattempts();

  // Try Supabase first
  try {
    const filters: Record<string, string> = { test_id: `eq.${testId}` };
    if (userId) {
      filters.user_id = `eq.${userId}`;
    }

    const rows = await selectRows<ReattemptRequestRow>(
      'reattempt_requests',
      'id,test_id,test_title,user_id,student_name,phone,reason,status,created_at,approved_at',
      {
        ...filters,
        order: 'created_at.desc',
        limit: 1,
      }
    );

    if (rows && rows.length > 0 && rows[0]) {
      const mapped = mapReattemptRow(rows[0]);
      // Update local cache
      const updated = [mapped, ...localList.filter((r) => r.id !== mapped.id)];
      await saveLocalReattempts(updated);
      return mapped;
    }
  } catch (err) {
    // Ignore remote failure
  }

  // Fallback to local match
  const match = localList.find((r) => {
    if (r.testId !== testId) return false;
    if (userId && r.userId === userId) return true;
    if (studentName && r.studentName.trim().toLowerCase() === studentName.trim().toLowerCase()) return true;
    return false;
  });

  return match || null;
}

export async function updateReattemptRequestStatus(
  requestId: string,
  status: 'pending' | 'approved' | 'rejected',
): Promise<void> {
  const localList = await loadLocalReattempts();
  const approvedAt = status === 'approved' ? new Date().toISOString() : undefined;

  const updatedLocal = localList.map((r) => (r.id === requestId ? { ...r, status, approvedAt } : r));
  await saveLocalReattempts(updatedLocal);

  try {
    await updateRows(
      'reattempt_requests',
      {
        status,
        approved_at: approvedAt || null,
      },
      { id: `eq.${requestId}` }
    );
  } catch (err) {
    console.warn('[updateReattemptRequestStatus] Remote update skipped:', err);
  }
}

export async function deleteReattemptRequest(requestId: string): Promise<void> {
  const localList = await loadLocalReattempts();
  const updatedLocal = localList.filter((r) => r.id !== requestId);
  await saveLocalReattempts(updatedLocal);

  try {
    await deleteRows('reattempt_requests', { id: `eq.${requestId}` });
  } catch (err) {
    console.warn('[deleteReattemptRequest] Remote delete skipped:', err);
  }
}
