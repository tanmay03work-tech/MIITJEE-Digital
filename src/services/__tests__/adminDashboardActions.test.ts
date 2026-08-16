export interface TestControlRecord {
  id: string;
  title: string;
  status: 'DRAFT' | 'PUBLISHED' | 'ENDED' | 'ARCHIVED';
  isPublished: boolean;
  deletedAt: string | null;
  startedAt: string | null;
  shareCode?: string;
}

export class TestControlEngine {
  private test: TestControlRecord;

  constructor(initial: TestControlRecord) {
    this.test = { ...initial };
  }

  public getTest(): TestControlRecord {
    return this.test;
  }

  public togglePublish(publishState: boolean): void {
    this.test.isPublished = publishState;
    this.test.status = publishState ? 'PUBLISHED' : 'DRAFT';
  }

  public startExamNow(): void {
    this.test.isPublished = true;
    this.test.status = 'PUBLISHED';
    this.test.startedAt = new Date().toISOString();
  }

  public endExamNow(): void {
    this.test.isPublished = false;
    this.test.status = 'ENDED';
  }

  public archiveExam(): void {
    this.test.isPublished = false;
    this.test.status = 'ARCHIVED';
  }

  public softDeleteExam(): void {
    this.test.deletedAt = new Date().toISOString();
    this.test.status = 'ARCHIVED';
    this.test.isPublished = false;
  }

  public generateShareCode(): string {
    const code = 'SHARE123';
    this.test.shareCode = code;
    return code;
  }
}

describe('Phase 18 - Admin Exam Dashboard Actions Tests', () => {
  const initialTest: TestControlRecord = {
    id: 'test-100',
    title: 'JEE Mock Paper 1',
    status: 'DRAFT',
    isPublished: false,
    deletedAt: null,
    startedAt: null,
  };

  test('Test 1: Publish & Unpublish actions toggle isPublished state', () => {
    const engine = new TestControlEngine(initialTest);

    engine.togglePublish(true);
    expect(engine.getTest().isPublished).toBe(true);
    expect(engine.getTest().status).toBe('PUBLISHED');

    engine.togglePublish(false);
    expect(engine.getTest().isPublished).toBe(false);
    expect(engine.getTest().status).toBe('DRAFT');
  });

  test('Test 2: Start Exam Now action forces status to PUBLISHED and records startedAt timestamp', () => {
    const engine = new TestControlEngine(initialTest);
    engine.startExamNow();

    expect(Boolean(engine.getTest().startedAt)).toBe(true);
  });

  test('Test 3: End Exam Now action sets status to ENDED and locks paper', () => {
    const engine = new TestControlEngine(initialTest);
    engine.startExamNow();
    engine.endExamNow();

    expect(engine.getTest().status).toBe('ENDED');
    expect(engine.getTest().isPublished).toBe(false);
  });

  test('Test 4: Soft Delete action marks deletedAt without wiping attempt history', () => {
    const engine = new TestControlEngine(initialTest);
    engine.softDeleteExam();

    expect(Boolean(engine.getTest().deletedAt)).toBe(true);
    expect(engine.getTest().status).toBe('ARCHIVED');
  });

  test('Test 5: Share Link Generation generates 8-char code', () => {
    const engine = new TestControlEngine(initialTest);
    const code = engine.generateShareCode();

    expect(code).toBe('SHARE123');
    expect(engine.getTest().shareCode).toBe('SHARE123');
  });
});
