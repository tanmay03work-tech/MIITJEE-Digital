import { NavigatorScreenParams } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';

export type MainTabParamList = {
  Home: undefined;
  Tests: undefined;
  Leaderboard: undefined;
  Profile: undefined;
};

export type RootStackParamList = {
  Auth: undefined;
  PendingApproval: undefined;
  MainTabs: NavigatorScreenParams<MainTabParamList> | undefined;
  CreateBatch: undefined;
  Batches: undefined;
  Enquiry: undefined;
  Terms: undefined;
  Privacy: undefined;
  StudentInsights: undefined;
  ExamLink: { shareCode: string };
  TestIntro: { testId: string };
  TestAttempt: { testId: string; studentName?: string };
  TestResult: { testId: string; resultId: string };
  ReviewAnswers: { testId: string; resultId: string };
  AdminDashboard: undefined;
  CreateTest: undefined;
  QuestionBank: { mode?: 'manage' | 'picker' } | undefined;
  QuestionSetQuestions: { setId: number; setName: string; mode?: 'manage' | 'picker' };
  ManageTests: undefined;
  ManageUsers: undefined;
  ViewResults: undefined;
  ScholarshipRegistrations: undefined;
  BatchAccessRequests: undefined;
  GeneralEnquiries: undefined;
  ActivityLogs: undefined;
  AdminDiagnostics: undefined;
  PdfNativeTestBuilder: undefined;
  PdfNativeSetManagement: { setId?: string } | undefined;
  PdfNativeTestCreator: { testId?: string; setId?: string } | undefined;
  PdfNativeTestManagement: undefined;
  PdfNativeResult: { attemptId: string; testId?: string };
  PdfNativeReview: { attemptId: string; testId?: string };
};

export type RootStackScreenProps<RouteName extends keyof RootStackParamList> =
  NativeStackScreenProps<RootStackParamList, RouteName>;

export type MainTabScreenProps<RouteName extends keyof MainTabParamList> = BottomTabScreenProps<
  MainTabParamList,
  RouteName
>;
