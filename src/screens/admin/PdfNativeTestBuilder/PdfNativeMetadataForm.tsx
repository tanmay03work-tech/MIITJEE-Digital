import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Check, ShieldAlert, Award, FileQuestion, BookOpen, Layers } from 'lucide-react-native';
import {
  PdfNativeQuestion,
  QuestionReviewStatus,
  QuestionSubject,
  QuestionType,
} from '../../../services/pdf-native/pdfNativeTypes';
import { colors, spacing } from '../../../theme';

interface PdfNativeMetadataFormProps {
  question: PdfNativeQuestion;
  onSaveMetadata: (updatedQuestion: PdfNativeQuestion) => void;
}

const SUBJECT_OPTIONS: QuestionSubject[] = ['Physics', 'Chemistry', 'Mathematics', 'Biology', 'Other'];
const QUESTION_TYPE_OPTIONS: QuestionType[] = ['MCQ', 'Numerical', 'Assertion-Reason', 'Multiple Correct', 'Other'];
const MCQ_ANSWERS = ['A', 'B', 'C', 'D'];

export function PdfNativeMetadataForm({ question, onSaveMetadata }: PdfNativeMetadataFormProps) {
  const [subject, setSubject] = useState<QuestionSubject>(question.subject || 'Physics');
  const [chapter, setChapter] = useState<string>(question.chapter || '');
  const [topic, setTopic] = useState<string>(question.topic || '');
  const [qType, setQType] = useState<QuestionType>(question.question_type || 'MCQ');
  const [correctAnswer, setCorrectAnswer] = useState<string>(question.correct_answer || '');
  const [marks, setMarks] = useState<string>(String(question.marks ?? 4));
  const [negativeMarks, setNegativeMarks] = useState<string>(String(question.negative_marks ?? 1));
  const [status, setStatus] = useState<QuestionReviewStatus>(question.review_status || 'NEEDS_REVIEW');

  useEffect(() => {
    setSubject(question.subject || 'Physics');
    setChapter(question.chapter || '');
    setTopic(question.topic || '');
    setQType(question.question_type || 'MCQ');
    setCorrectAnswer(question.correct_answer || '');
    setMarks(String(question.marks ?? 4));
    setNegativeMarks(String(question.negative_marks ?? 1));
    setStatus(question.review_status || 'NEEDS_REVIEW');
  }, [question]);

  const handleSelectAnswer = (ans: string) => {
    const nextAns = correctAnswer === ans ? '' : ans;
    setCorrectAnswer(nextAns);

    // If answer is cleared, status must not remain APPROVED
    if (!nextAns && status === 'APPROVED') {
      setStatus('NEEDS_REVIEW');
    }
  };

  const handleSave = () => {
    let finalStatus = status;
    // Force NEEDS_REVIEW if correct answer is missing
    if (!correctAnswer.trim() && finalStatus === 'APPROVED') {
      finalStatus = 'NEEDS_REVIEW';
    }

    onSaveMetadata({
      ...question,
      subject,
      chapter: chapter.trim() || null,
      topic: topic.trim() || null,
      question_type: qType,
      correct_answer: correctAnswer.trim() || null,
      marks: Number(marks) || 4,
      negative_marks: Number(negativeMarks) || 1,
      review_status: finalStatus,
    });
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <FileQuestion size={18} color={colors.primary} />
        <Text style={styles.headerTitle}>Question Metadata (Q{question.question_number})</Text>
      </View>

      {/* Subject Selection */}
      <View style={styles.fieldGroup}>
        <Text style={styles.label}>Subject</Text>
        <View style={styles.chipRow}>
          {SUBJECT_OPTIONS.map((sub) => (
            <TouchableOpacity
              key={sub}
              style={[styles.chip, subject === sub && styles.activeChip]}
              onPress={() => setSubject(sub)}
            >
              <Text style={[styles.chipText, subject === sub && styles.activeChipText]}>{sub}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Chapter & Topic */}
      <View style={styles.rowTwo}>
        <View style={styles.fieldFlex}>
          <Text style={styles.label}>Chapter (Optional)</Text>
          <TextInput
            style={styles.textInput}
            value={chapter}
            onChangeText={setChapter}
            placeholder="e.g. Kinematics"
          />
        </View>
        <View style={styles.fieldFlex}>
          <Text style={styles.label}>Topic (Optional)</Text>
          <TextInput
            style={styles.textInput}
            value={topic}
            onChangeText={setTopic}
            placeholder="e.g. Projectile Motion"
          />
        </View>
      </View>

      {/* Question Type */}
      <View style={styles.fieldGroup}>
        <Text style={styles.label}>Question Type</Text>
        <View style={styles.chipRow}>
          {QUESTION_TYPE_OPTIONS.map((type) => (
            <TouchableOpacity
              key={type}
              style={[styles.chip, qType === type && styles.activeChip]}
              onPress={() => setQType(type)}
            >
              <Text style={[styles.chipText, qType === type && styles.activeChipText]}>{type}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Answer Key Assignment */}
      <View style={styles.fieldGroup}>
        <Text style={styles.label}>Correct Answer</Text>
        {qType === 'MCQ' || qType === 'Assertion-Reason' || qType === 'Multiple Correct' ? (
          <View style={styles.answerRow}>
            {MCQ_ANSWERS.map((opt) => {
              const isSelected = correctAnswer.includes(opt);
              return (
                <TouchableOpacity
                  key={opt}
                  style={[styles.answerBtn, isSelected && styles.answerBtnSelected]}
                  onPress={() => handleSelectAnswer(opt)}
                >
                  <Text style={[styles.answerBtnText, isSelected && styles.answerBtnTextSelected]}>
                    {opt}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ) : (
          <TextInput
            style={styles.textInput}
            value={correctAnswer}
            onChangeText={(val) => {
              setCorrectAnswer(val);
              if (!val && status === 'APPROVED') setStatus('NEEDS_REVIEW');
            }}
            placeholder="Enter numerical answer value"
          />
        )}
        {!correctAnswer ? (
          <Text style={styles.warningHint}>
            ⚠ No correct answer set. Status will be kept as NEEDS_REVIEW.
          </Text>
        ) : null}
      </View>

      {/* Marks & Negative Marks */}
      <View style={styles.rowTwo}>
        <View style={styles.fieldFlex}>
          <Text style={styles.label}>Marks (+)</Text>
          <TextInput
            style={styles.textInput}
            keyboardType="numeric"
            value={marks}
            onChangeText={setMarks}
          />
        </View>
        <View style={styles.fieldFlex}>
          <Text style={styles.label}>Negative Marks (-)</Text>
          <TextInput
            style={styles.textInput}
            keyboardType="numeric"
            value={negativeMarks}
            onChangeText={setNegativeMarks}
          />
        </View>
      </View>

      {/* Review Status Selector */}
      <View style={styles.fieldGroup}>
        <Text style={styles.label}>Review Status</Text>
        <View style={styles.chipRow}>
          {(['NEEDS_REVIEW', 'APPROVED', 'DRAFT', 'REJECTED'] as QuestionReviewStatus[]).map((st) => {
            const isActive = status === st;
            let activeBg = colors.primary;
            if (st === 'APPROVED') activeBg = '#15803D';
            if (st === 'NEEDS_REVIEW') activeBg = '#B45309';
            if (st === 'REJECTED') activeBg = '#B91C1C';

            return (
              <TouchableOpacity
                key={st}
                style={[styles.chip, isActive && { backgroundColor: activeBg, borderColor: activeBg }]}
                onPress={() => {
                  if (st === 'APPROVED' && !correctAnswer.trim()) {
                    alert('Please select or enter the correct answer key before marking as APPROVED.');
                    return;
                  }
                  setStatus(st);
                }}
              >
                <Text style={[styles.chipText, isActive && styles.activeChipText]}>{st}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Save Button */}
      <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
        <Check size={16} color="#FFFFFF" />
        <Text style={styles.saveBtnText}>Save Metadata for Q{question.question_number}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: spacing.md,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border || '#E2E8F0',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingBottom: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.text,
  },
  fieldGroup: {
    gap: 6,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#F8FAFC',
  },
  activeChip: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text,
  },
  activeChipText: {
    color: '#FFFFFF',
  },
  rowTwo: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  fieldFlex: {
    flex: 1,
    gap: 4,
  },
  textInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 13,
    color: colors.text,
  },
  answerRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  answerBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 2,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  answerBtnSelected: {
    borderColor: '#15803D',
    backgroundColor: '#DCFCE7',
  },
  answerBtnText: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.text,
  },
  answerBtnTextSelected: {
    color: '#15803D',
  },
  warningHint: {
    fontSize: 11,
    color: '#B45309',
    fontStyle: 'italic',
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.primary,
    paddingVertical: 10,
    borderRadius: 8,
    marginTop: 4,
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
});
