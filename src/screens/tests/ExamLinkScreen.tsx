import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ShieldAlert, ShieldCheck, Clock, ExternalLink, Lock } from 'lucide-react-native';

import { AppHeader } from '../../components/common/AppHeader';
import { Badge } from '../../components/common/Badge';
import { BrandLoadingState } from '../../components/common/BrandLoadingState';
import { Button } from '../../components/common/Button';
import { Card } from '../../components/common/Card';
import { Screen } from '../../components/common/Screen';
import { RootStackScreenProps } from '../../navigation/types';
import { resolveExamLink } from '../../services/api/tests';
import { useAuthStore } from '../../store/authStore';
import { colors, radius, spacing } from '../../theme';
import { ExamLinkResolution, TestItem } from '../../types';

export function ExamLinkScreen({ route, navigation }: RootStackScreenProps<'ExamLink'>) {
  const shareCode = route?.params?.shareCode || '';
  const user = useAuthStore((state) => state.user);
  const isInitialized = useAuthStore((state) => state.isInitialized);

  const [resolution, setResolution] = useState<ExamLinkResolution | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function checkLink() {
      if (!shareCode) {
        setIsLoading(false);
        setResolution({
          status: 'INVALID',
          message: 'No exam code provided in URL.',
        });
        return;
      }

      setIsLoading(true);
      const res = await resolveExamLink(shareCode, user?.id);

      if (isMounted) {
        setResolution(res);
        setIsLoading(false);
      }
    }

    void checkLink();

    return () => {
      isMounted = false;
    };
  }, [shareCode, user?.id]);

  if (!isInitialized || isLoading) {
    return (
      <Screen contentContainerStyle={styles.centered}>
        <BrandLoadingState
          title="Resolving Exam Link"
          subtitle={`Verifying code "${shareCode}" and checking your access permissions...`}
        />
      </Screen>
    );
  }

  const test: TestItem | undefined = resolution?.test;
  const isOpenExam = Boolean(test?.isOpenForAll);

  // Requirement: Authentication Required for batch-restricted tests only
  if (!user && !isOpenExam) {
    return (
      <Screen contentContainerStyle={styles.container}>
        <AppHeader title="Exam Access Required" subtitle="Sign in to your account to open this paper" />

        <Card style={styles.card}>
          <View style={styles.iconCircleWarning}>
            <Lock size={32} color={colors.warning} />
          </View>
          <Text style={styles.title}>Sign In Required</Text>
          <Text style={styles.description}>
            You must be signed in to access exam code <Text style={styles.bold}>{shareCode}</Text>.
          </Text>

          <Button
            style={styles.actionBtn}
            onPress={() => {
              navigation.navigate('Auth');
            }}>
            Sign In to Continue
          </Button>
        </Card>
      </Screen>
    );
  }

  if (!resolution || resolution.status === 'INVALID') {
    return (
      <Screen contentContainerStyle={styles.container}>
        <AppHeader title="Invalid Exam Link" subtitle="Code not found" />
        <Card style={styles.card}>
          <View style={styles.iconCircleDanger}>
            <ShieldAlert size={32} color={colors.danger} />
          </View>
          <Text style={styles.title}>Invalid Exam Link</Text>
          <Text style={styles.description}>{resolution?.message || 'This exam link does not exist or is invalid.'}</Text>
          <Button style={styles.actionBtn} variant="secondary" onPress={() => navigation.navigate('MainTabs')}>
            Return to Dashboard
          </Button>
        </Card>
      </Screen>
    );
  }

  if (resolution.status === 'REVOKED') {
    return (
      <Screen contentContainerStyle={styles.container}>
        <AppHeader title="Exam Link Revoked" subtitle="Access blocked" />
        <Card style={styles.card}>
          <View style={styles.iconCircleDanger}>
            <ShieldAlert size={32} color={colors.danger} />
          </View>
          <Text style={styles.title}>Access Revoked</Text>
          <Text style={styles.description}>{resolution.message}</Text>
          <Button style={styles.actionBtn} variant="secondary" onPress={() => navigation.navigate('MainTabs')}>
            Return to Dashboard
          </Button>
        </Card>
      </Screen>
    );
  }

  if (resolution.status === 'EXPIRED') {
    return (
      <Screen contentContainerStyle={styles.container}>
        <AppHeader title="Exam Link Expired" subtitle="Time limit reached" />
        <Card style={styles.card}>
          <View style={styles.iconCircleWarning}>
            <Clock size={32} color={colors.warning} />
          </View>
          <Text style={styles.title}>Exam Expired</Text>
          <Text style={styles.description}>{resolution.message}</Text>
          <Button style={styles.actionBtn} variant="secondary" onPress={() => navigation.navigate('MainTabs')}>
            Return to Dashboard
          </Button>
        </Card>
      </Screen>
    );
  }

  if (resolution.status === 'BATCH_RESTRICTED') {
    return (
      <Screen contentContainerStyle={styles.container}>
        <AppHeader title="Batch Access Restricted" subtitle="Batch mismatch" />
        <Card style={styles.card}>
          <View style={styles.iconCircleWarning}>
            <Lock size={32} color={colors.warning} />
          </View>
          <Text style={styles.title}>Batch Restricted</Text>
          <Text style={styles.description}>{resolution.message}</Text>
          <Badge label="Restricted Batch Mode" tone="warning" />
          <Button style={styles.actionBtn} variant="secondary" onPress={() => navigation.navigate('MainTabs')}>
            Go to My Exams
          </Button>
        </Card>
      </Screen>
    );
  }

  return (
    <Screen contentContainerStyle={styles.container}>
      <AppHeader title="Exam Link Resolved" subtitle={`Unique Link Code: ${shareCode}`} />

      <Card style={styles.card}>
        <View style={styles.iconCircleSuccess}>
          <ShieldCheck size={32} color={colors.success} />
        </View>

        <Text style={styles.title}>{test?.title || 'Shareable Exam'}</Text>
        <Text style={styles.description}>{test?.description || 'Click below to start your exam session.'}</Text>

        <View style={styles.metaRow}>
          <Badge
            label={test?.isOpenForAll ? 'OPEN FOR ALL' : 'RESTRICTED BATCH'}
            tone={test?.isOpenForAll ? 'success' : 'primary'}
          />
          <Badge label={`${test?.durationMinutes || 180} mins`} tone="neutral" />
          <Badge label={test?.subject || 'All Subjects'} tone="neutral" />
        </View>

        <Button
          style={styles.actionBtn}
          onPress={() => {
            if (test?.id) {
              navigation.replace('TestIntro', { testId: test.id });
            }
          }}>
          Open Paper Now
        </Button>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.xl,
    gap: spacing.lg,
  },
  centered: {
    flex: 1,
    paddingHorizontal: spacing.xl,
    justifyContent: 'center',
  },
  card: {
    padding: spacing.xl,
    gap: spacing.md,
    alignItems: 'center',
  },
  iconCircleSuccess: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.successSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCircleWarning: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.warningSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCircleDanger: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.dangerSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
  },
  description: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  bold: {
    fontWeight: '700',
    color: colors.primary,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    justifyContent: 'center',
    marginVertical: spacing.sm,
  },
  actionBtn: {
    width: '100%',
    marginTop: spacing.sm,
  },
});
