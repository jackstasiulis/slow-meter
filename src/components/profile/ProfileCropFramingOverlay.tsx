import React from 'react';
import { Dimensions, Platform, StyleSheet, View } from 'react-native';
import type { EdgeInsets } from 'react-native-safe-area-context';
import {
  PROFILE_CARD_HEIGHT,
  PROFILE_CARD_WIDTH,
  PROFILE_CONTENT_TOP_OFFSET,
  PROFILE_DOCK_BORDER_RADIUS,
  PROFILE_DOCK_BOTTOM_OFFSET,
  PROFILE_DOCK_HEIGHT,
  PROFILE_DOCK_WIDTH_RATIO,
  PROFILE_GRID_COL_GAP,
  PROFILE_GRID_H_PAD,
  PROFILE_GRID_ROW_GAP,
  PROFILE_HERO_HEIGHT,
  PROFILE_HERO_INNER_TOP_PAD,
  PROFILE_HERO_MARGIN_BOTTOM,
  PROFILE_MESSAGE_ACTION_SIZE,
} from './constants';

const { width: SCREEN_W } = Dimensions.get('window');

/**
 * Wireframe contrast (stronger than before so shapes read on busy cover photos).
 * Geometry matches `ProfileHeroHeader` + `UserProfileScreen` action row + grid + dock.
 */
const STROKE = 'rgba(255,255,255,0.78)';
const FILL = 'rgba(255,255,255,0.22)';
const FILL_INNER = 'rgba(255,255,255,0.14)';

type Props = {
  insets: EdgeInsets;
};

/**
 * Silhouette matching the in-app profile hero as shown on `UserProfileScreen`:
 * avatar + name, wide primary pill + circular message control, Posts/Links stats,
 * bio card, first post grid row, floating tab dock.
 * (Top-left close / top-right menu are omitted — crop mode uses Cancel / Done in those corners.)
 */
export default function ProfileCropFramingOverlay({ insets }: Props) {
  const dockHorizontalInset = (SCREEN_W * (1 - PROFILE_DOCK_WIDTH_RATIO)) / 2;
  const dockWidth = SCREEN_W * PROFILE_DOCK_WIDTH_RATIO;

  return (
    <View style={styles.root} pointerEvents="none">
      {/* Mirrors `FlatList` `contentContainerStyle` `paddingTop: PROFILE_CONTENT_TOP_OFFSET`. */}
      <View style={styles.listContentPad}>
        {/* `ProfileHeroHeader` `headerRoot` */}
        <View style={styles.headerRoot}>
          <View
            style={[
              styles.heroContent,
              { paddingTop: insets.top + PROFILE_HERO_INNER_TOP_PAD },
            ]}
          >
            <View style={styles.identityRow}>
              <View style={styles.avatarWrap} />
              <View style={styles.nameBlock}>
                <View style={styles.displayNameSilhouette} />
                <View style={styles.usernameSilhouette} />
              </View>
            </View>

            {/* `UserProfileScreen` `actions` + `primaryCtaSlot` + `messageIconBtn` */}
            <View style={styles.actions}>
              <View style={styles.primaryCtaSlot}>
                <View style={styles.primaryPillSilhouette} />
              </View>
              <View style={styles.messageIconBtnSilhouette} />
            </View>

            {/* Two stats: Posts + Links (same as `UserProfileScreen` ListHeader stats). */}
            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <View style={styles.statValueSilhouette} />
                <View style={styles.statLabelSilhouette} />
              </View>
              <View style={styles.statItem}>
                <View style={styles.statValueSilhouette} />
                <View style={styles.statLabelSilhouette} />
              </View>
            </View>

            <View style={styles.bioCard}>
              <View style={styles.bioLine} />
              <View style={[styles.bioLine, styles.bioLineShort]} />
            </View>
          </View>
        </View>

        <View style={styles.gridRow}>
          <View style={styles.gridItem} />
          <View style={styles.gridItem} />
        </View>
      </View>

      <View
        style={[
          styles.dock,
          {
            bottom: insets.bottom + PROFILE_DOCK_BOTTOM_OFFSET,
            left: dockHorizontalInset,
            width: dockWidth,
            height: PROFILE_DOCK_HEIGHT,
            borderRadius: PROFILE_DOCK_BORDER_RADIUS,
            ...(Platform.OS === 'ios' ? { borderCurve: 'continuous' as const } : {}),
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
  },
  listContentPad: {
    flex: 1,
    paddingTop: PROFILE_CONTENT_TOP_OFFSET,
  },
  headerRoot: {
    minHeight: PROFILE_HERO_HEIGHT,
    justifyContent: 'flex-end',
    marginBottom: PROFILE_HERO_MARGIN_BOTTOM,
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
    borderWidth: 2,
    borderColor: STROKE,
    backgroundColor: FILL,
    overflow: 'hidden',
  },
  nameBlock: {
    maxWidth: '72%',
    alignItems: 'center',
  },
  displayNameSilhouette: {
    height: 44,
    width: '88%',
    maxWidth: 260,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: STROKE,
    backgroundColor: FILL,
  },
  usernameSilhouette: {
    marginTop: 2,
    height: 18,
    width: '55%',
    maxWidth: 140,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: STROKE,
    backgroundColor: FILL,
  },
  /** `UserProfileScreen` `actions` */
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    width: '100%',
  },
  primaryCtaSlot: {
    flex: 1,
    minWidth: 0,
  },
  /** `primaryLinkedBtn` footprint (Linked / Link / etc.) */
  primaryPillSilhouette: {
    width: '100%',
    minHeight: 46,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: STROKE,
    backgroundColor: FILL,
  },
  messageIconBtnSilhouette: {
    width: PROFILE_MESSAGE_ACTION_SIZE,
    height: PROFILE_MESSAGE_ACTION_SIZE,
    borderRadius: PROFILE_MESSAGE_ACTION_SIZE / 2,
    borderWidth: 1,
    borderColor: STROKE,
    backgroundColor: 'rgba(0,0,0,0.45)',
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
  statValueSilhouette: {
    height: 27,
    width: 32,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: STROKE,
    backgroundColor: FILL,
  },
  statLabelSilhouette: {
    marginTop: 2,
    height: 13,
    width: 44,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: STROKE,
    backgroundColor: FILL,
  },
  bioCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: STROKE,
    backgroundColor: FILL,
    paddingHorizontal: 12,
    paddingVertical: 11,
    gap: 8,
  },
  bioLine: {
    height: 12,
    width: '100%',
    borderRadius: 3,
    backgroundColor: FILL_INNER,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  bioLineShort: {
    width: '72%',
    alignSelf: 'flex-start',
  },
  gridRow: {
    flexDirection: 'row',
    paddingHorizontal: PROFILE_GRID_H_PAD,
    gap: PROFILE_GRID_COL_GAP,
    marginBottom: PROFILE_GRID_ROW_GAP,
  },
  gridItem: {
    width: PROFILE_CARD_WIDTH,
    height: PROFILE_CARD_HEIGHT,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: STROKE,
    backgroundColor: FILL,
    overflow: 'hidden',
  },
  dock: {
    position: 'absolute',
    borderWidth: 1,
    borderColor: STROKE,
    backgroundColor: FILL,
  },
});
