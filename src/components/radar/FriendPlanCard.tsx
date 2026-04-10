import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { ScoredFriendEvent } from '../../types/radar';
import { formatDistance } from '../../utils/haversine';

const CARD_WIDTH = 160;

type Props = {
  event: ScoredFriendEvent;
  myId: string | null;
  onPress: () => void;
};

function Avatar({ uri, username }: { uri: string | null; username: string }) {
  const colors = ['#c8e6c9', '#bbdefb', '#f8bbd9', '#fff9c4', '#e1bee7', '#ffe0b2'];
  const idx = username.charCodeAt(0) % colors.length;
  if (uri) {
    return <Image source={{ uri }} style={styles.avatar} />;
  }
  return (
    <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: colors[idx] }]}>
      <Text style={styles.avatarInitial}>{username[0]?.toUpperCase() ?? '?'}</Text>
    </View>
  );
}

export default function FriendPlanCard({ event, myId, onPress }: Props) {
  const dateLabel = event.urgencyLabel ?? (event.date ? event.date : null);
  const isOwner = !!myId && event.createdBy === myId;

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.8}>
      {/* Top row: group name + "Your plan" tag */}
      <View style={styles.topRow}>
        {event.groupName ? (
          <Text style={styles.groupName} numberOfLines={1}>
            {event.groupName.toUpperCase()}
          </Text>
        ) : (
          <View />
        )}
        {isOwner && (
          <View style={styles.ownerTag}>
            <Text style={styles.ownerTagText}>Your plan</Text>
          </View>
        )}
      </View>

      {/* Title */}
      <Text style={styles.title} numberOfLines={3}>
        {event.title}
      </Text>

      {/* Date / urgency */}
      {dateLabel ? (
        <Text
          style={[styles.dateText, event.urgencyLabel ? styles.dateTextUrgent : null]}
          numberOfLines={1}
        >
          {dateLabel}
        </Text>
      ) : null}

      {/* Spacer pushes bottom content down */}
      <View style={styles.spacer} />

      {/* Friends going badge */}
      {event.friendsGoingLabel ? (
        <View style={styles.friendsBadge}>
          <Text style={styles.friendsBadgeText}>{event.friendsGoingLabel}</Text>
        </View>
      ) : null}

      {/* Bottom row: avatars + distance */}
      <View style={styles.bottomRow}>
        {event.goingPreview.length > 0 ? (
          <View style={styles.avatarRow}>
            {event.goingPreview.slice(0, 3).map((p, i) => (
              <View key={p.userId} style={[styles.avatarWrap, i > 0 && styles.avatarOverlap]}>
                <Avatar uri={p.avatarUrl} username={p.username} />
              </View>
            ))}
            {event.rsvpCount > 3 && (
              <Text style={styles.extraCount}>+{event.rsvpCount - 3}</Text>
            )}
          </View>
        ) : (
          <View />
        )}
        {event.distanceKm != null && (
          <Text style={styles.distance}>{formatDistance(event.distanceKm)}</Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    width: CARD_WIDTH,
    minHeight: 190,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
    minHeight: 15,
  },
  groupName: {
    fontSize: 9,
    fontWeight: '700',
    color: '#aaa',
    letterSpacing: 0.7,
    flex: 1,
  },
  ownerTag: {
    backgroundColor: '#1a1a1a',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginLeft: 4,
  },
  ownerTagText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.3,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1a1a1a',
    lineHeight: 20,
    letterSpacing: -0.2,
    marginBottom: 5,
  },
  dateText: {
    fontSize: 12,
    color: '#888',
    fontWeight: '500',
  },
  dateTextUrgent: {
    color: '#e65100',
  },
  spacer: {
    flex: 1,
    minHeight: 8,
  },
  friendsBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#e8f5e9',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: 8,
  },
  friendsBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#2e7d32',
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarWrap: {
    borderWidth: 2,
    borderColor: '#fff',
    borderRadius: 10,
  },
  avatarOverlap: {
    marginLeft: -6,
  },
  avatar: {
    width: 20,
    height: 20,
    borderRadius: 10,
  },
  avatarFallback: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitial: {
    fontSize: 8,
    fontWeight: '700',
    color: '#333',
  },
  extraCount: {
    marginLeft: 4,
    fontSize: 11,
    color: '#aaa',
    fontWeight: '500',
  },
  distance: {
    fontSize: 11,
    color: '#ccc',
    fontWeight: '500',
  },
});
