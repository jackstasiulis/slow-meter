import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCurrentUser } from '../../hooks/useCurrentUser';
import { useRadarEvents } from '../../hooks/useRadarEvents';
import { useNearbyFriends } from '../../hooks/useNearbyFriends';
import { useLocationSharing } from '../../hooks/useLocationSharing';
import { useScoredFriendEvents } from '../../hooks/useScoredFriendEvents';
import { useNearbyEvents } from '../../hooks/useNearbyEvents';
import { useGroupsForStartSomething } from '../../hooks/useGroupsForStartSomething';
import FriendNearbyRow from '../../components/radar/FriendNearbyRow';
import LocationSharingToggle from '../../components/radar/LocationSharingToggle';
import RadarTimeFilter from '../../components/radar/RadarTimeFilter';
import FriendPlanCard from '../../components/radar/FriendPlanCard';
import EmptyFriendPlanCard from '../../components/radar/EmptyFriendPlanCard';
import NearbyEventCard from '../../components/radar/NearbyEventCard';
import StartSomethingSection from '../../components/radar/StartSomethingSection';
import MapPlaceholderCard from '../../components/radar/MapPlaceholderCard';
import { TimeFilter, GroupChip } from '../../types/radar';

export default function RadarScreen() {
  const navigation = useNavigation<any>();
  const tabBarHeight = useBottomTabBarHeight();
  const insets = useSafeAreaInsets();
  const { user } = useCurrentUser();
  const [activeFilter, setActiveFilter] = useState<TimeFilter>('all');
  const [plansTab, setPlansTab] = useState<'upcoming' | 'past'>('upcoming');

  const { isSharing, toggle, currentPosition, permissionDenied } = useLocationSharing();
  const { nearbyFriends, loading: friendsLoading } = useNearbyFriends(
    user?.id ?? null,
    currentPosition
  );
  const {
    upcoming,
    later,
    past,
    loading: eventsLoading,
    refresh,
    refreshing,
  } = useRadarEvents(user?.id ?? null);

  const scoredEvents = useScoredFriendEvents(upcoming, later, currentPosition, activeFilter);
  const scoredPastEvents = useScoredFriendEvents(past, [], currentPosition, 'all');
  const { events: nearbyEvents } = useNearbyEvents(currentPosition);
  const { groups } = useGroupsForStartSomething(user?.id ?? null);

  function handleGroupSelect(group: GroupChip) {
    navigation.navigate('ConversationModal', {
      conversationId: group.id,
      isGroup: true,
      groupName: group.name,
      groupAvatarUrl: group.avatarUrl,
      openEventModal: true,
    });
  }

  return (
    <View style={[styles.safe, { paddingTop: insets.top }]}>
      {/* Compact inline header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Radar</Text>
        <LocationSharingToggle
          isSharing={isSharing}
          onToggle={toggle}
          permissionDenied={permissionDenied}
        />
      </View>

      {permissionDenied && (
        <View style={styles.permissionBanner}>
          <Text style={styles.permissionBannerText}>
            Enable location in Settings to see friends nearby
          </Text>
        </View>
      )}

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: tabBarHeight + 24 }]}
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

        {/* Time Filter */}
        <RadarTimeFilter activeFilter={activeFilter} onFilterChange={setActiveFilter} />

        {/* Friends Plans — horizontal scroll shelf */}
        <View style={styles.section}>
          <View style={styles.sectionRow}>
            <Text style={styles.sectionTitle}>Friends Plans</Text>
            <View style={styles.miniTabBar}>
              <TouchableOpacity
                style={[styles.miniTab, plansTab === 'upcoming' && styles.miniTabActive]}
                onPress={() => setPlansTab('upcoming')}
                activeOpacity={0.7}
              >
                <Text style={[styles.miniTabText, plansTab === 'upcoming' && styles.miniTabTextActive]}>
                  Upcoming
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.miniTab, plansTab === 'past' && styles.miniTabActive]}
                onPress={() => setPlansTab('past')}
                activeOpacity={0.7}
              >
                <Text style={[styles.miniTabText, plansTab === 'past' && styles.miniTabTextActive]}>
                  Past
                </Text>
                {past.length > 0 && plansTab !== 'past' && (
                  <View style={styles.miniTabDot} />
                )}
              </TouchableOpacity>
            </View>
          </View>
          {eventsLoading ? (
            <View style={styles.shelfRow}>
              <View style={styles.skeletonCard} />
              <View style={styles.skeletonCard} />
            </View>
          ) : plansTab === 'upcoming' ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.shelfContent}
            >
              {scoredEvents.length > 0 ? (
                scoredEvents.map((event) => (
                  <FriendPlanCard
                    key={event.id}
                    event={event}
                    myId={user?.id ?? null}
                    onPress={() => navigation.navigate('EventDetail', { eventId: event.id })}
                  />
                ))
              ) : (
                <EmptyFriendPlanCard />
              )}
            </ScrollView>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.shelfContent}
            >
              {scoredPastEvents.length > 0 ? (
                scoredPastEvents.map((event) => (
                  <FriendPlanCard
                    key={event.id}
                    event={event}
                    myId={user?.id ?? null}
                    onPress={() => navigation.navigate('EventDetail', { eventId: event.id })}
                  />
                ))
              ) : (
                <EmptyFriendPlanCard />
              )}
            </ScrollView>
          )}
        </View>

        {/* Nearby Events — always visible, horizontal chip row */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, styles.sectionTitleMuted]}>Nearby</Text>
          {nearbyEvents.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipRowContent}
            >
              {nearbyEvents.map((event) => (
                <NearbyEventCard key={event.id} event={event} />
              ))}
            </ScrollView>
          ) : (
            <Text style={styles.nearbyPlaceholder}>Finding events near you…</Text>
          )}
        </View>

        {/* Start Something */}
        <View style={styles.startSection}>
          <StartSomethingSection groups={groups} onGroupSelect={handleGroupSelect} />
        </View>

        {/* Map */}
        <MapPlaceholderCard />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#08090a',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: -0.5,
  },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 32 },
  permissionBanner: {
    backgroundColor: '#1a1a1a',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a2a',
  },
  permissionBannerText: {
    fontSize: 13,
    color: '#f0c040',
    textAlign: 'center',
  },
  section: {
    marginTop: 20,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#888',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 10,
    paddingHorizontal: 16,
  },
  sectionTitleMuted: {
    color: '#444',
  },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingRight: 16,
    marginBottom: 10,
  },
  miniTabBar: {
    flexDirection: 'row',
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    padding: 2,
    gap: 2,
  },
  miniTab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 4,
  },
  miniTabActive: {
    backgroundColor: '#2e2e2e',
  },
  miniTabText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#555',
  },
  miniTabTextActive: {
    color: '#fff',
  },
  miniTabDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#666',
  },
  // Horizontal shelf for Friends Plans
  shelfContent: {
    paddingHorizontal: 16,
    gap: 10,
    paddingRight: 40,
  },
  shelfRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 10,
  },
  skeletonCard: {
    width: 160,
    height: 190,
    borderRadius: 16,
    backgroundColor: '#1a1a1a',
  },
  // Horizontal chip row for Nearby
  chipRowContent: {
    paddingHorizontal: 16,
    gap: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  nearbyPlaceholder: {
    paddingHorizontal: 16,
    fontSize: 13,
    color: '#333',
    fontStyle: 'italic',
  },
  startSection: {
    marginTop: 20,
  },
});
