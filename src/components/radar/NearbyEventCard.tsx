import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { NearbyEvent } from '../../types/radar';
import { formatDistance } from '../../utils/haversine';

type Props = {
  event: NearbyEvent;
};

export default function NearbyEventCard({ event }: Props) {
  return (
    <View style={styles.chip}>
      <Text style={styles.title} numberOfLines={1}>{event.title}</Text>
      <Text style={styles.sep}>·</Text>
      <Text style={styles.distance}>{formatDistance(event.distanceKm)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0efec',
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 5,
  },
  title: {
    fontSize: 13,
    fontWeight: '500',
    color: '#444',
    maxWidth: 140,
  },
  sep: {
    fontSize: 13,
    color: '#ccc',
  },
  distance: {
    fontSize: 12,
    color: '#aaa',
    fontWeight: '500',
  },
});
