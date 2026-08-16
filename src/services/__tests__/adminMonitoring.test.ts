export type StudentSessionStatus =
  | 'IN_PROGRESS'
  | 'SUBMITTED'
  | 'AUTO_SUBMITTED'
  | 'EXPIRED'
  | 'DISCONNECTED'
  | 'WARNING_TRIGGERED';

export interface LiveStudentSession {
  sessionId: string;
  userId: string;
  studentName: string;
  batchId?: string;
  status: StudentSessionStatus;
  currentQuestionIndex: number;
  attemptedCount: number;
  unattemptedCount: number;
  flaggedCount: number;
  violationsCount: number;
  timeExtendedMinutes: number;
  deviceInfo: string;
  lastActiveAt: string;
}

export class LiveExamMonitoringEngine {
  private sessions: Map<string, LiveStudentSession> = new Map();

  public registerSession(session: LiveStudentSession): void {
    this.sessions.set(session.sessionId, session);
  }

  public getSessions(): LiveStudentSession[] {
    return Array.from(this.sessions.values());
  }

  public forceSubmitSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;
    session.status = 'AUTO_SUBMITTED';
    session.lastActiveAt = new Date().toISOString();
    return true;
  }

  public extendSessionTime(sessionId: string, minutes: number): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;
    session.timeExtendedMinutes += minutes;
    session.lastActiveAt = new Date().toISOString();
    return true;
  }

  public resetSessionWarnings(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;
    session.violationsCount = 0;
    if (session.status === 'WARNING_TRIGGERED') {
      session.status = 'IN_PROGRESS';
    }
    session.lastActiveAt = new Date().toISOString();
    return true;
  }
}

describe('Phase 11 - Admin Submission Monitoring Tests', () => {
  let engine: LiveExamMonitoringEngine;

  beforeEach(() => {
    engine = new LiveExamMonitoringEngine();
    engine.registerSession({
      sessionId: 's-1',
      userId: 'u-1',
      studentName: 'Aarav Sharma',
      batchId: 'JEE-2026',
      status: 'IN_PROGRESS',
      currentQuestionIndex: 12,
      attemptedCount: 10,
      unattemptedCount: 80,
      flaggedCount: 2,
      violationsCount: 2,
      timeExtendedMinutes: 0,
      deviceInfo: 'Windows Desktop',
      lastActiveAt: new Date().toISOString(),
    });
  });

  test('Test 1: Admin monitors live student status and device indicators', () => {
    const sessions = engine.getSessions();
    expect(sessions.length).toBe(1);
    expect(sessions[0]?.studentName).toBe('Aarav Sharma');
    expect(sessions[0]?.status).toBe('IN_PROGRESS');
    expect(sessions[0]?.deviceInfo).toBe('Windows Desktop');
    expect(sessions[0]?.attemptedCount).toBe(10);
  });

  test('Test 2: Admin Force Submit action updates status to AUTO_SUBMITTED', () => {
    const ok = engine.forceSubmitSession('s-1');
    expect(ok).toBe(true);

    const updated = engine.getSessions()[0];
    expect(updated?.status).toBe('AUTO_SUBMITTED');
  });

  test('Test 3: Admin Extend Time action adds extra minutes (+15m)', () => {
    const ok = engine.extendSessionTime('s-1', 15);
    expect(ok).toBe(true);

    const updated = engine.getSessions()[0];
    expect(updated?.timeExtendedMinutes).toBe(15);
  });

  test('Test 4: Admin Reset Warnings clears violation count', () => {
    const ok = engine.resetSessionWarnings('s-1');
    expect(ok).toBe(true);

    const updated = engine.getSessions()[0];
    expect(updated?.violationsCount).toBe(0);
    expect(updated?.status).toBe('IN_PROGRESS');
  });
});
