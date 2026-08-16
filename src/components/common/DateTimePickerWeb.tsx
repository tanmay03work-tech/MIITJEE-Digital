import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export interface DateTimePickerProps {
  value: Date;
  onChange?: (event: unknown, date?: Date) => void;
  mode?: 'date' | 'time' | 'datetime';
}

export function DateTimePicker({ value, onChange, mode = 'date' }: DateTimePickerProps) {
  const formattedValue = value ? value.toISOString().split('T')[0] : '';

  return (
    <View style={styles.container}>
      <input
        type={mode === 'time' ? 'time' : 'date'}
        value={formattedValue}
        onChange={(e) => {
          if (onChange && e.target.value) {
            onChange(e, new Date(e.target.value));
          }
        }}
        style={{
          padding: '8px 12px',
          borderRadius: '8px',
          border: '1px solid #E7ECF3',
          fontSize: '14px',
          fontFamily: 'system-ui, sans-serif'
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 4,
  }
});

export default DateTimePicker;
