import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  RefreshControl,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useCurrentUser } from '../../hooks/useCurrentUser';
import { useRadarEvents } from '../../hooks/useRadarEvents';
import { useNearbyFriends } from '../../hooks/useNearbyFriends';
import { useLocationSharing } from '../../hooks/useLocationSharing';
import FriendNearbyRow from '../../components/radar/FriendNearbyRow';
import RadarEventCard from '../../components/radar/RadarEventCard';
import LocationSharingToggle from '../../components/radar/LocationSharingToggle';

export default function RadarScreen() {
  const navigation = useNavigation<any>();
  const { user } = useCurrentUser();

  const { isSharing, toggle, currentPosition, permissionDenied } = useLocationSharing();
  const { nearbyFriends, loading: friendsLoading } = useNearbyFriends(
    user?.id ?? null,
    currentPosition
  );
  const {
    upcoming,
    later,
    loading: eventsLoading,
    refresh,
    refreshing,
  } = useRadarEvents(user?.id ?? null);

  // Mount the sharing toggle in the nav header
  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <LocationSharingToggle
          isSharing={isSharing}
          onToggle={toggle}
          permissionDenied={permissionDenied}
        />
      ),
    });
  }, [navigation, isSharing, toggle, permissionDenied]);

  const isLoading = eventsLoading && friendsLoading;

  return (
    <SafeAreaView style={styles.safe}>
      {permissionDenied && (
        <View style={styles.permissionBanner}>
          <Text style={styles.permissionBannerText}>
            Enable location in Settings to see friends nearby
          </Text>
        </View>
      )}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} />
        }
      >
        {/* Friends Nearby */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Friends Nearby</Text>
          <FriendNearbyRow
            friends={nearbyFriends}
            loading={friendsLoading}
            isSharing={isSharing}
            onFriendPress={(userId, username) =>
              navigation.navigate('UserProfile', { userId, username })
            }
          />
        </View>

        {/* Upcoming Events */}
        {(upcoming.length > 0 || eventsLoading) && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Upcoming</Text>
            {upcoming.map((event) => (
              <RadarEventCard
                key={event.id}
                event={event}
                myId={user?.id ?? null}
                onPress={() => navigation.navigate('EventDetail', { eventId: event.id })}
              />
            ))}
          </View>
        )}

        {/* Later Events */}
        {later.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Later</Text>
            {later.map((event) => (
              <RadarEventCard
                key={event.id}
                event={event}
                myId={user?.id ?? null}
                onPress={() => navigation.navigate('EventDetail', { eventId: event.id })}
              />
            ))}
          </View>
        )}

        {/* No events empty state */}
        {!eventsLoading && upcoming.length === 0 && later.length === 0 && (
          <View style={styles.eventsEmpty}>
            <Text style={styles.eventsEmptyEmoji}>📅</Text>
            <Text style={styles.eventsEmptyTitle}>No upcoming events</Text>
            <Text style={styles.eventsEmptySubtext}>
              Events created in your group chats will appear here
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fafaf8' },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 32 },
  permissionBanner: {
    backgroundColor: '#fff3cd',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#fce8a4',
  },
  permissionBannerText: {
    fontSize: 13,
    color: '#856404',
    textAlign: 'center',
  },
  section: {
    marginTop: 24,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#888',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 12,
    paddingHorizontal: 16,
  },
  eventsEmpty: {
    alignItems: 'center',
    paddingTop: 48,
    paddingHorizontal: 32,
    gap: 8,
  },
  eventsEmptyEmoji: { fontSize: 36 },
  eventsEmptyTitle: { fontSize: 17, fontWeight: '600', color: '#1a1a1a' },
  eventsEmptySubtext: { fontSize: 14, color: '#888', textAlign: 'center', lineHeight: 20 },
});
