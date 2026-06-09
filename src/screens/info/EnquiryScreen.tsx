import React, { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { AppHeader } from '../../components/common/AppHeader';
import { AnimatedPressable } from '../../components/common/AnimatedPressable';
import { Card } from '../../components/common/Card';
import { InputField } from '../../components/common/InputField';
import { Screen } from '../../components/common/Screen';
import { useAppStore } from '../../store/appStore';
import { useAuthStore } from '../../store/authStore';
import { colors, radius, spacing } from '../../theme';

export function EnquiryScreen() {
  const user = useAuthStore((state) => state.user);
  const submitGeneralEnquiry = useAppStore((state) => state.submitGeneralEnquiry);

  const [fullName, setFullName] = useState(user?.fullName ?? '');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState(user?.email ?? '');
  const [message, setMessage] = useState('');

  const handleSubmit = async () => {
    if (!fullName.trim() || !phone.trim() || !email.trim() || !message.trim()) {
      Alert.alert('Details missing', 'Please complete all enquiry details before submitting.');
      return;
    }

    try {
      await submitGeneralEnquiry({
        fullName: fullName.trim(),
        phone: phone.trim(),
        email: email.trim(),
        message: message.trim(),
      });
      setPhone('');
      setMessage('');
      Alert.alert('Enquiry received', 'Our team will review your message and reach out shortly.');
    } catch (error) {
      Alert.alert('Unable to submit', error instanceof Error ? error.message : 'Please try again in a moment.');
    }
  };

  return (
    <Screen>
      <AppHeader title="Enquiry" subtitle="Share your goals, questions, or admission interest and our team will follow up" />

      <View style={styles.list}>
        <Card style={styles.card}>
          <Text style={styles.title}>Tell us how we can help</Text>
          <Text style={styles.subtitle}>
            Ask about batches, mentoring, scholarship papers, admissions, or the right preparation path for your profile.
          </Text>
          <InputField label="Full Name" placeholder="Your full name" value={fullName} onChangeText={setFullName} />
          <InputField label="Phone Number" placeholder="Mobile number" keyboardType="phone-pad" value={phone} onChangeText={setPhone} />
          <InputField
            label="Email Address"
            placeholder="name@example.com"
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
          <InputField
            label="Message"
            placeholder="Tell us what you need guidance with"
            multiline
            value={message}
            onChangeText={setMessage}
            style={styles.messageInput}
          />
          <AnimatedPressable style={styles.button} onPress={() => void handleSubmit()}>
            <Text style={styles.buttonText}>Send Enquiry</Text>
          </AnimatedPressable>
        </Card>
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
    gap: spacing.lg,
  },
  title: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '800',
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 21,
  },
  messageInput: {
    minHeight: 116,
    textAlignVertical: 'top',
  },
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    paddingVertical: spacing.lg,
    borderRadius: radius.md,
  },
  buttonText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '800',
  },
});
