import React from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { NearbyFriend } from '../../types/radar';
import { formatDistance } from '../../utils/haversine';

type Props = {
  friend: NearbyFriend;
  onPress: () => void;
};

// Consistent colour per username initial
const AVATAR_COLOURS = [
  '#E8D5C4', '#C4D9E8', '#D5C4E8', '#C4E8D5',
  '#E8C4C4', '#E8E4C4', '#C4E8E8', '#E8C4E0',
];

function avatarColour(username: string): string {
  let hash = 0;
  for (let i = 0; i < username.length; i++) hash = username.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLOURS[Math.abs(hash) % AVATAR_COLOURS.length];
}

export default function FriendNearbyCard({ friend, onPress }: Props) {
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.8}>
      <View style={styles.avatarWrapper}>
        {friend.avatarUrl ? (
          <Image source={{ uri: friend.avatarUrl }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: avatarColour(friend.username) }]}>
            <Text style={styles.avatarInitial}>
              {friend.username[0]?.toUpperCase() ?? '?'}
            </Text>
          </View>
        )}
        {/* Live indicator dot */}
        <View style={styles.liveDot} />
      </View>
      <Text style={styles.username} numberOfLines={1}>@{friend.username}</Text>
      <Text style={styles.distance}>{formatDistance(friend.distanceKm)}</Text>
    </TouchableOpacity>
  );
}

const AVATAR_SIZE = 60;

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    width: 88,
    gap: 5,
  },
  avatarWrapper: {
    position: 'relative',
  },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    borderWidth: 2,
    borderColor: '#fff',
  },
  avatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: 22,
    fontWeight: '600',
    color: '#5a4a3a',
  },
  liveDot: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#4CAF50',
    borderWidth: 2,
    borderColor: '#fafaf8',
  },
  username: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1a1a1a',
    textAlign: 'center',
    maxWidth: 84,
  },
  distance: {
    fontSize: 11,
    color: '#888',
    textAlign: 'center',
  },
});
