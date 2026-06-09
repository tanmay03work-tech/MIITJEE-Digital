import React, { memo, useState } from 'react';
import { FlatList, Image, ListRenderItem, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInRight, FadeInUp } from 'react-native-reanimated';
import LinearGradient from 'react-native-linear-gradient';
import { ArrowRight, BookOpenCheck, ClipboardList, Layers3, ShieldCheck, Trophy, Zap } from 'lucide-react-native';

import { Badge } from '../common/Badge';
import { Button } from '../common/Button';
import { Card } from '../common/Card';
import { EmptyState } from '../common/EmptyState';
import { IconListItem } from '../common/IconListItem';
import { MediaInfoCard } from '../common/MediaInfoCard';
import { SectionTitle } from '../common/SectionTitle';
import { StatCard } from '../common/StatCard';
import { QuickActionGrid } from './QuickActionGrid';
import { ScholarshipHero } from './ScholarshipHero';
import { colors, radius, spacing } from '../../theme';
import { Batch, QuickAction, TestItem, TestResult, UserRole } from '../../types';
import { formatDateTimeLabel } from '../../utils/formatters';
import { getTestStatusLabel, isTestActive } from '../../utils/testAvailability';

interface HeaderSectionProps {
  nextTest?: TestItem;
  rankLabel: string;
  batchCount: number;
  attemptCount: number;
  averageScoreLabel: string;
  onPressScholarship: () => void;
}

interface ContinueLearningSectionProps {
  quickActions: QuickAction[];
  onContinue: () => void;
  onQuickAction: (target: QuickAction['target']) => void;
}

interface RecommendedTestsSectionProps {
  upcomingTests: TestItem[];
  onOpenTest: (test: TestItem) => void;
}

interface RecentResultsSectionProps {
  latestResults: TestResult[];
  testsById: Record<string, TestItem>;
}

interface LeaderboardPreviewSectionProps {
  batches: Batch[];
  userRole?: UserRole;
  userApproved?: boolean;
}

interface HomeBatchCardProps {
  batch: Batch;
}

function HomeBatchCardComponent({ batch }: HomeBatchCardProps) {
  const imageUri = typeof batch.imageUrl === 'string' ? batch.imageUrl : undefined;
  const [imageFailed, setImageFailed] = useState(false);
  const showRemoteImage = !!imageUri && !imageFailed;

  return (
    <View style={styles.courseCard}>
      {showRemoteImage ? (
        <Image source={{ uri: imageUri }} style={styles.batchMediaImage} resizeMode="cover" onError={() => setImageFailed(true)} />
      ) : (
        <LinearGradient colors={[colors.primary, colors.primaryDeep]} style={styles.courseMedia}>
          <View style={styles.courseSheen} />
          <View style={styles.batchFallbackMeta}>
            <Text style={styles.batchFallbackEyebrow}>{batch.targetExam}</Text>
            <Text style={styles.batchFallbackTitle}>{batch.label}</Text>
          </View>
        </LinearGradient>
      )}
      <View style={styles.courseBody}>
        <Badge label={batch.targetExam} tone="primary" />
        <Text style={styles.courseTitle}>{batch.label}</Text>
        <Text style={styles.courseMeta}>{`${batch.classLabel} | ${batch.id}`}</Text>
        <Text style={styles.coursePrice}>{batch.description || 'Structured batch program with papers, guidance, and progress tracking.'}</Text>
      </View>
    </View>
  );
}

const HomeBatchCard = memo(HomeBatchCardComponent);

const renderBatchCard: ListRenderItem<Batch> = ({ item, index }) => (
  <Animated.View entering={FadeInUp.delay(index * 50)}>
    <HomeBatchCard batch={item} />
  </Animated.View>
);

function HeaderSectionComponent({
  nextTest,
  rankLabel,
  batchCount,
  attemptCount,
  averageScoreLabel,
  onPressScholarship,
}: HeaderSectionProps) {
  return (
    <>
      <View style={styles.headerShell}>
        <ScholarshipHero onPress={onPressScholarship} />
      </View>

      <Animated.View entering={FadeInUp.delay(40)} style={styles.dashboardStrip}>
        <Card style={[styles.dashboardCard, styles.dashboardCardPrimary]}>
          <Text style={styles.dashboardLabel}>Upcoming Test</Text>
          <Text style={styles.dashboardValue}>{nextTest?.title ?? 'No test scheduled'}</Text>
          <Text style={styles.dashboardMeta}>
            {nextTest ? `${formatDateTimeLabel(nextTest.scheduledAt)} | ${nextTest.durationMinutes} min` : 'We will show your next paper here.'}
          </Text>
        </Card>
        <Card style={styles.dashboardCard}>
          <Text style={styles.dashboardLabel}>Your Rank</Text>
          <Text style={styles.dashboardValue}>{rankLabel}</Text>
          <Text style={styles.dashboardMeta}>Updated from your latest performance trend.</Text>
        </Card>
      </Animated.View>

      <View style={styles.statsShell}>
      <View style={styles.statsHeader}>
          <Text style={styles.statsEyebrow}>Performance overview</Text>
          <Text style={styles.statsLead}>Quick stats</Text>
        </View>
        <View style={styles.statsGrid}>
          <StatCard icon={Layers3} iconColor={colors.info} iconBackground={colors.infoSoft} label="Batches" value={`${batchCount}`} />
          <StatCard icon={ClipboardList} iconColor={colors.accent} iconBackground={colors.accentSoft} label="Attempts" value={`${attemptCount}`} />
          <StatCard icon={Trophy} iconColor={colors.warning} iconBackground={colors.warningSoft} label="Average" value={averageScoreLabel} />
          <StatCard icon={Zap} iconColor={colors.primary} iconBackground={colors.primarySoft} label="Rank" value={rankLabel} />
        </View>
      </View>
    </>
  );
}

export const HeaderSection = memo(HeaderSectionComponent);

function ContinueLearningSectionComponent({ quickActions, onContinue, onQuickAction }: ContinueLearningSectionProps) {
  return (
    <>
      <Animated.View entering={FadeInRight.delay(80)} style={styles.continueCardWrap}>
        <Card style={styles.continueCard}>
          <View style={styles.continueTextWrap}>
            <Text style={styles.continueEyebrow}>Continue learning</Text>
            <Text style={styles.continueTitle}>Resume your test preparation.</Text>
          </View>
          <Button style={styles.continueButton} onPress={onContinue}>
            Continue Test
          </Button>
        </Card>
      </Animated.View>

      <QuickActionGrid actions={quickActions} onPress={onQuickAction} />
    </>
  );
}

export const ContinueLearningSection = memo(ContinueLearningSectionComponent);

function RecommendedTestsSectionComponent({ upcomingTests, onOpenTest }: RecommendedTestsSectionProps) {
  return (
    <>
      <SectionTitle title="Test Series" />
      <View style={styles.sectionStack}>
        {upcomingTests.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title="No papers scheduled yet"
            description="As soon as an exam is published, it will appear here for quick access."
          />
        ) : (
          upcomingTests.map((test, index) => (
            <Animated.View key={test.id} entering={FadeInUp.delay(80 + index * 50)}>
              <MediaInfoCard
                title={test.title}
                subtitle={`${formatDateTimeLabel(test.scheduledAt)} | ${test.durationMinutes} min`}
                rightSlot={
                  <View style={styles.testActionStack}>
                    <Badge label={getTestStatusLabel(test)} tone={isTestActive(test) ? 'success' : 'warning'} />
                    <Button variant="secondary" style={styles.testButton} onPress={() => onOpenTest(test)}>
                      Open
                    </Button>
                  </View>
                }
              />
            </Animated.View>
          ))
        )}
      </View>
    </>
  );
}

export const RecommendedTestsSection = memo(RecommendedTestsSectionComponent);

function RecentResultsSectionComponent({ latestResults, testsById }: RecentResultsSectionProps) {
  return (
    <>
      <SectionTitle title="Recent Results" />
      <View style={styles.sectionStack}>
        {latestResults.length === 0 ? (
          <EmptyState
            icon={ShieldCheck}
            title="Nothing attempted yet"
            description="Start with a scholarship paper or your assigned weekly paper to see your progress here."
          />
        ) : (
          latestResults.map((result, index) => (
            <Animated.View key={result.id} entering={FadeInUp.delay(120 + index * 50)}>
              <Card>
                <IconListItem
                  icon={<ShieldCheck size={18} color={colors.primary} />}
                  title={testsById[result.testId]?.title ?? 'Test Attempt'}
                  subtitle={`${result.correctAnswers}/${result.totalQuestions} correct | Rank #${result.rank}`}
                  rightSlot={<Text style={styles.resultScore}>{result.score}%</Text>}
                />
              </Card>
            </Animated.View>
          ))
        )}
      </View>
    </>
  );
}

export const RecentResultsSection = memo(RecentResultsSectionComponent);

function LeaderboardPreviewSectionComponent({ batches, userRole, userApproved }: LeaderboardPreviewSectionProps) {
  return (
    <>
      <SectionTitle
        title="Batch Preview"
        action={userRole === 'admin' && userApproved ? <Badge label="Admin View" tone="primary" /> : undefined}
      />
      {batches.length === 0 ? (
        <View style={styles.sectionStack}>
          <EmptyState
            icon={Layers3}
            title="Batches will appear here"
            description="Once batches are configured, active programs will show up on this home screen."
          />
        </View>
      ) : (
        <FlatList
          horizontal
          data={batches}
          keyExtractor={(item) => item.id}
          renderItem={renderBatchCard}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.horizontalScroller}
          initialNumToRender={3}
          maxToRenderPerBatch={3}
          windowSize={3}
          removeClippedSubviews={false}
        />
      )}
    </>
  );
}

export const LeaderboardPreviewSection = memo(LeaderboardPreviewSectionComponent);

export const HomeSectionPlaceholder = memo(function HomeSectionPlaceholder({
  title,
  compact = false,
}: {
  title: string;
  compact?: boolean;
}) {
  return (
    <View style={styles.placeholderWrap}>
      <SectionTitle title={title} />
      <Card style={[styles.placeholderCard, compact && styles.placeholderCardCompact]}>
        <View style={styles.placeholderHeader}>
          <View style={styles.placeholderIcon}>
            <BookOpenCheck size={16} color={colors.primary} />
          </View>
          <View style={styles.placeholderTextWrap}>
            <View style={styles.placeholderLineShort} />
            <View style={styles.placeholderLineLong} />
          </View>
        </View>
        <View style={styles.placeholderBody}>
          <View style={styles.placeholderPill} />
          <View style={styles.placeholderPillMuted} />
          {!compact ? <View style={styles.placeholderPanel} /> : null}
        </View>
      </Card>
    </View>
  );
});

export const HomeFeedSkeleton = memo(function HomeFeedSkeleton() {
  return (
    <View style={styles.skeletonWrap}>
      <Card style={styles.skeletonHero} />
      <View style={styles.skeletonRow}>
        <Card style={styles.skeletonTile} />
        <Card style={styles.skeletonTile} />
      </View>
      <Card style={styles.skeletonPanel} />
      <Card style={styles.skeletonPanel} />
    </View>
  );
});

const styles = StyleSheet.create({
  headerShell: {
    gap: spacing.lg,
    marginBottom: spacing.xl,
  },
  dashboardStrip: {
    paddingHorizontal: spacing.xl,
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  dashboardCard: {
    flex: 1,
    minWidth: 0,
    gap: spacing.sm,
  },
  dashboardCardPrimary: {
    backgroundColor: colors.primarySoft,
    borderColor: 'transparent',
  },
  dashboardLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  dashboardValue: {
    color: colors.text,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '800',
  },
  dashboardMeta: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  continueCardWrap: {
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.xxl,
  },
  continueCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    minWidth: 0,
  },
  continueTextWrap: {
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
    gap: 2,
  },
  continueEyebrow: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  continueTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  continueSubtitle: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
  },
  continueButton: {
    minWidth: 132,
    flexShrink: 0,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  statsShell: {
    marginHorizontal: spacing.xl,
    marginBottom: spacing.xxl,
    padding: spacing.md,
    borderRadius: radius.xl,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statsHeader: {
    marginBottom: spacing.md,
    gap: 2,
  },
  statsEyebrow: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.9,
  },
  statsLead: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  horizontalScroller: {
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
    paddingBottom: spacing.xs,
    marginBottom: spacing.xxl,
  },
  courseCard: {
    width: 248,
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  courseMedia: {
    height: 112,
    justifyContent: 'flex-end',
    padding: spacing.lg,
  },
  courseSheen: {
    position: 'absolute',
    top: 16,
    left: 18,
    width: 72,
    height: 18,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  batchMediaImage: {
    width: '100%',
    height: 112,
    backgroundColor: colors.surfaceMuted,
  },
  batchFallbackMeta: {
    gap: spacing.xs,
  },
  batchFallbackEyebrow: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  batchFallbackTitle: {
    color: colors.white,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '900',
  },
  courseBody: {
    padding: spacing.lg,
    gap: spacing.sm,
  },
  courseTitle: {
    color: colors.text,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '800',
  },
  courseMeta: {
    color: colors.textMuted,
    fontSize: 13,
  },
  coursePrice: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: '800',
  },
  sectionStack: {
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
    marginBottom: spacing.xxl,
  },
  testButton: {
    minWidth: 96,
    minHeight: 46,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    flexShrink: 0,
  },
  testActionStack: {
    alignItems: 'flex-end',
    gap: spacing.sm,
  },
  resultScore: {
    color: colors.primary,
    fontSize: 18,
    fontWeight: '800',
    flexShrink: 0,
  },
  placeholderWrap: {
    marginBottom: spacing.xxl,
  },
  placeholderCard: {
    marginHorizontal: spacing.xl,
    gap: spacing.md,
  },
  placeholderCardCompact: {
    minHeight: 120,
  },
  placeholderHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  placeholderIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
  },
  placeholderTextWrap: {
    flex: 1,
    gap: spacing.sm,
  },
  placeholderLineShort: {
    width: '42%',
    height: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
  },
  placeholderLineLong: {
    width: '88%',
    height: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
  },
  placeholderBody: {
    gap: spacing.sm,
  },
  placeholderPill: {
    width: 92,
    height: 30,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
  },
  placeholderPillMuted: {
    width: '55%',
    height: 12,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
  },
  placeholderPanel: {
    width: '100%',
    height: 72,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceMuted,
  },
  skeletonWrap: {
    paddingHorizontal: spacing.xl,
    gap: spacing.lg,
  },
  skeletonHero: {
    minHeight: 180,
    backgroundColor: colors.surfaceMuted,
  },
  skeletonRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  skeletonTile: {
    flex: 1,
    minHeight: 112,
    backgroundColor: colors.surfaceMuted,
  },
  skeletonPanel: {
    minHeight: 120,
    backgroundColor: colors.surfaceMuted,
  },
});
