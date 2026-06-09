import { ScholarshipAdmissionClass, ScholarshipTargetExam } from '../types';

export const scholarshipAdmissionOptions: ScholarshipAdmissionClass[] = ['8th', '9th', '10th', 'jee', 'neet'];
export const scholarshipTargetOptions: ScholarshipTargetExam[] = ['boards', 'jee', 'neet'];

export const scholarshipAdmissionLabels: Record<ScholarshipAdmissionClass, string> = {
  '8th': 'Class 8',
  '9th': 'Class 9',
  '10th': 'Class 10',
  jee: 'JEE Admission',
  neet: 'NEET Admission',
};

export const scholarshipTargetLabels: Record<ScholarshipTargetExam, string> = {
  boards: 'Boards',
  jee: 'JEE',
  neet: 'NEET',
};
