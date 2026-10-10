import React, { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { AppHeader } from '../../components/common/AppHeader';
import { Button } from '../../components/common/Button';
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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<{ fullName?: string; phone?: string; email?: string; message?: string }>({});

  const handleSubmit = async () => {
    if (isSubmitting) return;

    const newErrors: { fullName?: string; phone?: string; email?: string; message?: string } = {};
    if (!fullName.trim()) newErrors.fullName = 'Full name is required';
    if (!phone.trim()) newErrors.phone = 'Phone number is required';
    if (!email.trim()) newErrors.email = 'Email address is required';
    if (!message.trim()) newErrors.message = 'Please enter a message';

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      Alert.alert('Missing Details', 'Please complete the highlighted required fields.');
      return;
    }
    setErrors({});

    try {
      setIsSubmitting(true);
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
    } finally {
      setIsSubmitting(false);
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
          <InputField
            label="Full Name"
            placeholder="Your full name"
            value={fullName}
            onChangeText={(val) => {
              setFullName(val);
              if (errors.fullName) setErrors((prev) => ({ ...prev, fullName: undefined }));
            }}
            error={errors.fullName}
            required
          />
          <InputField
            label="Phone Number"
            placeholder="Mobile number"
            keyboardType="phone-pad"
            value={phone}
            onChangeText={(val) => {
              setPhone(val);
              if (errors.phone) setErrors((prev) => ({ ...prev, phone: undefined }));
            }}
            error={errors.phone}
            required
          />
          <InputField
            label="Email Address"
            placeholder="name@example.com"
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={(val) => {
              setEmail(val);
              if (errors.email) setErrors((prev) => ({ ...prev, email: undefined }));
            }}
            error={errors.email}
            required
          />
          <InputField
            label="Message"
            placeholder="Tell us what you need guidance with"
            multiline
            value={message}
            onChangeText={(val) => {
              setMessage(val);
              if (errors.message) setErrors((prev) => ({ ...prev, message: undefined }));
            }}
            error={errors.message}
            required
            style={styles.messageInput}
          />
          <Button
            label="Send Enquiry"
            loadingLabel="Sending Enquiry..."
            loading={isSubmitting}
            onPress={() => void handleSubmit()}
            size="lg"
            fullWidth
          />
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
