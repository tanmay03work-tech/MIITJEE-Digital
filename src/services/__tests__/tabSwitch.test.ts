describe('Phase 2 - Tab Switch & Focus Detection Logic', () => {
  const MAX_WARNINGS = 2;
  const AUTO_SUBMIT_THRESHOLD = 3;
  const DEBOUNCE_MS = 2000;

  class ViolationTracker {
    count = 0;
    lastViolationAt = 0;
    isAutoSubmitted = false;
    messages: string[] = [];

    handleViolation(now: number) {
      if (this.lastViolationAt !== 0 && now - this.lastViolationAt < DEBOUNCE_MS) {
        return;
      }
      this.lastViolationAt = now;

      this.count++;

      if (this.count < AUTO_SUBMIT_THRESHOLD) {
        const msg =
          this.count === MAX_WARNINGS
            ? `Final warning ${this.count}/${MAX_WARNINGS}. Leaving once more will auto-submit.`
            : `Warning ${this.count}/${MAX_WARNINGS}. Stay on paper.`;
        this.messages.push(msg);
      } else {
        this.isAutoSubmitted = true;
        this.messages.push('Auto-submitting paper due to 3rd violation.');
      }
    }
  }

  test('Test 1: Normal interaction does not trigger violations', () => {
    const tracker = new ViolationTracker();
    expect(tracker.count).toBe(0);
    expect(tracker.isAutoSubmitted).toBe(false);
  });

  test('Test 2: First tab switch produces Warning 1/2', () => {
    const tracker = new ViolationTracker();
    tracker.handleViolation(1000);
    expect(tracker.count).toBe(1);
    expect(tracker.isAutoSubmitted).toBe(false);
    expect(Boolean(tracker.messages[0]?.includes('Warning 1/2'))).toBe(true);
  });

  test('Test 3: Second tab switch produces Final Warning 2/2', () => {
    const tracker = new ViolationTracker();
    tracker.handleViolation(1000);
    tracker.handleViolation(4000); // After debounce
    expect(tracker.count).toBe(2);
    expect(tracker.isAutoSubmitted).toBe(false);
    expect(Boolean(tracker.messages[1]?.includes('Final warning 2/2'))).toBe(true);
  });

  test('Test 4: Third tab switch triggers Auto Submit', () => {
    const tracker = new ViolationTracker();
    tracker.handleViolation(1000);
    tracker.handleViolation(4000);
    tracker.handleViolation(7000);
    expect(tracker.count).toBe(3);
    expect(tracker.isAutoSubmitted).toBe(true);
    expect(Boolean(tracker.messages[2]?.includes('Auto-submitting'))).toBe(true);
  });

  test('Test 5: Rapid double-blur within debounce window is ignored', () => {
    const tracker = new ViolationTracker();
    tracker.handleViolation(1000);
    tracker.handleViolation(1100); // 100ms later (rapid blur + visibilitychange)
    expect(tracker.count).toBe(1);
  });
});
