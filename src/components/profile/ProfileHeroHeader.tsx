import React from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Image } from 'expo-image';
import {
  PROFILE_HERO_HEIGHT,
  PROFILE_HERO_INNER_TOP_PAD,
  PROFILE_HERO_MARGIN_BOTTOM,
} from './constants';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type ProfileStat = {
  key: string;
  label: string;
  value: number | string;
  onPress?: () => void;
};

type ProfileHeroHeaderProps = {
  coverUrl?: string | null;
  avatarUrl?: string | null;
  username?: string | null;
  displayName?: string | null;
  bio?: string | null;
  stats: ProfileStat[];
  actionRow?: React.ReactNode;
  showOverflow?: boolean;
  onPressOverflow?: () => void;
  overflowTopOffset?: number;
  overflowOpacity?: number | Animated.AnimatedInterpolation<number>;
};

function renderAvatarFallback(username?: string | null) {
  return <Text style={styles.avatarInitial}>{(username ?? '?')[0].toUpperCase()}</Text>;
}

export default function ProfileHeroHeader({
  avatarUrl,
  username,
  displayName,
  bio,
  stats,
  actionRow,
  showOverflow = false,
  onPressOverflow,
  overflowTopOffset = 12,
  overflowOpacity = 1,
}: ProfileHeroHeaderProps) {
  const insets = useSafeAreaInsets();
  const resolvedName = displayName?.trim() || username || 'Profile';

  return (
    <View style={styles.headerRoot}>
      {showOverflow ? (
        <Animated.View style={[styles.overflowBtnWrap, { top: insets.top + overflowTopOffset, opacity: overflowOpacity }]}>
          <TouchableOpacity
            accessibilityRole="button"
            style={styles.overflowBtn}
            onPress={onPressOverflow}
            activeOpacity={0.85}
          >
            <Text style={styles.overflowText}>•••</Text>
          </TouchableOpacity>
        </Animated.View>
      ) : null}

      <View style={[styles.heroContent, { paddingTop: insets.top + PROFILE_HERO_INNER_TOP_PAD }]}>
        <View style={styles.identityRow}>
          <View style={styles.avatarWrap}>
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.avatar} />
            ) : (
              renderAvatarFallback(username)
            )}
          </View>

          <View style={styles.nameBlock}>
            <Text style={styles.displayName} numberOfLines={1}>
              {resolvedName}
            </Text>
            <Text style={styles.username} numberOfLines={1}>
              @{username ?? 'unknown'}
            </Text>
          </View>
        </View>

        {actionRow ? <View style={styles.actionsRow}>{actionRow}</View> : null}

        <View style={styles.statsRow}>
          {stats.map((stat) => {
            const Wrapper = stat.onPress ? TouchableOpacity : View;
            return (
              <Wrapper
                key={stat.key}
                style={styles.statItem}
                {...(stat.onPress ? { onPress: stat.onPress, activeOpacity: 0.85 } : {})}
              >
                <Text style={styles.statValue}>{stat.value}</Text>
                <Text style={styles.statLabel}>{stat.label}</Text>
              </Wrapper>
            );
          })}
        </View>

        {bio ? (
          <View style={styles.bioCard}>
            <Text style={styles.bioText}>{bio}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  headerRoot: {
    minHeight: PROFILE_HERO_HEIGHT,
    justifyContent: 'flex-end',
    marginBottom: PROFILE_HERO_MARGIN_BOTTOM,
  },
  overflowBtnWrap: {
    position: 'absolute',
    right: 16,
    zIndex: 5,
  },
  overflowBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  overflowText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    marginTop: -1,
    letterSpacing: 0.5,
  },
  heroContent: {
    paddingHorizontal: 16,
    paddingBottom: 18,
    gap: 12,
  },
  identityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  avatarWrap: {
    width: 74,
    height: 74,
    borderRadius: 37,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatar: { width: '100%', height: '100%' },
  avatarInitial: {
    fontSize: 30,
    fontWeight: '700',
    color: '#fff',
  },
  nameBlock: {
    maxWidth: '72%',
    alignItems: 'center',
  },
  displayName: {
    color: '#fff',
    fontSize: 40,
    lineHeight: 44,
    fontWeight: '700',
    letterSpacing: -0.8,
    textAlign: 'center',
  },
  username: {
    color: 'rgba(255,255,255,0.86)',
    fontSize: 18,
    marginTop: 2,
    fontWeight: '500',
    textAlign: 'center',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    color: '#fff',
    fontSize: 23,
    lineHeight: 27,
    fontWeight: '700',
  },
  statLabel: {
    color: 'rgba(255,255,255,0.84)',
    fontSize: 13,
    marginTop: 2,
    textTransform: 'capitalize',
  },
  bioCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.26)',
    backgroundColor: 'rgba(15,15,16,0.36)',
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  bioText: {
    color: 'rgba(255,255,255,0.92)',
    fontSize: 15,
    lineHeight: 21,
  },
});
