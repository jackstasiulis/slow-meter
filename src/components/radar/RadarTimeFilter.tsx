import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { TimeFilter } from '../../types/radar';

const FILTERS: { key: TimeFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'now', label: 'Now' },
  { key: 'tonight', label: 'Tonight' },
  { key: 'weekend', label: 'Weekend' },
];

type Props = {
  activeFilter: TimeFilter;
  onFilterChange: (filter: TimeFilter) => void;
};

export default function RadarTimeFilter({ activeFilter, onFilterChange }: Props) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.row}
      style={styles.container}
    >
      {FILTERS.map((f) => {
        const isActive = activeFilter === f.key;
        return (
          <TouchableOpacity
            key={f.key}
            style={[styles.pill, isActive && styles.pillActive]}
            onPress={() => onFilterChange(f.key)}
            activeOpacity={0.7}
          >
            <Text style={[styles.pillText, isActive && styles.pillTextActive]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 0,
  },
  row: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  pill: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#f0efec',
  },
  pillActive: {
    backgroundColor: '#1a1a1a',
  },
  pillText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
  },
  pillTextActive: {
    color: '#fff',
  },
});
