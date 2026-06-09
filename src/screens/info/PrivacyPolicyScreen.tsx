import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AppHeader } from '../../components/common/AppHeader';
import { Card } from '../../components/common/Card';
import { Screen } from '../../components/common/Screen';
import { colors, spacing } from '../../theme';

const privacySections = [
  {
    title: 'Information We Collect',
    body: 'We collect profile details, batch requests, scholarship form entries, test attempts, and analytics required to run the learning experience smoothly.',
  },
  {
    title: 'Why We Use It',
    body: 'Your information helps us manage access, assign batches, deliver tests, compute results, and provide follow-up for scholarships and enquiries.',
  },
  {
    title: 'Who Can View It',
    body: 'Admins can review operational data such as scholarship forms, batch access requests, and enquiries. Students can view only their own profile and exam activity.',
  },
  {
    title: 'Data Security',
    body: 'Authentication, storage, and permissions are protected through Supabase roles and row-level security. Sensitive server keys are not exposed in the mobile app.',
  },
];

export function PrivacyPolicyScreen() {
  return (
    <Screen>
      <AppHeader title="Privacy Policy" subtitle="A clear view of what information is collected and how it supports your learning journey" />

      <View style={styles.list}>
        {privacySections.map((section) => (
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
