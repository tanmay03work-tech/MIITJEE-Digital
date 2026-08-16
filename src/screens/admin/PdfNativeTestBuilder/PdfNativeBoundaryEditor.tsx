import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Check, Sliders, Plus, Trash2, ArrowUp, ArrowDown, Layers, SplitSquareVertical } from 'lucide-react-native';
import { PdfNativeBBox, PdfNativeQuestion, PdfNativeRegion, QuestionReviewStatus, RegionRole } from '../../../services/pdf-native/pdfNativeTypes';
import { colors, radius, spacing } from '../../../theme';

interface PdfNativeBoundaryEditorProps {
  question: PdfNativeQuestion;
  onUpdateQuestion: (updatedQuestion: PdfNativeQuestion) => void;
}

export function PdfNativeBoundaryEditor({ question, onUpdateQuestion }: PdfNativeBoundaryEditorProps) {
  const [regions, setRegions] = useState<PdfNativeRegion[]>(() => {
    if (question.regions && question.regions.length > 0) {
      return question.regions;
    }
    return [
      {
        id: `${question.id}_reg0`,
        pageNumber: question.page_start || 1,
        bbox: { ...question.bbox },
        role: 'stem',
        orderIndex: 0,
        label: 'Region 1 (Stem)',
      },
    ];
  });

  const [activeRegionIndex, setActiveRegionIndex] = useState<number>(0);
  const [status, setStatus] = useState<QuestionReviewStatus>(question.review_status);

  useEffect(() => {
    if (question.regions && question.regions.length > 0) {
      setRegions(question.regions);
    } else {
      setRegions([
        {
          id: `${question.id}_reg0`,
          pageNumber: question.page_start || 1,
          bbox: { ...question.bbox },
          role: 'stem',
          orderIndex: 0,
          label: 'Region 1 (Stem)',
        },
      ]);
    }
    setActiveRegionIndex(0);
    setStatus(question.review_status);
  }, [question]);

  const activeRegion = regions[activeRegionIndex] || regions[0]!;

  const handleSave = () => {
    const primaryBbox = regions[0]?.bbox || question.bbox;
    const pageStart = regions[0]?.pageNumber || question.page_start || 1;
    const pageEnd = regions.reduce((max, r) => Math.max(max, r.pageNumber), pageStart);

    onUpdateQuestion({
      ...question,
      bbox: primaryBbox,
      page_start: pageStart,
      page_end: pageEnd,
      regions: regions.map((r, i) => ({ ...r, orderIndex: i })),
      review_status: status,
    });
  };

  const adjustCoord = (key: keyof PdfNativeBBox, delta: number) => {
    setRegions((prev) => {
      const copy = [...prev];
      const target = copy[activeRegionIndex];
      if (target) {
        copy[activeRegionIndex] = {
          ...target,
          bbox: {
            ...target.bbox,
            [key]: Math.max(0, Math.round(target.bbox[key] + delta)),
          },
        };
      }
      return copy;
    });
  };

  const handleAddRegion = () => {
    const newIdx = regions.length;
    const lastReg = regions[regions.length - 1]!;
    const newRegion: PdfNativeRegion = {
      id: `${question.id}_reg${Date.now()}`,
      pageNumber: lastReg.pageNumber,
      bbox: {
        x: Math.round(lastReg.bbox.x + 10),
        y: Math.round(lastReg.bbox.y + 20),
        width: lastReg.bbox.width,
        height: Math.min(120, lastReg.bbox.height),
      },
      role: 'options',
      orderIndex: newIdx,
      label: `Region ${newIdx + 1} (Options)`,
    };

    const updated = [...regions, newRegion];
    setRegions(updated);
    setActiveRegionIndex(newIdx);
  };

  const handleRemoveRegion = (indexToRemove: number) => {
    if (regions.length <= 1) return;
    const filtered = regions.filter((_, idx) => idx !== indexToRemove).map((r, i) => ({ ...r, orderIndex: i }));
    setRegions(filtered);
    setActiveRegionIndex(Math.max(0, indexToRemove - 1));
  };

  const handleMoveRegion = (index: number, direction: 'up' | 'down') => {
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= regions.length) return;

    const copy = [...regions];
    const [moved] = copy.splice(index, 1);
    if (moved) {
      copy.splice(targetIdx, 0, moved);
      const reindexed = copy.map((r, i) => ({ ...r, orderIndex: i }));
      setRegions(reindexed);
      setActiveRegionIndex(targetIdx);
    }
  };

  const handleRoleChange = (role: RegionRole) => {
    setRegions((prev) => {
      const copy = [...prev];
      const target = copy[activeRegionIndex];
      if (target) {
        copy[activeRegionIndex] = {
          ...target,
          role,
          label: `Region ${activeRegionIndex + 1} (${role.toUpperCase()})`,
        };
      }
      return copy;
    });
  };

  const handlePageChange = (page: number) => {
    setRegions((prev) => {
      const copy = [...prev];
      const target = copy[activeRegionIndex];
      if (target) {
        copy[activeRegionIndex] = {
          ...target,
          pageNumber: Math.max(1, page),
        };
      }
      return copy;
    });
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTitleRow}>
          <Sliders size={16} color={colors.primary} />
          <Text style={styles.headerTitle}>Faculty Boundary & Composition Editor (Q{question.question_number})</Text>
        </View>
        <TouchableOpacity style={styles.addRegionBtn} onPress={handleAddRegion}>
          <Plus size={14} color="#FFFFFF" />
          <Text style={styles.addRegionBtnText}>Add Region</Text>
        </TouchableOpacity>
      </View>

      {/* Region Tabs / List */}
      <View style={styles.regionTabsContainer}>
        <Text style={styles.sectionSubtitle}>Question PDF Regions ({regions.length}):</Text>
        <View style={styles.regionTabsRow}>
          {regions.map((reg, idx) => {
            const isActive = idx === activeRegionIndex;
            return (
              <View key={reg.id} style={[styles.regionChip, isActive && styles.regionChipActive]}>
                <TouchableOpacity
                  style={styles.regionChipClickable}
                  onPress={() => setActiveRegionIndex(idx)}
                >
                  <Layers size={13} color={isActive ? colors.primary : colors.textMuted} />
                  <Text style={[styles.regionChipText, isActive && styles.regionChipTextActive]}>
                    #{idx + 1} P{reg.pageNumber} ({reg.role || 'stem'})
                  </Text>
                </TouchableOpacity>

                {regions.length > 1 ? (
                  <View style={styles.regionActionIcons}>
                    {idx > 0 ? (
                      <TouchableOpacity onPress={() => handleMoveRegion(idx, 'up')} style={styles.miniIconBtn}>
                        <ArrowUp size={11} color={colors.textMuted} />
                      </TouchableOpacity>
                    ) : null}
                    {idx < regions.length - 1 ? (
                      <TouchableOpacity onPress={() => handleMoveRegion(idx, 'down')} style={styles.miniIconBtn}>
                        <ArrowDown size={11} color={colors.textMuted} />
                      </TouchableOpacity>
                    ) : null}
                    <TouchableOpacity onPress={() => handleRemoveRegion(idx)} style={styles.miniIconBtnDanger}>
                      <Trash2 size={11} color={colors.danger} />
                    </TouchableOpacity>
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      </View>

      {/* Active Region Configuration */}
      <View style={styles.activeRegionMetaRow}>
        <View style={styles.metaCol}>
          <Text style={styles.label}>Region Role</Text>
          <View style={styles.roleBtnRow}>
            {(['stem', 'options', 'continuation', 'diagram'] as RegionRole[]).map((r) => (
              <TouchableOpacity
                key={r}
                style={[styles.roleBtn, activeRegion.role === r && styles.roleBtnActive]}
                onPress={() => handleRoleChange(r)}
              >
                <Text style={[styles.roleBtnText, activeRegion.role === r && styles.roleBtnTextActive]}>
                  {r.toUpperCase()}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.metaPageCol}>
          <Text style={styles.label}>Page</Text>
          <TextInput
            style={styles.inputPage}
            keyboardType="numeric"
            value={String(activeRegion.pageNumber)}
            onChangeText={(val) => handlePageChange(Number(val) || 1)}
          />
        </View>
      </View>

      {/* Coordinate Adjustment Inputs */}
      <View style={styles.controlsRow}>
        <View style={styles.inputField}>
          <Text style={styles.label}>X (pt)</Text>
          <TextInput
            style={styles.input}
            keyboardType="numeric"
            value={String(activeRegion.bbox.x)}
            onChangeText={(val) =>
              setRegions((prev) => {
                const c = [...prev];
                if (c[activeRegionIndex]) {
                  c[activeRegionIndex]!.bbox.x = Number(val) || 0;
                }
                return c;
              })
            }
          />
          <View style={styles.stepButtons}>
            <TouchableOpacity style={styles.stepBtn} onPress={() => adjustCoord('x', -5)}>
              <Text style={styles.stepBtnText}>-5</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.stepBtn} onPress={() => adjustCoord('x', 5)}>
              <Text style={styles.stepBtnText}>+5</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.inputField}>
          <Text style={styles.label}>Y (pt)</Text>
          <TextInput
            style={styles.input}
            keyboardType="numeric"
            value={String(activeRegion.bbox.y)}
            onChangeText={(val) =>
              setRegions((prev) => {
                const c = [...prev];
                if (c[activeRegionIndex]) {
                  c[activeRegionIndex]!.bbox.y = Number(val) || 0;
                }
                return c;
              })
            }
          />
          <View style={styles.stepButtons}>
            <TouchableOpacity style={styles.stepBtn} onPress={() => adjustCoord('y', -5)}>
              <Text style={styles.stepBtnText}>-5</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.stepBtn} onPress={() => adjustCoord('y', 5)}>
              <Text style={styles.stepBtnText}>+5</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.inputField}>
          <Text style={styles.label}>Width (pt)</Text>
          <TextInput
            style={styles.input}
            keyboardType="numeric"
            value={String(activeRegion.bbox.width)}
            onChangeText={(val) =>
              setRegions((prev) => {
                const c = [...prev];
                if (c[activeRegionIndex]) {
                  c[activeRegionIndex]!.bbox.width = Number(val) || 0;
                }
                return c;
              })
            }
          />
          <View style={styles.stepButtons}>
            <TouchableOpacity style={styles.stepBtn} onPress={() => adjustCoord('width', -10)}>
              <Text style={styles.stepBtnText}>-10</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.stepBtn} onPress={() => adjustCoord('width', 10)}>
              <Text style={styles.stepBtnText}>+10</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.inputField}>
          <Text style={styles.label}>Height (pt)</Text>
          <TextInput
            style={styles.input}
            keyboardType="numeric"
            value={String(activeRegion.bbox.height)}
            onChangeText={(val) =>
              setRegions((prev) => {
                const c = [...prev];
                if (c[activeRegionIndex]) {
                  c[activeRegionIndex]!.bbox.height = Number(val) || 0;
                }
                return c;
              })
            }
          />
          <View style={styles.stepButtons}>
            <TouchableOpacity style={styles.stepBtn} onPress={() => adjustCoord('height', -10)}>
              <Text style={styles.stepBtnText}>-10</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.stepBtn} onPress={() => adjustCoord('height', 10)}>
              <Text style={styles.stepBtnText}>+10</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <View style={styles.actionRow}>
        <TouchableOpacity
          style={[styles.statusToggle, status === 'APPROVED' ? styles.statusApproved : styles.statusReview]}
          onPress={() => setStatus((prev) => (prev === 'APPROVED' ? 'NEEDS_REVIEW' : 'APPROVED'))}
        >
          <Text style={styles.statusToggleText}>
            Status: {status} (Click to toggle)
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
          <Check size={16} color="#FFFFFF" />
          <Text style={styles.saveBtnText}>Save Composition</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: spacing.md,
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.xs,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  headerTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  addRegionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primary,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  addRegionBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  regionTabsContainer: {
    gap: 6,
  },
  sectionSubtitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
  },
  regionTabsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  regionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.md,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  regionChipActive: {
    backgroundColor: '#EEF2FF',
    borderColor: colors.primary,
  },
  regionChipClickable: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  regionChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
  },
  regionChipTextActive: {
    color: colors.primary,
  },
  regionActionIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginLeft: 4,
  },
  miniIconBtn: {
    padding: 2,
  },
  miniIconBtnDanger: {
    padding: 2,
    marginLeft: 2,
  },
  activeRegionMetaRow: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'flex-start',
  },
  metaCol: {
    flex: 1,
    gap: 4,
  },
  metaPageCol: {
    width: 70,
    gap: 4,
  },
  roleBtnRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  roleBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: '#E2E8F0',
  },
  roleBtnActive: {
    backgroundColor: colors.primary,
  },
  roleBtnText: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.textMuted,
  },
  roleBtnTextActive: {
    color: '#FFFFFF',
  },
  inputPage: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontSize: 12,
    color: colors.text,
    textAlign: 'center',
    fontFamily: 'monospace',
  },
  controlsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  inputField: {
    flex: 1,
    minWidth: 90,
    gap: 4,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontSize: 13,
    color: colors.text,
    fontFamily: 'monospace',
  },
  stepButtons: {
    flexDirection: 'row',
    gap: 4,
    marginTop: 2,
  },
  stepBtn: {
    flex: 1,
    backgroundColor: '#E2E8F0',
    paddingVertical: 2,
    alignItems: 'center',
    borderRadius: 4,
  },
  stepBtnText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.text,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginTop: 4,
  },
  statusToggle: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
  },
  statusApproved: {
    backgroundColor: '#DCFCE7',
  },
  statusReview: {
    backgroundColor: '#FEF3C7',
  },
  statusToggleText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.text,
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
});
