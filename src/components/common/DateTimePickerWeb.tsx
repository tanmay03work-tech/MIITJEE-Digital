import React from 'react';
import { View, StyleSheet } from 'react-native';

export interface DateTimePickerProps {
  value: Date;
  onChange?: (event: { type: string; nativeEvent?: { timestamp?: number } }, date?: Date) => void;
  mode?: 'date' | 'time' | 'datetime';
}

export function DateTimePicker({ value, onChange, mode = 'date' }: DateTimePickerProps) {
  const safeDate = value instanceof Date && !Number.isNaN(value.getTime()) ? value : new Date();

  const formattedDate = `${safeDate.getFullYear()}-${String(safeDate.getMonth() + 1).padStart(2, '0')}-${String(safeDate.getDate()).padStart(2, '0')}`;
  const formattedTime = `${String(safeDate.getHours()).padStart(2, '0')}:${String(safeDate.getMinutes()).padStart(2, '0')}`;
  const formattedValue = mode === 'time' ? formattedTime : formattedDate;

  return (
    <View style={styles.container}>
      <input
        type={mode === 'time' ? 'time' : 'date'}
        value={formattedValue}
        onChange={(e) => {
          if (!onChange || !e.target.value) return;
          const nextDate = new Date(safeDate.getTime());
          if (mode === 'time') {
            const [hours, minutes] = e.target.value.split(':').map(Number);
            if (!Number.isNaN(hours ?? NaN) && !Number.isNaN(minutes ?? NaN)) {
              nextDate.setHours(hours!, minutes!, 0, 0);
            }
          } else {
            const [year, month, day] = e.target.value.split('-').map(Number);
            if (!Number.isNaN(year ?? NaN) && !Number.isNaN(month ?? NaN) && !Number.isNaN(day ?? NaN)) {
              nextDate.setFullYear(year!, month! - 1, day!);
            }
          }
          onChange({ type: 'set', nativeEvent: { timestamp: nextDate.getTime() } }, nextDate);
        }}
        onClick={(e) => {
          try {
            (e.target as HTMLInputElement).showPicker?.();
          } catch {}
        }}
        style={{
          padding: '8px 12px',
          borderRadius: '8px',
          border: '1px solid #E7ECF3',
          fontSize: '14px',
          fontFamily: 'system-ui, sans-serif',
          color: '#162033',
          background: '#FFFFFF',
          cursor: 'pointer',
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 4,
  },
});

export default DateTimePicker;
