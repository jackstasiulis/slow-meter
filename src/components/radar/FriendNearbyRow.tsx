import React from 'react';
import {
  ScrollView,
  View,
  Text,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { NearbyFriend } from '../../types/radar';
import FriendNearbyCard from './FriendNearbyCard';

type Props = {
  friends: NearbyFriend[];
  loading: boolean;
  isSharing: boolean;
  onFriendPress: (userId: string, username: string) => void;
};

export default function FriendNearbyRow({ friends, loading, isSharing, onFriendPress }: Props) {
  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color="#aaa" />
      </View>
    );
  }

  if (!isSharing && friends.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>
          Turn on location sharing to see friends nearby
        </Text>
      </View>
    );
  }

  if (friends.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>No friends sharing location right now</Text>
      </View>
    );
  }

  return (
    <ScrollView
      horizontal
      nestedScrollEnabled
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.row}
    >
      {friends.map((friend) => (
        <FriendNearbyCard
          key={friend.userId}
          friend={friend}
          onPress={() => onFriendPress(friend.userId, friend.username)}
        />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingHorizontal: 16,
    gap: 12,
    paddingBottom: 4,
  },
  centered: {
    paddingHorizontal: 16,
    paddingVertical: 20,
    alignItems: 'flex-start',
  },
  emptyContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  emptyText: {
    fontSize: 14,
    color: '#aaa',
    fontStyle: 'italic',
  },
});
