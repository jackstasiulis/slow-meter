import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';

export default function MapPlaceholderCard() {
  return (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.8}
      onPress={() => Alert.alert('Coming soon', 'The map view is on its way.')}
    >
      <Text style={styles.icon}>📍</Text>
      <View style={styles.textBlock}>
        <Text style={styles.title}>See everything on the map</Text>
        <Text style={styles.sub}>View events and friends near you</Text>
      </View>
      <Text style={styles.arrow}>›</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginBottom: 32,
    backgroundColor: '#f0efec',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  icon: {
    fontSize: 24,
  },
  textBlock: {
    flex: 1,
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 1,
  },
  sub: {
    fontSize: 12,
    color: '#888',
  },
  arrow: {
    fontSize: 22,
    color: '#bbb',
    fontWeight: '300',
  },
});
