import React, { useCallback, useEffect, useRef } from 'react';
import { Linking, Platform } from 'react-native';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { AppTabs } from './AppTabs';
import { RootStackParamList } from './types';
import { colors } from '../theme';
import { useAuthStore } from '../store/authStore';
import { useAppStore } from '../store/appStore';
import { AuthScreen } from '../screens/auth/AuthScreen';
import { PendingApprovalScreen } from '../screens/auth/PendingApprovalScreen';
import { CreateBatchScreen } from '../screens/admin/CreateBatchScreen';
import { BatchesScreen } from '../screens/info/BatchesScreen';
import { EnquiryScreen } from '../screens/info/EnquiryScreen';
import { PrivacyPolicyScreen } from '../screens/info/PrivacyPolicyScreen';
import { TermsScreen } from '../screens/info/TermsScreen';
import { StudentInsightsScreen } from '../screens/profile/StudentInsightsScreen';
import { TestIntroScreen } from '../screens/tests/TestIntroScreen';
import { TestAttemptScreen } from '../screens/tests/TestAttemptScreen';
import { TestResultScreen } from '../screens/tests/TestResultScreen';
import { ReviewAnswersScreen } from '../screens/tests/ReviewAnswersScreen';
import { AdminDashboardScreen } from '../screens/admin/AdminDashboardScreen';
import { CreateTestScreen } from '../screens/admin/CreateTestScreen';
import { QuestionBankScreen } from '../screens/admin/QuestionBankScreen';
import { QuestionSetQuestionsScreen } from '../screens/admin/QuestionSetQuestionsScreen';
import { ManageTestsScreen } from '../screens/admin/ManageTestsScreen';
import { ManageUsersScreen } from '../screens/admin/ManageUsersScreen';
import { ViewResultsScreen } from '../screens/admin/ViewResultsScreen';
import { ScholarshipRegistrationsScreen } from '../screens/admin/ScholarshipRegistrationsScreen';
import { BatchAccessRequestsScreen } from '../screens/admin/BatchAccessRequestsScreen';
import { GeneralEnquiriesScreen } from '../screens/admin/GeneralEnquiriesScreen';
import { ActivityLogsScreen } from '../screens/admin/ActivityLogsScreen';
import { AdminDiagnosticsScreen } from '../screens/admin/AdminDiagnosticsScreen';
import { PdfNativeTestBuilderScreen } from '../screens/admin/PdfNativeTestBuilder/PdfNativeTestBuilderScreen';
import { PdfNativeSetManagementScreen } from '../screens/admin/PdfNativeTestBuilder/PdfNativeSetManagementScreen';
import { PdfNativeTestCreatorScreen } from '../screens/admin/PdfNativeTestBuilder/PdfNativeTestCreatorScreen';
import { PdfNativeTestManagementScreen } from '../screens/admin/PdfNativeTestBuilder/PdfNativeTestManagementScreen';
import { PdfNativeResultScreen } from '../screens/admin/PdfNativeTestBuilder/PdfNativeResultScreen';
import { PdfNativeReviewScreen } from '../screens/admin/PdfNativeTestBuilder/PdfNativeReviewScreen';
import { AnimatedSplashScreen } from '../components/common/AnimatedSplashScreen';

import { ExamLinkScreen } from '../screens/tests/ExamLinkScreen';
import { getBaseAppUrl } from '../utils/urlHelper';

const Stack = createNativeStackNavigator<RootStackParamList>();
const idleGlobal = globalThis as typeof globalThis & {
  requestIdleCallback?: (callback: () => void) => number;
  cancelIdleCallback?: (handle: number) => void;
};

const linking = {
  prefixes: [
    getBaseAppUrl(),
    'https://miitjee-cbt.vercel.app',
    'https://miitjee-digital.vercel.app',
    'https://exam.miitjee.org',
    'http://localhost:5173',
    'http://localhost:3000',
    'com.miitjee.digital://',
  ],
  config: {
    screens: {
      ExamLink: 'exam/:shareCode',
      Auth: 'auth',
      TestIntro: 'test/:testId',
      TestAttempt: 'attempt/:testId',
      TestResult: 'result/:testId/:resultId',
    },
  },
};

const navigationTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: colors.background,
    card: colors.surface,
    primary: colors.primary,
    text: colors.text,
    border: colors.border,
    notification: colors.warning,
  },
};

export function RootNavigator() {
  const user = useAuthStore((state) => state.user);
  const isInitialized = useAuthStore((state) => state.isInitialized);
  const initialize = useAuthStore((state) => state.initialize);
  const completeOAuth = useAuthStore((state) => state.completeOAuth);
  const bootstrap = useAppStore((state) => state.bootstrap);
  const loadAdminData = useAppStore((state) => state.loadAdminData);
  const isBootstrapping = useAppStore((state) => state.isBootstrapping);
  const lastHandledUrlRef = useRef<string | null>(null);
  const lastBootstrapKeyRef = useRef<string | null>(null);

  const handleOAuthLink = useCallback(
    async (url: string | null) => {
      if (!url || !url.includes('com.miitjee.digital://auth/callback') || lastHandledUrlRef.current === url) {
        return;
      }

      lastHandledUrlRef.current = url;

      try {
        await completeOAuth(url);
      } catch {
        // Auth store captures and exposes the error state for the auth screen.
      }
    },
    [completeOAuth],
  );

  useEffect(() => {
    void initialize();
  }, [initialize]);

  useEffect(() => {
    void Linking.getInitialURL().then(handleOAuthLink);

    const subscription = Linking.addEventListener('url', ({ url }) => {
      void handleOAuthLink(url);
    });

    return () => {
      subscription.remove();
    };
  }, [handleOAuthLink]);

  useEffect(() => {
    if (!isInitialized) {
      return;
    }

    const bootstrapKey = user
      ? `${user.id}:${user.role}:${user.approvalStatus}:${user.batchId ?? 'none'}`
      : 'guest';

    if (lastBootstrapKeyRef.current === bootstrapKey) {
      return;
    }

    lastBootstrapKeyRef.current = bootstrapKey;
    void bootstrap(user);
  }, [bootstrap, isInitialized, user?.approvalStatus, user?.batchId, user?.id, user?.role]);

  useEffect(() => {
    if (!isInitialized || isBootstrapping || !user || user.role !== 'admin' || user.approvalStatus !== 'approved') {
      return;
    }

    const idleHandle = idleGlobal.requestIdleCallback?.(() => {
      void loadAdminData(user);
    });
    const fallbackTimer =
      idleHandle === undefined
        ? setTimeout(() => {
            void loadAdminData(user);
          }, 0)
        : undefined;

    return () => {
      if (idleHandle !== undefined) {
        idleGlobal.cancelIdleCallback?.(idleHandle);
      }
      if (fallbackTimer !== undefined) {
        clearTimeout(fallbackTimer);
      }
    };
  }, [isBootstrapping, isInitialized, loadAdminData, user]);

  const showPendingApproval = user?.role === 'admin' && user.approvalStatus !== 'approved';

  if (!isInitialized || (user && isBootstrapping)) {
    return <AnimatedSplashScreen />;
  }

  return (
    <NavigationContainer theme={navigationTheme} linking={linking}>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
          animation: Platform.OS === 'ios' ? 'slide_from_right' : 'fade_from_bottom',
        }}>
        {!user ? (
          <>
            <Stack.Screen name="Auth" component={AuthScreen} />
            <Stack.Screen name="ExamLink" component={ExamLinkScreen} />
          </>
        ) : showPendingApproval ? (
          <Stack.Screen name="PendingApproval" component={PendingApprovalScreen} />
        ) : (
          <>
            <Stack.Screen name="MainTabs" component={AppTabs} />
            <Stack.Screen name="ExamLink" component={ExamLinkScreen} />
            <Stack.Screen name="CreateBatch" component={CreateBatchScreen} />
            <Stack.Screen name="Batches" component={BatchesScreen} />
            <Stack.Screen name="Enquiry" component={EnquiryScreen} />
            <Stack.Screen name="Terms" component={TermsScreen} />
            <Stack.Screen name="Privacy" component={PrivacyPolicyScreen} />
            <Stack.Screen name="StudentInsights" component={StudentInsightsScreen} />
            <Stack.Screen name="TestIntro" component={TestIntroScreen} />
            <Stack.Screen name="TestAttempt" component={TestAttemptScreen} />
            <Stack.Screen name="TestResult" component={TestResultScreen} />
            <Stack.Screen name="ReviewAnswers" component={ReviewAnswersScreen} />
            <Stack.Screen name="AdminDashboard" component={AdminDashboardScreen} />
            <Stack.Screen name="CreateTest" component={CreateTestScreen} />
            <Stack.Screen name="QuestionBank" component={QuestionBankScreen} />
            <Stack.Screen name="QuestionSetQuestions" component={QuestionSetQuestionsScreen} />
            <Stack.Screen name="ManageTests" component={ManageTestsScreen} />
            <Stack.Screen name="ManageUsers" component={ManageUsersScreen} />
            <Stack.Screen name="ViewResults" component={ViewResultsScreen} />
            <Stack.Screen name="ScholarshipRegistrations" component={ScholarshipRegistrationsScreen} />
            <Stack.Screen name="BatchAccessRequests" component={BatchAccessRequestsScreen} />
            <Stack.Screen name="GeneralEnquiries" component={GeneralEnquiriesScreen} />
            <Stack.Screen name="ActivityLogs" component={ActivityLogsScreen} />
            <Stack.Screen name="AdminDiagnostics" component={AdminDiagnosticsScreen} />
            <Stack.Screen name="PdfNativeTestBuilder" component={PdfNativeTestBuilderScreen} />
            <Stack.Screen name="PdfNativeSetManagement" component={PdfNativeSetManagementScreen} />
            <Stack.Screen name="PdfNativeTestCreator" component={PdfNativeTestCreatorScreen} />
            <Stack.Screen name="PdfNativeTestManagement" component={PdfNativeTestManagementScreen} />
            <Stack.Screen name="PdfNativeResult" component={PdfNativeResultScreen} />
            <Stack.Screen name="PdfNativeReview" component={PdfNativeReviewScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
