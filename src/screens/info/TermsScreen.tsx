import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AppHeader } from '../../components/common/AppHeader';
import { Card } from '../../components/common/Card';
import { Screen } from '../../components/common/Screen';
import { colors, spacing } from '../../theme';

const termsSections = [
  {
    title: 'Use Of The Platform',
    body: 'This platform is designed for learning, testing, scholarship participation, and student support. Access to batch-wise weekly papers is granted only after admin approval and valid batch assignment.',
  },
  {
    title: 'Account Responsibility',
    body: 'Every learner is responsible for maintaining correct profile details, using a personal account, and keeping login credentials private.',
  },
  {
    title: 'Test Integrity',
    body: 'Any misuse, unfair practice, impersonation, or attempt to disrupt exams may lead to removal of access without prior notice.',
  },
  {
    title: 'Batch Access',
    body: 'Weekly papers are reserved for MIITJEE students of the matching batch. Scholarship papers may require separate registration details before the exam begins.',
  },
];

export function TermsScreen() {
  return (
    <Screen>
      <AppHeader title="Terms & Conditions" subtitle="A simple overview of how the MIITJEE app experience should be used" />

      <View style={styles.list}>
        {termsSections.map((section) => (
          <Card key={section.title} style={styles.card}>
            <Text style={styles.title}>{section.title}</Text>
            <Text style={styles.body}>{section.body}</Text>
          </Card>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: {
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
  card: {
    gap: spacing.sm,
  },
  title: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '800',
  },
  body: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 21,
  },
});
