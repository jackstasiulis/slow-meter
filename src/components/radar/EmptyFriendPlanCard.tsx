import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

type Props = {
  onPress?: () => void;
};

export default function EmptyFriendPlanCard({ onPress }: Props) {
  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      activeOpacity={onPress ? 0.7 : 1}
    >
      <Text style={styles.emoji}>📅</Text>
      <Text style={styles.title}>Nothing{'\n'}yet</Text>
      <View style={styles.spacer} />
      <Text style={styles.hint}>Propose to a{'\n'}group below ↓</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 130,
    minHeight: 190,
    backgroundColor: '#f7f6f3',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1.5,
    borderColor: '#ebe9e4',
    borderStyle: 'dashed',
  },
  emoji: {
    fontSize: 22,
    marginBottom: 8,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: '#ccc',
    lineHeight: 20,
  },
  spacer: {
    flex: 1,
    minHeight: 12,
  },
  hint: {
    fontSize: 11,
    color: '#bbb',
    lineHeight: 15,
  },
});
