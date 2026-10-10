import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing } from '../../theme';
import { FormattedExamText } from '../common/FormattedExamText';
import { formatExamTextForDisplay } from '../../utils/examText';
import { DiagramHolder } from './DiagramHolder';

interface QuestionBodyRendererProps {
  prompt: string;
  imageUrl?: string | null;
}

interface MatchQuestionData {
  intro: string;
  list1Title: string;
  list2Title: string;
  list1Items: string[];
  list2Items: string[];
  outro: string;
}

function parseMatchQuestion(text: string): MatchQuestionData | null {
  if (!/Match\s+List[- ]?I\s+with\s+List[- ]?II/i.test(text)) {
    return null;
  }

  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  let intro = '';
  let outro = '';
  let list1Title = 'List-I';
  let list2Title = 'List-II';
  const list1Items: string[] = [];
  const list2Items: string[] = [];

  let state: 'intro' | 'in_list_headers' | 'items' | 'outro' = 'intro';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;

    if (state === 'intro') {
      if (/^List[- ]?I\b/i.test(line)) {
        list1Title = line;
        state = 'in_list_headers';
      } else {
        intro += (intro ? '\n' : '') + line;
      }
    } else if (state === 'in_list_headers') {
      if (/^List[- ]?II\b/i.test(line)) {
        list2Title = line;
        state = 'items';
      } else if (/^[A-D]\.\s*/.test(line)) {
        state = 'items';
        i--; // re-process as item
      }
    } else if (state === 'items') {
      if (/^(Choose|In the light|Select)\b/i.test(line)) {
        outro += (outro ? '\n' : '') + line;
        state = 'outro';
      } else if (/^[A-D]\.\s*(.*)/.test(line)) {
        list1Items.push(line);
      } else if (/^(I|II|III|IV|V)\.\s*(.*)/.test(line)) {
        list2Items.push(line);
      } else {
        if (list2Items.length > 0) {
          outro += (outro ? '\n' : '') + line;
          state = 'outro';
        }
      }
    } else if (state === 'outro') {
      outro += (outro ? '\n' : '') + line;
    }
  }

  if (list1Items.length === 0 || list2Items.length === 0) {
    return null;
  }

  return { intro, list1Title, list2Title, list1Items, list2Items, outro };
}

interface StatementQuestionData {
  leadIn: string;
  statement1: string;
  statement2: string;
  outro: string;
}

function parseStatementQuestion(text: string): StatementQuestionData | null {
  if (!/Statement\s*(?:I|\(I\)|1):/i.test(text) || !/Statement\s*(?:II|\(II\)|2):/i.test(text)) {
    return null;
  }

  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  let leadIn = '';
  let statement1 = '';
  let statement2 = '';
  let outro = '';

  let currentTarget: 'leadIn' | 's1' | 's2' | 'outro' = 'leadIn';

  for (const line of lines) {
    if (/^Statement\s*(?:I|\(I\)|1):/i.test(line)) {
      currentTarget = 's1';
      statement1 = line;
    } else if (/^Statement\s*(?:II|\(II\)|2):/i.test(line)) {
      currentTarget = 's2';
      statement2 = line;
    } else if (/^(In the light|Choose|Select)\b/i.test(line)) {
      currentTarget = 'outro';
      outro += (outro ? '\n' : '') + line;
    } else {
      if (currentTarget === 'leadIn') {
        leadIn += (leadIn ? '\n' : '') + line;
      } else if (currentTarget === 's1') {
        statement1 += ' ' + line;
      } else if (currentTarget === 's2') {
        statement2 += ' ' + line;
      } else {
        outro += (outro ? '\n' : '') + line;
      }
    }
  }

  if (!statement1 || !statement2) {
    return null;
  }

  return { leadIn, statement1, statement2, outro };
}

export function QuestionBodyRenderer({ prompt, imageUrl }: QuestionBodyRendererProps) {
  const matchData = useMemo(() => parseMatchQuestion(prompt), [prompt]);
  const statementData = useMemo(() => (!matchData ? parseStatementQuestion(prompt) : null), [prompt, matchData]);

  // Case 1: Match the Following Question
  if (matchData) {
    const rowCount = Math.max(matchData.list1Items.length, matchData.list2Items.length);
    const rows = Array.from({ length: rowCount }, (_, i) => ({
      item1: matchData.list1Items[i] || '',
      item2: matchData.list2Items[i] || '',
    }));

    return (
      <View style={styles.container}>
        {matchData.intro ? (
          <FormattedExamText style={styles.mainPromptText} text={matchData.intro} />
        ) : null}

        {imageUrl ? <DiagramHolder imageUrl={imageUrl} /> : null}

        {/* Two-Column Match Table */}
        <View style={styles.matchCard}>
          {/* Table Headers */}
          <View style={styles.matchHeaderRow}>
            <View style={[styles.matchHeaderCol, styles.colLeft]}>
              <View style={styles.listBadge1}>
                <Text style={styles.listBadgeText1}>COLUMN 1</Text>
              </View>
              <FormattedExamText style={styles.matchHeaderTitle} text={matchData.list1Title} />
            </View>
            <View style={styles.verticalDivider} />
            <View style={[styles.matchHeaderCol, styles.colRight]}>
              <View style={styles.listBadge2}>
                <Text style={styles.listBadgeText2}>COLUMN 2</Text>
              </View>
              <FormattedExamText style={styles.matchHeaderTitle} text={matchData.list2Title} />
            </View>
          </View>

          {/* Table Rows */}
          {rows.map((row, idx) => (
            <View
              key={`match_row_${idx}`}
              style={[
                styles.matchRow,
                idx % 2 === 1 && styles.matchRowAlt,
                idx === rows.length - 1 && styles.matchRowLast,
              ]}
            >
              <View style={[styles.matchCol, styles.colLeft]}>
                <FormattedExamText style={styles.matchItemText} text={row.item1} />
              </View>
              <View style={styles.verticalDivider} />
              <View style={[styles.matchCol, styles.colRight]}>
                <FormattedExamText style={styles.matchItemText} text={row.item2} />
              </View>
            </View>
          ))}
        </View>

        {matchData.outro ? (
          <FormattedExamText style={styles.outroText} text={matchData.outro} />
        ) : null}
      </View>
    );
  }

  // Case 2: Statement I & II Question (with Diagram supported between statements if present)
  if (statementData) {
    return (
      <View style={styles.container}>
        {statementData.leadIn ? (
          <FormattedExamText style={styles.mainPromptText} text={statementData.leadIn} />
        ) : null}

        <View style={styles.statementCard}>
          <View style={styles.statementBadge}>
            <Text style={styles.statementBadgeText}>STATEMENT 1</Text>
          </View>
          <FormattedExamText style={styles.statementText} text={statementData.statement1} />
        </View>

        {imageUrl ? <DiagramHolder imageUrl={imageUrl} /> : null}

        <View style={styles.statementCard}>
          <View style={styles.statementBadge}>
            <Text style={styles.statementBadgeText}>STATEMENT 2</Text>
          </View>
          <FormattedExamText style={styles.statementText} text={statementData.statement2} />
        </View>

        {statementData.outro ? (
          <FormattedExamText style={styles.outroText} text={statementData.outro} />
        ) : null}
      </View>
    );
  }

  // Case 3: Standard Question Text + Diagram Holder
  return (
    <View style={styles.container}>
      <FormattedExamText style={styles.mainPromptText} text={prompt} />
      {imageUrl ? <DiagramHolder imageUrl={imageUrl} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    gap: spacing.md,
  },
  mainPromptText: {
    color: colors.text,
    fontSize: 18,
    lineHeight: 27,
    fontWeight: '700',
  },
  outroText: {
    color: colors.text,
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '600',
    marginTop: spacing.xs,
  },
  /* Match Table Styles */
  matchCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    overflow: 'hidden',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
    marginVertical: spacing.xs,
  },
  matchHeaderRow: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 1,
    borderBottomColor: '#CBD5E1',
  },
  matchHeaderCol: {
    flex: 1,
    padding: spacing.md,
    gap: 4,
  },
  colLeft: {
    paddingRight: spacing.sm,
  },
  colRight: {
    paddingLeft: spacing.sm,
  },
  verticalDivider: {
    width: 1,
    backgroundColor: '#CBD5E1',
  },
  listBadge1: {
    alignSelf: 'flex-start',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  listBadgeText1: {
    fontSize: 10,
    fontWeight: '800',
    color: '#1D4ED8',
  },
  listBadge2: {
    alignSelf: 'flex-start',
    backgroundColor: '#FAF5FF',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: '#E9D5FF',
  },
  listBadgeText2: {
    fontSize: 10,
    fontWeight: '800',
    color: '#7E22CE',
  },
  matchHeaderTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.text,
    marginTop: 2,
  },
  matchRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
  },
  matchRowAlt: {
    backgroundColor: '#F8FAFC',
  },
  matchRowLast: {
    borderBottomWidth: 0,
  },
  matchCol: {
    flex: 1,
    padding: spacing.md,
    justifyContent: 'center',
  },
  matchItemText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
    lineHeight: 22,
  },
  /* Statement Card Styles */
  statementCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: spacing.md,
    gap: spacing.xs,
  },
  statementBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  statementBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#4338CA',
  },
  statementText: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '600',
    color: colors.text,
  },
});
