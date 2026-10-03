import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AppState, AppStateStatus, BackHandler, FlatList, Image, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Flag, LayoutGrid, Timer, X, AlertCircle } from 'lucide-react-native';
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
import { QuestionBodyRenderer } from '../../components/tests/QuestionBodyRenderer';
import { RootStackScreenProps } from '../../navigation/types';
import { fetchExistingAttemptForTest, logViolation, fetchTests } from '../../services/api/tests';
import { activityLog } from '../../services/api/activityLogger';
import { useAppStore } from '../../store/appStore';
import { useAuthStore } from '../../store/authStore';
import { useTestSessionStore } from '../../store/testSessionStore';
import { colors, radius, spacing } from '../../theme';
import { TestItem, TestQuestion } from '../../types';
import { getEligibility } from '../../utils/accessControl';
import { formatExamTextForDisplay } from '../../utils/examText';
import { formatClock } from '../../utils/formatters';
import { normalizeNumericAnswer } from '../../utils/numericAnswer';
import { getTestLockedMessage } from '../../utils/testAvailability';
const MAX_WARNINGS = 3;
const AUTO_SUBMIT_THRESHOLD = 4;
const VIOLATION_DEBOUNCE_MS = 2000;

interface ExamTimerCardProps {
  isWeeklyProctored: boolean;
  violationCount: number;
  isFlagged: boolean;
  progress: number;
}

const ExamTimerCard = React.memo(function ExamTimerCard({
  isWeeklyProctored,
  violationCount,
  isFlagged,
  progress,
}: ExamTimerCardProps) {
  const secondsRemaining = useTestSessionStore((s) => s.secondsRemaining);

  return (
    <Card style={styles.timerCard}>
      <View style={styles.timerRow}>
        <View style={styles.timerWrap}>
          <Timer size={16} color={colors.primary} />
          <Text style={styles.timerText}>{formatClock(secondsRemaining)}</Text>
        </View>
        <Badge
          label={
            isWeeklyProctored
              ? `Warnings ${Math.min(violationCount, MAX_WARNINGS)}/${MAX_WARNINGS}`
              : isFlagged
              ? 'Marked for Review'
              : 'In Progress'
          }
          tone={
            isWeeklyProctored
              ? violationCount >= MAX_WARNINGS
                ? 'warning'
                : 'primary'
              : isFlagged
              ? 'warning'
              : 'primary'
          }
        />
      </View>
      <View style={styles.progressBar}>
        <View style={[styles.progressFill, { width: `${progress}%` }]} />
      </View>
      {isWeeklyProctored ? (
        <Text style={styles.proctoringHint}>
          Weekly paper protection is active. Leaving the app 4 times will auto-submit this paper.
        </Text>
      ) : null}
    </Card>
  );
});

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
  const [warningMessage, setWarningMessage] = useState<string>();
  const [violationCount, setViolationCount] = useState(0);

  const user = useAuthStore((state) => state.user);
  const loadQuestions = useAppStore((state) => state.loadQuestions);
  const submitAttempt = useAppStore((state) => state.submitAttempt);
  const isSubmitting = useAppStore((state) => state.isSubmitting);
  const testFromStore = useAppStore((state) => state.tests.find((candidate) => candidate.id === testId));
  const [resolvedTest, setResolvedTest] = useState<TestItem | undefined>(testFromStore);
  const test = testFromStore || resolvedTest;

  const questions = useTestSessionStore((s) => s.questions);
  const answers = useTestSessionStore((s) => s.answers);
  const flaggedQuestionIds = useTestSessionStore((s) => s.flaggedQuestionIds);
  const currentIndex = useTestSessionStore((s) => s.currentIndex);
  const startSession = useTestSessionStore((s) => s.startSession);
  const selectAnswer = useTestSessionStore((s) => s.selectAnswer);
  const clearResponse = useTestSessionStore((s) => s.clearResponse);
  const toggleFlag = useTestSessionStore((s) => s.toggleFlag);
  const jumpTo = useTestSessionStore((s) => s.jumpTo);
  const next = useTestSessionStore((s) => s.next);
  const previous = useTestSessionStore((s) => s.previous);
  const reset = useTestSessionStore((s) => s.reset);

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
      let activeTest = test;

      if (!activeTest) {
        try {
          const allTests = await fetchTests();
          const match = allTests.find((candidate: TestItem) => candidate.id === testId);
          if (match) {
            activeTest = match;
          }
        } catch {
          // Ignore
        }
      }

      if (!activeTest) {
        if (isMounted) {
          setSessionError('Test not found or unavailable.');
        }
        return;
      }

      if (isMounted) {
        setResolvedTest(activeTest);
      }

      const testEligibility = getEligibility(user, activeTest);

      if (!testEligibility?.allowed) {
        if (isMounted) {
          setSessionError('You are not eligible to attempt this test.');
        }
        return;
      }

      try {
        if (isMounted) {
          setSessionError(undefined);
          setIsSessionReady(false);
        }

        const isRetake = Boolean(route.params?.studentName);
        if (!isRetake) {
          try {
            const existingAttempt = await fetchExistingAttemptForTest(activeTest.id, user?.id);
            if (existingAttempt) {
              navigation.replace('TestResult', {
                testId: activeTest.id,
                resultId: existingAttempt.id,
              });
              return;
            }
          } catch {
            // Ignore existing attempt lookup error
          }
        }

        let fetchedQuestions: TestQuestion[] = [];
        try {
          fetchedQuestions = await loadQuestions(activeTest.id, activeTest.title);
        } catch {
          fetchedQuestions = [];
        }

        if (!fetchedQuestions || fetchedQuestions.length === 0) {
          if (isMounted) {
            setSessionError('No questions were available for this test.');
          }
          return;
        }

        const resolvedStudentName = route.params?.studentName || useTestSessionStore.getState().studentName || user?.fullName || 'Student';
        startSession(activeTest, fetchedQuestions, resolvedStudentName);
        if (isMounted) {
          setIsSessionReady(true);
          setSessionError(undefined);
        }
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
          Alert.alert('Paper locked', activeTest ? getTestLockedMessage(activeTest) : message);
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
  }, [testId, route.params?.studentName]);

  useEffect(() => {
    if (!isSessionReady) {
      return;
    }

    const interval = setInterval(() => {
      const state = useTestSessionStore.getState();
      if (state.questions.length > 0 && state.secondsRemaining > 0) {
        state.tick();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [isSessionReady]);

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

  const handleSubmit = useCallback(
    async (isAutoSubmit = false) => {
      if (!test || isSubmitting || submitInFlightRef.current) {
        return;
      }

      const executeSubmit = async () => {
        if (submitInFlightRef.current) return;
        submitInFlightRef.current = true;

        try {
          const activeStudentName =
            route.params?.studentName ||
            useTestSessionStore.getState().studentName ||
            user?.fullName ||
            'Student';
          const activeUserId = user?.id || 'guest_user';
          const liveAnswers = useTestSessionStore.getState().answers;

          const response = await submitAttempt({
            testId: test.id,
            userId: activeUserId,
            answers: liveAnswers,
            studentName: activeStudentName,
          });

          activityLog.logExam('EXAM_SUBMITTED', {
            userId: activeUserId,
            studentName: activeStudentName,
            testId: test.id,
            testTitle: test.title,
            score: response.result.score,
            status: 'success',
          });
          void activityLog.flush();

          await clearViolationState();
          navigation.replace('TestResult', {
            testId: test.id,
            resultId: response.result.id,
          });
          reset();
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Please try again.';

          if (message.toLowerCase().includes('already given this test.')) {
            const existingAttempt = await fetchExistingAttemptForTest(test.id, user?.id);
            if (existingAttempt) {
              await clearViolationState();
              navigation.replace('TestResult', {
                testId: test.id,
                resultId: existingAttempt.id,
              });
              reset();
              return;
            }
          }

          submitInFlightRef.current = false;
          autoSubmittedRef.current = false;
          Alert.alert('Submission failed', message);
        }
      };

      if (isAutoSubmit) {
        await executeSubmit();
        return;
      }

      Alert.alert(
        'Submit Test',
        'Are you sure you want to submit the test?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Submit Test',
            onPress: () => {
              void executeSubmit();
            },
          },
        ],
        { cancelable: true },
      );
    },
    [answers, clearViolationState, isSubmitting, navigation, reset, submitAttempt, test, user],
  );

  // Auto-submit when timer reaches 0
  useEffect(() => {
    const unsub = useTestSessionStore.subscribe((state) => {
      if (state.secondsRemaining === 0 && state.questions.length > 0 && !autoSubmittedRef.current) {
        autoSubmittedRef.current = true;
        void handleSubmit(true);
      }
    });
    return unsub;
  }, [handleSubmit]);

  const triggerAutoSubmit = useCallback(() => {
    if (!test || autoSubmittedRef.current) {
      return;
    }

    autoSubmittedRef.current = true;
    setWarningMessage('Warning limit crossed. Your weekly paper is being submitted.');

    if (isWeeklyProctored) {
      void logViolation({ testId: test.id, violationType: 'auto_submit' }).catch(() => undefined);
    }

    void handleSubmit(true);
  }, [handleSubmit, isWeeklyProctored, test]);

  const handleViolation = useCallback(
    async (violationType: 'app_background' | 'app_inactive' | 'web_visibility' | 'web_blur') => {
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
        // Best-effort local persistence to survive app restarts.
      }

      void logViolation({ testId: test.id, violationType }).catch(() => undefined);

      if (nextCount < AUTO_SUBMIT_THRESHOLD) {
        setWarningMessage(
          nextCount === MAX_WARNINGS
            ? `Final warning ${nextCount}/${MAX_WARNINGS}. Leaving the exam once more will submit your paper automatically.`
            : `Warning ${nextCount}/${MAX_WARNINGS}. Please stay inside the exam screen.`,
        );
        return;
      }

      triggerAutoSubmit();
    },
    [isSessionReady, isSubmitting, isWeeklyProctored, persistViolationCount, test, triggerAutoSubmit],
  );



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
    if (!isWeeklyProctored || !test || !user || !isSessionReady || Platform.OS !== 'web') {
      return;
    }

    const handleVisibilityChange = () => {
      if (document.hidden || document.visibilityState === 'hidden') {
        void handleViolation('web_visibility');
      }
    };

    const handleWindowBlur = () => {
      void handleViolation('web_blur');
    };

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('blur', handleWindowBlur);
    }

    return () => {
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
      if (typeof window !== 'undefined') {
        window.removeEventListener('blur', handleWindowBlur);
      }
    };
  }, [handleViolation, isSessionReady, isWeeklyProctored, test, user]);

  useEffect(() => {
    if (!isWeeklyProctored || !isSessionReady || violationCount < AUTO_SUBMIT_THRESHOLD || autoSubmittedRef.current) {
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
  const questionIds = useMemo(() => questions.map((question: { id: string }) => question.id), [questions]);

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

  const handleClearResponse = useCallback(() => {
    if (!currentQuestionId) {
      return;
    }
    clearResponse(currentQuestionId);
  }, [clearResponse, currentQuestionId]);

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
      const sanitized = normalizeNumericAnswer(value, true);
      if (!sanitized) {
        clearResponse(currentQuestionId);
        return;
      }
      selectAnswer(currentQuestionId, sanitized);
    },
    [clearResponse, currentQuestionId, selectAnswer],
  );

  const handleSelectAnswer = useCallback(
    (answer: string) => {
      if (!currentQuestionId) {
        return;
      }
      const normSelected = (selectedAnswer || '').trim().replace(/^Option\s+/i, '').toLowerCase();
      const normInput = (answer || '').trim().replace(/^Option\s+/i, '').toLowerCase();

      if (normSelected && (normSelected === normInput || selectedAnswer === answer)) {
        clearResponse(currentQuestionId);
        return;
      }
      selectAnswer(currentQuestionId, answer);
    },
    [clearResponse, currentQuestionId, selectAnswer, selectedAnswer],
  );

  const renderQuestionContent = useCallback(() => {
    if (!currentQuestion) {
      return null;
    }

    return (
      <Card style={styles.questionCard}>
        <View style={styles.questionHeader}>
          <View style={styles.subjectWrap}>
            <Badge label={currentSubjectLabel} tone="primary" />
            <Text style={styles.subjectHint}>
              {isSubjectSectionTagged ? 'Current subject section' : 'Subject section not tagged, showing test subject'}
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.markReviewHeaderBtn, isFlagged && styles.markReviewHeaderBtnActive]}
            onPress={handleToggleFlag}
            activeOpacity={0.7}
          >
            <Flag size={14} color={isFlagged ? '#7C3AED' : colors.textMuted} fill={isFlagged ? '#7C3AED' : 'none'} />
            <Text style={[styles.markReviewHeaderText, isFlagged && styles.markReviewHeaderTextActive]}>
              {isFlagged ? 'Marked for Review ✓' : 'Mark for Review'}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.questionMetaRow}>
          <Text style={styles.questionEyebrow}>Question {currentIndex + 1}</Text>
          <Text style={styles.questionMeta}>{unansweredCount} left unanswered</Text>
        </View>

        <QuestionBodyRenderer
          prompt={currentQuestion.prompt}
          imageUrl={currentQuestion.imageUrl}
        />

        {currentQuestion.type === 'integer' ? (
          <View style={styles.integerCard}>
            <View style={styles.integerHeaderRow}>
              <Text style={styles.integerLabel}>Enter integer/numerical answer</Text>
              {selectedAnswer ? (
                <TouchableOpacity onPress={handleClearResponse} style={styles.clearMiniBtn}>
                  <X size={13} color={colors.danger} />
                  <Text style={styles.clearMiniText}>Clear</Text>
                </TouchableOpacity>
              ) : null}
            </View>
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
            {currentQuestion.options.map((option: string, optionIndex: number) => {
              const badgeLetter = String.fromCharCode(65 + optionIndex);
              const normSelected = (selectedAnswer || '').trim().replace(/^Option\s+/i, '');
              const isSingleLetter = /^[A-D]$/i.test(normSelected);

              const isOptionSelected = isSingleLetter
                ? normSelected.toUpperCase() === badgeLetter
                : Boolean(normSelected) &&
                  (normSelected.toLowerCase() === option.trim().toLowerCase() ||
                    normSelected.toUpperCase() === badgeLetter);

              return (
                <OptionCard
                  key={`${currentQuestion.id}_${optionIndex}`}
                  badgeLabel={badgeLetter}
                  label={option}
                  selected={isOptionSelected}
                  onPress={() => {
                    if (isOptionSelected) {
                      handleClearResponse();
                    } else {
                      handleSelectAnswer(badgeLetter);
                    }
                  }}
                  imageUrl={currentQuestion.optionImageUrls?.[optionIndex]}
                />
              );
            })}
            {selectedAnswer ? (
              <TouchableOpacity
                style={styles.clearResponseInlineBtn}
                onPress={handleClearResponse}
                activeOpacity={0.7}
              >
                <X size={14} color={colors.danger} />
                <Text style={styles.clearResponseInlineText}>Unselect / Clear Response</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        )}
      </Card>
    );
  }, [
    currentQuestion,
    currentSubjectLabel,
    isSubjectSectionTagged,
    isFlagged,
    handleToggleFlag,
    currentIndex,
    unansweredCount,
    selectedAnswer,
    handleClearResponse,
    handleIntegerChange,
    handleSelectAnswer,
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
        showBack={false}
        rightSlot={
          <AnimatedPressable style={styles.iconButton} onPress={handleTogglePalette}>
            <LayoutGrid size={18} color={colors.primary} />
          </AnimatedPressable>
        }
      />

      <ExamTimerCard
        isWeeklyProctored={isWeeklyProctored}
        violationCount={violationCount}
        isFlagged={isFlagged}
        progress={progress}
      />

      {warningMessage ? (
        <View style={[styles.warningToast, violationCount >= MAX_WARNINGS ? styles.warningToastCritical : undefined]}>
          <Text style={styles.warningToastTitle}>
            {violationCount >= AUTO_SUBMIT_THRESHOLD ? 'Auto Submit Triggered' : `Warning ${Math.min(violationCount, MAX_WARNINGS)}/${MAX_WARNINGS}`}
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
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[styles.questionListContent, { paddingBottom: spacing.xxl + insets.bottom + 40 }]}
          style={styles.questionList}
        >
          {renderQuestionContent()}
        </ScrollView>
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

          {/* Dedicated Clear Button in footer */}
          {selectedAnswer ? (
            <TouchableOpacity
              style={styles.footerClearBtn}
              onPress={handleClearResponse}
              disabled={isSubmitting}
              activeOpacity={0.7}
            >
              <X size={15} color={colors.danger} />
              <Text style={styles.footerClearText}>Clear</Text>
            </TouchableOpacity>
          ) : null}

          {/* Mark for Review Button in footer */}
          <TouchableOpacity
            style={[styles.footerMarkReviewBtn, isFlagged && styles.footerMarkReviewBtnActive]}
            onPress={handleToggleFlag}
            disabled={isSubmitting}
            activeOpacity={0.7}
          >
            <Flag size={15} color={isFlagged ? '#7C3AED' : colors.textMuted} fill={isFlagged ? '#7C3AED' : 'none'} />
            <Text style={[styles.footerMarkReviewText, isFlagged && styles.footerMarkReviewTextActive]}>
              {isFlagged ? 'Marked ✓' : 'Mark'}
            </Text>
          </TouchableOpacity>

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
  timerCard: {
    gap: spacing.sm,
  },
  timerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  timerWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  timerText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  progressBar: {
    height: 6,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
  },
  warningToast: {
    backgroundColor: colors.warningSoft,
    borderColor: colors.warning,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  warningToastCritical: {
    backgroundColor: colors.dangerSoft,
    borderColor: colors.danger,
  },
  warningToastTitle: {
    color: colors.text,
    fontWeight: '800',
    fontSize: 14,
  },
  warningToastText: {
    color: colors.textMuted,
    fontSize: 12,
  },
  proctoringHint: {
    color: colors.textSubtle,
    fontSize: 11,
    fontWeight: '600',
  },
  paletteSection: {
    flex: 1,
  },
  questionList: {
    flex: 1,
  },
  questionListContent: {
    flexGrow: 1,
  },
  questionCard: {
    gap: spacing.lg,
    minWidth: 0,
  },
  questionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    minWidth: 0,
  },
  subjectWrap: {
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
    gap: spacing.xs,
  },
  subjectHint: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  markReviewHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  markReviewHeaderBtnActive: {
    backgroundColor: '#EDE9FE',
    borderColor: '#C4B5FD',
  },
  markReviewHeaderText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
  },
  markReviewHeaderTextActive: {
    color: '#7C3AED',
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
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 16,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  questionMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  questionEyebrow: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  questionMeta: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
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
    height: 360,
    maxHeight: 560,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceMuted,
  },
  optionList: {
    gap: spacing.md,
  },
  clearResponseInlineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: radius.md,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    marginTop: spacing.xs,
  },
  clearResponseInlineText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.danger,
  },
  integerCard: {
    gap: spacing.sm,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    padding: spacing.lg,
    minWidth: 0,
  },
  integerHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  clearMiniBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.sm,
    backgroundColor: '#FEE2E2',
  },
  clearMiniText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.danger,
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
    gap: spacing.sm,
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
  footerClearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 14,
    minHeight: 44,
    borderRadius: radius.md,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  footerClearText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.danger,
  },
  footerMarkReviewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 12,
    minHeight: 44,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  footerMarkReviewBtnActive: {
    backgroundColor: '#EDE9FE',
    borderColor: '#C4B5FD',
  },
  footerMarkReviewText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textMuted,
  },
  footerMarkReviewTextActive: {
    color: '#7C3AED',
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
  pdfNativeSection: {
    gap: spacing.md,
  },
  pdfFrame: {
    minHeight: 240,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
  },
  answerBubbleStrip: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    padding: spacing.md,
    gap: spacing.xs,
  },
  bubbleHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  answerStripLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
  },
  bubbleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  bubbleBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  bubbleBtnSelected: {
    borderColor: '#15803D',
    backgroundColor: '#DCFCE7',
  },
  bubbleText: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.text,
  },
  bubbleTextSelected: {
    color: '#15803D',
  },
  clearBubbleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  clearBubbleText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.danger,
  },
  pdfNativeErrorCard: {
    padding: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 8,
    marginVertical: spacing.md,
    gap: spacing.xs,
  },
  pdfNativeErrorTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#991B1B',
    marginTop: spacing.xs,
  },
  pdfNativeErrorSub: {
    fontSize: 13,
    color: '#B91C1C',
    textAlign: 'center',
    maxWidth: 360,
  },
});
