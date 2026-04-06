import React, { useState } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { RadarEvent } from '../../types/radar';
import { parseRadarEventDate } from '../../utils/radarEventDate';

type Props = {
  event: RadarEvent;
  myId: string | null;
  onPress: () => void;
};

function formatEventDate(dateStr: string | null, timeStr: string | null): string {
  if (!dateStr) return '';
  const date = parseRadarEventDate(dateStr);
  if (!date) return dateStr;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  const eventDay = new Date(date);
  eventDay.setHours(0, 0, 0, 0);

  let label = '';
  if (eventDay.getTime() === today.getTime()) {
    label = 'Today';
  } else if (eventDay.getTime() === tomorrow.getTime()) {
    label = 'Tomorrow';
  } else {
    label = eventDay.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  }

  if (timeStr) {
    // Format time from "HH:MM:SS" or "HH:MM" to "8:00 PM"
    const [h, m] = timeStr.split(':').map(Number);
    const suffix = h >= 12 ? 'PM' : 'AM';
    const hour = h % 12 || 12;
    label += ` · ${hour}:${String(m).padStart(2, '0')} ${suffix}`;
  }

  return label;
}

function staticMapUrl(lat: number, lng: number): string {
  return `https://staticmap.openstreetmap.de/staticmap.php?center=${lat},${lng}&zoom=14&size=120x80&markers=${lat},${lng},red-pushpin`;
}

export default function RadarEventCard({ event, myId, onPress }: Props) {
  const [imageError, setImageError] = useState(false);

  const hasCustomImage = !!event.imageUrl && !imageError;
  const hasMapImage = !hasCustomImage && event.locationLat != null && event.locationLng != null;
  const dateLabel = formatEventDate(event.date, event.time);

  const rsvpLabel = event.rsvpCount === 1 ? '1 going' : `${event.rsvpCount} going`;

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.8}>
      {/* Thumbnail */}
      <View style={styles.thumbnail}>
        {hasCustomImage ? (
          <Image
            source={{ uri: event.imageUrl! }}
            style={styles.thumbnailImage}
            resizeMode="cover"
            onError={() => setImageError(true)}
          />
        ) : hasMapImage ? (
          <Image
            source={{ uri: staticMapUrl(event.locationLat!, event.locationLng!) }}
            style={styles.thumbnailImage}
            resizeMode="cover"
          />
        ) : (
          <View style={styles.thumbnailFallback}>
            <Text style={styles.thumbnailEmoji}>📅</Text>
          </View>
        )}
      </View>

      {/* Content */}
      <View style={styles.content}>
        {/* Group name */}
        <View style={styles.metaRow}>
          {event.groupName ? (
            <Text style={styles.groupName} numberOfLines={1}>
              {event.groupName.toUpperCase()}
            </Text>
          ) : null}
          {event.createdBy === myId && (
            <View style={styles.youBadge}>
              <Text style={styles.youBadgeText}>You</Text>
            </View>
          )}
        </View>

        {/* Title */}
        <Text style={styles.title} numberOfLines={2}>{event.title}</Text>

        {/* Date */}
        {dateLabel ? (
          <Text style={styles.meta}>{dateLabel}</Text>
        ) : null}

        {/* Location + RSVPs */}
        <View style={styles.bottomRow}>
          {event.location ? (
            <Text style={styles.location} numberOfLines={1}>
              📍 {event.location}
            </Text>
          ) : null}
          {event.rsvpCount > 0 ? (
            <Text style={styles.rsvp}>{rsvpLabel}</Text>
          ) : null}
        </View>
      </View>
    </TouchableOpacity>
  );
}

const THUMB_W = 88;
const THUMB_H = 88;

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: '#fff',
    borderRadius: 14,
    marginHorizontal: 16,
    marginBottom: 10,
    overflow: 'hidden',
    minHeight: THUMB_H,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07,
    shadowRadius: 4,
    elevation: 2,
  },
  thumbnail: {
    width: THUMB_W,
    height: THUMB_H,
    backgroundColor: '#f0ede8',
    overflow: 'hidden',
  },
  thumbnailImage: {
    width: THUMB_W,
    height: THUMB_H,
  },
  thumbnailFallback: {
    width: THUMB_W,
    height: THUMB_H,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ede8e0',
  },
  thumbnailEmoji: { fontSize: 28 },
  content: {
    flex: 1,
    padding: 12,
    gap: 3,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  groupName: {
    fontSize: 10,
    fontWeight: '700',
    color: '#888',
    letterSpacing: 0.5,
    flex: 1,
  },
  youBadge: {
    backgroundColor: '#1a1a1a',
    borderRadius: 5,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  youBadgeText: {
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
  },
  meta: {
    fontSize: 13,
    color: '#555',
    marginTop: 1,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
    gap: 8,
  },
  location: {
    fontSize: 12,
    color: '#777',
    flex: 1,
  },
  rsvp: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2e7d32',
  },
});
