import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AppState, AppStateStatus, BackHandler, FlatList, Image, StyleSheet, Text, TextInput, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Flag, LayoutGrid, Timer } from 'lucide-react-native';
import Animated, { FadeInUp, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AnimatedPressable } from '../../components/common/AnimatedPressable';
import { AppHeader } from '../../components/common/AppHeader';
import { Badge } from '../../components/common/Badge';
import { BrandLoadingState } from '../../components/common/BrandLoadingState';
import { Button } from '../../components/common/Button';
import { Card } from '../../components/common/Card';
import { Screen } from '../../components/common/Screen';
import { OptionCard } from '../../components/tests/OptionCard';
import { QuestionPaletteSheet } from '../../components/tests/QuestionPaletteSheet';
import { RootStackScreenProps } from '../../navigation/types';
import { fetchExistingAttemptForTest, logViolation } from '../../services/api/tests';
import { useAppStore } from '../../store/appStore';
import { useAuthStore } from '../../store/authStore';
import { useTestSessionStore } from '../../store/testSessionStore';
import { colors, radius, spacing } from '../../theme';
import { getEligibility } from '../../utils/accessControl';
import { formatExamTextForDisplay } from '../../utils/examText';
import { formatClock } from '../../utils/formatters';
import { getTestLockedMessage } from '../../utils/testAvailability';

const MAX_WARNINGS = 3;
const AUTO_SUBMIT_VIOLATION = MAX_WARNINGS + 1;
const VIOLATION_DEBOUNCE_MS = 1500;

export function TestAttemptScreen({ route, navigation }: RootStackScreenProps<'TestAttempt'>) {
  const { testId } = route.params;
  const insets = useSafeAreaInsets();
  const [paletteVisible, setPaletteVisible] = useState(false);
  const autoSubmittedRef = useRef(false);
  const submitInFlightRef = useRef(false);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const lastViolationAtRef = useRef(0);
  const violationCountRef = useRef(0);
  const [sessionError, setSessionError] = useState<string>();
  const [isSessionReady, setIsSessionReady] = useState(false);
  const [violationCount, setViolationCount] = useState(0);
  const [warningMessage, setWarningMessage] = useState<string>();

  const user = useAuthStore((state) => state.user);
  const loadQuestions = useAppStore((state) => state.loadQuestions);
  const submitAttempt = useAppStore((state) => state.submitAttempt);
  const isSubmitting = useAppStore((state) => state.isSubmitting);
  const test = useAppStore((state) => state.tests.find((candidate) => candidate.id === testId));

  const {
    questions,
    answers,
    flaggedQuestionIds,
    currentIndex,
    secondsRemaining,
    startSession,
    selectAnswer,
    toggleFlag,
    jumpTo,
    next,
    previous,
    tick,
    reset,
  } = useTestSessionStore();

  const eligibility = test ? getEligibility(user, test) : null;
  const isWeeklyProctored = test?.type === 'weekly';
  const violationStorageKey = useMemo(
    () => (user && test ? `miitjee:weekly-violations:${user.id}:${test.id}` : ''),
    [test, user],
  );

  useEffect(() => {
    violationCountRef.current = violationCount;
  }, [violationCount]);

  useEffect(() => {
    if (!warningMessage) {
      return;
    }

    const timeout = setTimeout(() => {
      setWarningMessage(undefined);
    }, 2600);

    return () => clearTimeout(timeout);
  }, [warningMessage]);

  const persistViolationCount = useCallback(async (count: number) => {
    if (!violationStorageKey) {
      return;
    }

    await AsyncStorage.setItem(
      violationStorageKey,
      JSON.stringify({
        count,
        updatedAt: new Date().toISOString(),
      }),
    );
  }, [violationStorageKey]);

  const clearViolationState = useCallback(async () => {
    violationCountRef.current = 0;
    setViolationCount(0);

    if (violationStorageKey) {
      await AsyncStorage.removeItem(violationStorageKey);
    }
  }, [violationStorageKey]);

  useEffect(() => {
    let isMounted = true;

    async function bootstrapSession() {
      if (!test) {
        return;
      }

      if (!eligibility?.allowed) {
        if (isMounted) {
          setSessionError('You are not eligible to attempt this test.');
        }
        return;
      }

      try {
        setSessionError(undefined);
        setIsSessionReady(false);
        autoSubmittedRef.current = false;
        submitInFlightRef.current = false;

        const existingAttempt = await fetchExistingAttemptForTest(test.id, user?.id);
        if (existingAttempt) {
          navigation.replace('TestResult', {
            testId: test.id,
            resultId: existingAttempt.id,
          });
          return;
        }

        const fetchedQuestions = await loadQuestions(test.id);

        if (!isMounted) {
          return;
        }

        if (fetchedQuestions.length === 0) {
          setSessionError('No questions were available for this test.');
          return;
        }

        startSession(test, fetchedQuestions);
        setIsSessionReady(true);
      } catch (error) {
        if (!isMounted) {
          return;
        }

        const message = error instanceof Error ? error.message : 'Unable to load this test right now.';
        const normalizedMessage = message.toLowerCase();

        if (
          normalizedMessage.includes('locked') ||
          normalizedMessage.includes('start time') ||
          normalizedMessage.includes('scheduled time') ||
          normalizedMessage.includes('have patience')
        ) {
          Alert.alert('Paper locked', test ? getTestLockedMessage(test) : message);
          navigation.goBack();
          return;
        }

        setSessionError(message);
      }
    }

    void bootstrapSession();

    return () => {
      isMounted = false;
    };
  }, [eligibility?.allowed, loadQuestions, startSession, test]);

  useEffect(() => {
    if (!questions.length || secondsRemaining <= 0) {
      return;
    }

    const interval = setInterval(() => {
      tick();
    }, 1000);

    return () => clearInterval(interval);
  }, [questions.length, secondsRemaining, tick]);

  useEffect(() => {
    let isMounted = true;

    async function hydrateViolations() {
      if (!isWeeklyProctored || !violationStorageKey) {
        setViolationCount(0);
        return;
      }

      try {
        const stored = await AsyncStorage.getItem(violationStorageKey);
        if (!stored || !isMounted) {
          return;
        }

        const parsed = JSON.parse(stored) as { count?: number };
        const nextCount = Math.max(0, Number(parsed.count ?? 0));
        violationCountRef.current = nextCount;
        setViolationCount(nextCount);
      } catch {
        violationCountRef.current = 0;
        setViolationCount(0);
      }
    }

    void hydrateViolations();

    return () => {
      isMounted = false;
    };
  }, [isWeeklyProctored, violationStorageKey]);

  const handleSubmit = useCallback(async () => {
    if (!user || !test || isSubmitting || submitInFlightRef.current) {
      return;
    }

    submitInFlightRef.current = true;

    try {
      const response = await submitAttempt({
        testId: test.id,
        userId: user.id,
        answers,
      });

      await clearViolationState();
      reset();
      navigation.replace('TestResult', {
        testId: test.id,
        resultId: response.result.id,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Please try again.';

      if (message.toLowerCase().includes('already given this test.')) {
        const existingAttempt = await fetchExistingAttemptForTest(test.id, user?.id);
        if (existingAttempt) {
          await clearViolationState();
          reset();
          navigation.replace('TestResult', {
            testId: test.id,
            resultId: existingAttempt.id,
          });
          return;
        }
      }

      submitInFlightRef.current = false;
      autoSubmittedRef.current = false;
      Alert.alert('Submission failed', message);
    }
  }, [answers, clearViolationState, isSubmitting, navigation, reset, submitAttempt, test, user]);

  const triggerAutoSubmit = useCallback(() => {
    if (!test || autoSubmittedRef.current) {
      return;
    }

    autoSubmittedRef.current = true;
    setWarningMessage('Warning limit crossed. Your weekly paper is being submitted.');

    if (isWeeklyProctored) {
      void logViolation({ testId: test.id, violationType: 'auto_submit' }).catch(() => undefined);
    }

    void handleSubmit();
  }, [handleSubmit, isWeeklyProctored, test]);

  const handleViolation = useCallback(async (violationType: 'app_background' | 'app_inactive') => {
    if (!isWeeklyProctored || !test || !isSessionReady || isSubmitting || submitInFlightRef.current) {
      return;
    }

    const now = Date.now();
    if (now - lastViolationAtRef.current < VIOLATION_DEBOUNCE_MS) {
      return;
    }
    lastViolationAtRef.current = now;

    const nextCount = violationCountRef.current + 1;
    violationCountRef.current = nextCount;
    setViolationCount(nextCount);

    try {
      await persistViolationCount(nextCount);
    } catch {
      // Best-effort persistence to survive app restarts.
    }

    void logViolation({ testId: test.id, violationType }).catch(() => undefined);

    if (nextCount <= MAX_WARNINGS) {
      setWarningMessage(
        nextCount === MAX_WARNINGS
          ? `Final warning ${nextCount}/${MAX_WARNINGS}. Leaving once more will submit your paper automatically.`
          : `Warning ${nextCount}/${MAX_WARNINGS}. Please stay inside the app during this weekly paper.`,
      );
      return;
    }

    triggerAutoSubmit();
  }, [isSessionReady, isSubmitting, isWeeklyProctored, persistViolationCount, test, triggerAutoSubmit]);

  useEffect(() => {
    if (secondsRemaining === 0 && questions.length > 0 && !autoSubmittedRef.current) {
      autoSubmittedRef.current = true;
      void handleSubmit();
    }
  }, [handleSubmit, questions.length, secondsRemaining]);

  useEffect(() => {
    if (!isWeeklyProctored || !test || !user || !isSessionReady) {
      return;
    }

    const subscription = AppState.addEventListener('change', (nextAppState) => {
      const previousAppState = appStateRef.current;
      appStateRef.current = nextAppState;

      if (previousAppState === 'active' && (nextAppState === 'background' || nextAppState === 'inactive')) {
        void handleViolation(nextAppState === 'background' ? 'app_background' : 'app_inactive');
      }
    });

    return () => {
      subscription.remove();
    };
  }, [handleViolation, isSessionReady, isWeeklyProctored, test, user]);

  useEffect(() => {
    if (!isWeeklyProctored || !isSessionReady || violationCount < AUTO_SUBMIT_VIOLATION || autoSubmittedRef.current) {
      return;
    }

    triggerAutoSubmit();
  }, [isSessionReady, isWeeklyProctored, triggerAutoSubmit, violationCount]);

  useEffect(() => {
    if (!isSessionReady) {
      return;
    }

    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      Alert.alert('Finish the paper first', 'Android back button is disabled during the exam. Use Submit Test or Exit Test below.');
      return true;
    });

    return () => {
      subscription.remove();
    };
  }, [isSessionReady]);

  const progress = questions.length > 0 ? ((currentIndex + 1) / questions.length) * 100 : 0;
  const progressWidth = useSharedValue(progress);

  useEffect(() => {
    progressWidth.value = withTiming(progress, { duration: 220 });
  }, [progress, progressWidth]);

  const progressStyle = useAnimatedStyle(() => ({
    width: `${progressWidth.value}%`,
  }));

  useEffect(() => {
    const nextQuestion = questions[currentIndex + 1];
    if (!nextQuestion?.imageUrl) {
      return;
    }

    void Image.prefetch(nextQuestion.imageUrl).catch(() => false);
  }, [currentIndex, questions]);

  const currentQuestion = questions[currentIndex];
  const selectedAnswer = currentQuestion ? answers[currentQuestion.id] : undefined;
  const isLastQuestion = currentIndex === questions.length - 1;
  const isFlagged = currentQuestion ? flaggedQuestionIds.includes(currentQuestion.id) : false;
  const unansweredCount = questions.length - Object.keys(answers).length;
  const currentSubjectLabel = currentQuestion?.subjectLabel?.trim() || test?.subject?.trim() || 'General Section';
  const isSubjectSectionTagged = !!currentQuestion?.subjectLabel?.trim();
  const currentQuestionId = currentQuestion?.id;
  const currentQuestionPrompt = currentQuestion ? formatExamTextForDisplay(currentQuestion.prompt) : '';
  const questionIds = useMemo(() => questions.map((question) => question.id), [questions]);

  const handleTogglePalette = useCallback(() => {
    setPaletteVisible((current) => !current);
  }, []);

  const handleJump = useCallback(
    (index: number) => {
      jumpTo(index);
      setPaletteVisible(false);
    },
    [jumpTo],
  );

  const handleToggleFlag = useCallback(() => {
    if (!currentQuestionId) {
      return;
    }
    toggleFlag(currentQuestionId);
  }, [currentQuestionId, toggleFlag]);

  const handleIntegerChange = useCallback(
    (value: string) => {
      if (!currentQuestionId) {
        return;
      }
      selectAnswer(currentQuestionId, value.replace(/[^0-9-]/g, ''));
    },
    [currentQuestionId, selectAnswer],
  );

  const handleSelectAnswer = useCallback(
    (answer: string) => {
      if (!currentQuestionId) {
        return;
      }
      selectAnswer(currentQuestionId, answer);
    },
    [currentQuestionId, selectAnswer],
  );

  const renderQuestionContent = useCallback(() => {
    if (!currentQuestion) {
      return null;
    }

    return (
      <Animated.View entering={FadeInUp.delay(90)}>
        <Card style={styles.questionCard}>
          <View style={styles.questionHeader}>
            <View style={styles.subjectWrap}>
              <Badge label={currentSubjectLabel} tone="primary" />
              <Text style={styles.subjectHint}>
                {isSubjectSectionTagged ? 'Current subject section' : 'Subject section not tagged, showing test subject'}
              </Text>
            </View>
            <AnimatedPressable style={styles.flagButton} onPress={handleToggleFlag}>
              <Flag size={18} color={isFlagged ? colors.warning : colors.textMuted} />
            </AnimatedPressable>
          </View>

          <View style={styles.questionMetaRow}>
            <Text style={styles.questionEyebrow}>Question {currentIndex + 1}</Text>
            <Text style={styles.questionMeta}>{unansweredCount} left unanswered</Text>
          </View>

          <Text style={styles.questionText}>{currentQuestionPrompt}</Text>

          {currentQuestion.imageUrl ? (
            <Image source={{ uri: currentQuestion.imageUrl }} style={styles.questionImage} resizeMode="cover" />
          ) : null}

          {currentQuestion.type === 'integer' ? (
            <View style={styles.integerCard}>
              <Text style={styles.integerLabel}>Enter integer answer</Text>
              <TextInput
                keyboardType="numeric"
                value={selectedAnswer ?? ''}
                onChangeText={handleIntegerChange}
                placeholder="Type your answer"
                placeholderTextColor={colors.textSubtle}
                style={styles.integerInput}
              />
            </View>
          ) : (
            <View style={styles.optionList}>
              {currentQuestion.options.map((option, optionIndex) => (
                <OptionCard
                  key={`${currentQuestion.id}_${optionIndex}`}
                  badgeLabel={String.fromCharCode(65 + optionIndex)}
                  label={option}
                  selected={selectedAnswer === option}
                  onPress={() => handleSelectAnswer(option)}
                />
              ))}
            </View>
          )}
        </Card>
      </Animated.View>
    );
  }, [
    currentIndex,
    currentQuestion,
    currentQuestionPrompt,
    currentSubjectLabel,
    handleIntegerChange,
    handleSelectAnswer,
    handleToggleFlag,
    isFlagged,
    isSubjectSectionTagged,
    selectedAnswer,
    unansweredCount,
  ]);

  if (sessionError) {
    return (
      <Screen contentContainerStyle={styles.loadingContent}>
        <AppHeader title="Test Unavailable" subtitle={sessionError} />
        <Button style={styles.recoveryButton} onPress={() => navigation.goBack()}>
          Go Back
        </Button>
      </Screen>
    );
  }

  if (!test || !isSessionReady || questions.length === 0) {
    return (
      <Screen contentContainerStyle={styles.loadingContent}>
        <AppHeader title="Loading Test" subtitle="Preparing the question set and timer" />
        <BrandLoadingState
          title="Preparing your paper"
          subtitle="Loading questions, checking eligibility, and setting up your timer."
        />
      </Screen>
    );
  }

  if (!currentQuestion) {
    return (
      <Screen contentContainerStyle={styles.loadingContent}>
        <AppHeader title="Loading Test" subtitle="Preparing the current question" />
        <BrandLoadingState
          title="Opening the next question"
          subtitle="Please wait while we move you to the correct question state."
        />
      </Screen>
    );
  }

  return (
    <Screen useScrollView={false} contentContainerStyle={styles.content}>
      <AppHeader
        title={test.title}
        subtitle={`Question ${currentIndex + 1} of ${questions.length}`}
        compact
        rightSlot={
          <AnimatedPressable style={styles.iconButton} onPress={handleTogglePalette}>
            <LayoutGrid size={18} color={colors.primary} />
          </AnimatedPressable>
        }
      />

      <Animated.View entering={FadeInUp.delay(40)}>
        <Card style={styles.timerCard}>
          <View style={styles.timerRow}>
            <View style={styles.timerWrap}>
              <Timer size={16} color={colors.primary} />
              <Text style={styles.timerText}>{formatClock(secondsRemaining)}</Text>
            </View>
            <Badge
              label={isWeeklyProctored ? `Warnings ${Math.min(violationCount, MAX_WARNINGS)}/${MAX_WARNINGS}` : isFlagged ? 'Flagged' : 'In Progress'}
              tone={isWeeklyProctored ? (violationCount >= MAX_WARNINGS ? 'warning' : 'primary') : isFlagged ? 'warning' : 'primary'}
            />
          </View>
          <View style={styles.progressBar}>
            <Animated.View style={[styles.progressFill, progressStyle]} />
          </View>
          {isWeeklyProctored ? (
            <Text style={styles.proctoringHint}>Weekly paper protection is active. Leaving the app more than 3 times will auto-submit this paper.</Text>
          ) : null}
        </Card>
      </Animated.View>

      {warningMessage ? (
        <View style={[styles.warningToast, violationCount >= MAX_WARNINGS ? styles.warningToastCritical : undefined]}>
          <Text style={styles.warningToastTitle}>
            {violationCount >= AUTO_SUBMIT_VIOLATION ? 'Auto Submit Triggered' : `Warning ${Math.min(violationCount, MAX_WARNINGS)}/${MAX_WARNINGS}`}
          </Text>
          <Text style={styles.warningToastText}>{warningMessage}</Text>
        </View>
      ) : null}

      {paletteVisible ? (
        <View style={styles.paletteSection}>
          <QuestionPaletteSheet
            currentIndex={currentIndex}
            totalQuestions={questions.length}
            answers={answers}
            questionIds={questionIds}
            flaggedQuestionIds={flaggedQuestionIds}
            onJump={handleJump}
          />
        </View>
      ) : null}

      {!paletteVisible ? (
        <FlatList
          data={[currentQuestion]}
          keyExtractor={(item) => item.id}
          renderItem={() => renderQuestionContent()}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[styles.questionListContent, { paddingBottom: spacing.md + insets.bottom }]}
          style={styles.questionList}
        />
      ) : null}

      <View style={[styles.footerSection, { paddingBottom: Math.max(insets.bottom, spacing.sm) + spacing.xs }]}>
        <View style={styles.footerActions}>
          <Button
            variant="secondary"
            style={[styles.actionButton, currentIndex === 0 && styles.secondaryButtonDisabled]}
            disabled={currentIndex === 0 || isSubmitting}
            onPress={previous}>
            Previous
          </Button>

          {!isLastQuestion ? (
            <Button style={styles.actionButton} onPress={next} disabled={isSubmitting}>
              Next
            </Button>
          ) : (
            <Button style={styles.actionButton} onPress={() => void handleSubmit()} disabled={isSubmitting} loading={isSubmitting}>
              Submit Test
            </Button>
          )}
        </View>

        <AnimatedPressable
          style={styles.exitButton}
          onPress={() =>
            Alert.alert('Exit test?', 'Your current answers will be discarded.', [
              { text: 'Continue Test', style: 'cancel' },
              {
                text: 'Exit',
                style: 'destructive',
                onPress: () => {
                  void clearViolationState().finally(() => {
                    reset();
                    navigation.goBack();
                  });
                },
              },
            ])
          }>
          <Text style={styles.exitButtonText}>Exit Test</Text>
        </AnimatedPressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  loadingContent: {
    paddingHorizontal: spacing.xl,
    gap: spacing.lg,
    flex: 1,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 14,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timerCard: {
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  timerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
    flexWrap: 'wrap',
    minWidth: 0,
  },
  timerWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexShrink: 1,
    minWidth: 0,
  },
  timerText: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: '800',
    flexShrink: 1,
  },
  progressBar: {
    height: 6,
    borderRadius: 4,
    backgroundColor: colors.surfaceMuted,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: colors.primary,
  },
  proctoringHint: {
    color: colors.textMuted,
    fontSize: 11,
    lineHeight: 16,
  },
  warningToast: {
    backgroundColor: colors.warningSoft,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.warning,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.xs,
  },
  warningToastCritical: {
    backgroundColor: colors.dangerSoft,
    borderColor: colors.danger,
  },
  warningToastTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '800',
  },
  warningToastText: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  questionCard: {
    gap: spacing.xl,
    minWidth: 0,
  },
  questionListContent: {
    paddingBottom: spacing.md,
  },
  questionList: {
    flex: 1,
  },
  paletteSection: {
    flex: 1,
  },
  questionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
    minWidth: 0,
  },
  subjectWrap: {
    gap: spacing.xs,
    minWidth: 0,
    flex: 1,
  },
  subjectHint: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
  },
  questionMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
    flexWrap: 'wrap',
    minWidth: 0,
  },
  questionEyebrow: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    flexShrink: 1,
  },
  questionMeta: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
    flexShrink: 1,
  },
  flagButton: {
    width: 42,
    height: 42,
    borderRadius: 16,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  questionText: {
    color: colors.text,
    fontSize: 20,
    lineHeight: 29,
    fontWeight: '800',
    flexShrink: 1,
    minWidth: 0,
  },
  questionImage: {
    width: '100%',
    height: 180,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceMuted,
  },
  optionList: {
    gap: spacing.md,
  },
  integerCard: {
    gap: spacing.sm,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    padding: spacing.lg,
    minWidth: 0,
  },
  integerLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  integerInput: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  footerActions: {
    flexDirection: 'row',
    gap: spacing.md,
    minWidth: 0,
  },
  footerSection: {
    gap: spacing.xs,
    paddingTop: spacing.xs,
  },
  actionButton: {
    flex: 1,
    minWidth: 0,
    minHeight: 44,
    paddingVertical: 12,
    borderRadius: radius.md,
  },
  secondaryButtonDisabled: {
    opacity: 0.55,
  },
  exitButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
  },
  exitButtonText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  recoveryButton: {
    minHeight: 54,
  },
});
