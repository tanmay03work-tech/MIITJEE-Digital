import {
  fetchAdminDiagnostics,
  adminForceSubmitSession,
  adminExtendSessionTime,
  adminResetSessionWarnings,
} from '../api/admin';
import * as client from '../supabase/client';

jest.mock('../supabase/client', () => ({
  rpc: jest.fn(),
  selectRows: jest.fn(),
  updateRows: jest.fn(),
  insertRow: jest.fn(),
  deleteRows: jest.fn(),
  getAuthenticatedAccessToken: jest.fn().mockResolvedValue('test-token'),
}));

describe('Admin Diagnostics & CBT Session Control', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('fetchAdminDiagnostics maps real session diagnostic records from RPC', async () => {
    const mockRpcData = [
      {
        session_id: 'sess-1',
        test_id: 'test-1',
        test_title: 'JEE Advanced Weekly Test 01',
        user_id: 'user-101',
        student_name: 'Aarav Sharma',
        batch_id: 'batch-jee-2026',
        status: 'WARNING_TRIGGERED',
        current_question_index: 12,
        attempted_count: 10,
        unattempted_count: 20,
        flagged_count: 2,
        violations_count: 2,
        time_extended_minutes: 0,
        device_info: 'Chrome 122 on Windows',
        last_active_at: '2026-10-10T12:00:00Z',
        issue_code: 'TAB_SWITCH_WARNING',
        issue_reason: 'Student has 2 tab-switch violation warning(s).',
        suggested_action: 'Monitor student activity or reset warnings.',
      },
      {
        session_id: 'sess-2',
        test_id: 'test-1',
        test_title: 'JEE Advanced Weekly Test 01',
        user_id: 'user-102',
        student_name: 'Priya Verma',
        batch_id: 'batch-jee-2026',
        status: 'AUTO_SUBMITTED',
        current_question_index: 25,
        attempted_count: 22,
        unattempted_count: 8,
        flagged_count: 0,
        violations_count: 3,
        time_extended_minutes: 0,
        device_info: 'Edge 121 on Windows',
        last_active_at: '2026-10-10T12:05:00Z',
        issue_code: 'MAX_TAB_VIOLATIONS',
        issue_reason: 'Student reached maximum tab-switch violation limit (auto-submit policy).',
        suggested_action: 'Confirm submission in attempts or allow reattempt if permitted.',
      },
    ];

    (client.rpc as any).mockResolvedValueOnce(mockRpcData);

    const diagnostics = await fetchAdminDiagnostics('test-1');

    expect(client.rpc).toHaveBeenCalledWith('admin_get_diagnostics_sessions', {
      p_test_id: 'test-1',
    });
    expect(diagnostics).toHaveLength(2);

    expect(diagnostics[0]?.sessionId).toBe('sess-1');
    expect(diagnostics[0]?.studentName).toBe('Aarav Sharma');
    expect(diagnostics[0]?.violationsCount).toBe(2);
    expect(diagnostics[0]?.issueCode).toBe('TAB_SWITCH_WARNING');

    expect(diagnostics[1]?.sessionId).toBe('sess-2');
    expect(diagnostics[1]?.status).toBe('AUTO_SUBMITTED');
    expect(diagnostics[1]?.issueCode).toBe('MAX_TAB_VIOLATIONS');
  });

  test('adminForceSubmitSession triggers server-side force submission RPC', async () => {
    (client.rpc as any).mockResolvedValueOnce(true);

    const success = await adminForceSubmitSession('sess-1');

    expect(client.rpc).toHaveBeenCalledWith('admin_force_submit_session', {
      p_session_id: 'sess-1',
    });
    expect(success).toBe(true);
  });

  test('adminExtendSessionTime triggers server-side time extension RPC', async () => {
    (client.rpc as any).mockResolvedValueOnce(true);

    const success = await adminExtendSessionTime('sess-1', 15);

    expect(client.rpc).toHaveBeenCalledWith('admin_extend_session_time', {
      p_session_id: 'sess-1',
      p_minutes: 15,
    });
    expect(success).toBe(true);
  });

  test('adminResetSessionWarnings triggers warning reset RPC', async () => {
    (client.rpc as any).mockResolvedValueOnce(true);

    const success = await adminResetSessionWarnings('sess-1');

    expect(client.rpc).toHaveBeenCalledWith('admin_reset_session_warnings', {
      p_session_id: 'sess-1',
    });
    expect(success).toBe(true);
  });
});
