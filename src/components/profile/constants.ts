import { Dimensions, Platform, StyleSheet } from 'react-native';

const SCREEN_WIDTH = Dimensions.get('window').width;
const SCREEN_HEIGHT = Dimensions.get('window').height;

export const PROFILE_GRID_H_PAD = 12;
export const PROFILE_GRID_COL_GAP = 8;
export const PROFILE_GRID_ROW_GAP = 8;

export const PROFILE_CARD_WIDTH = Math.floor(
  (SCREEN_WIDTH - PROFILE_GRID_H_PAD * 2 - PROFILE_GRID_COL_GAP) / 2,
);
export const PROFILE_CARD_HEIGHT = Math.round(PROFILE_CARD_WIDTH * (4 / 3));

// A tall hero that feels like a background image.
export const PROFILE_HERO_HEIGHT = Math.min(
  Math.round(SCREEN_HEIGHT * 0.72),
  Math.round(SCREEN_WIDTH * (16 / 9)),
);

/** Nudges profile scroll content (and scrim) slightly down; keeps blur aligned with the hero. */
export const PROFILE_CONTENT_TOP_OFFSET = 32;

/** Space below `ProfileHeroHeader` root before the post grid (matches `ProfileHeroHeader` `headerRoot`). */
export const PROFILE_HERO_MARGIN_BOTTOM = 14;

/**
 * Extra top padding inside hero content before the identity row (`ProfileHeroHeader` uses `insets.top +` this).
 */
export const PROFILE_HERO_INNER_TOP_PAD = 96;

/** Floating tab bar on main tabs — keep in sync with `App.tsx` `FloatingTabBar`. */
export const PROFILE_DOCK_HEIGHT = 60;
export const PROFILE_DOCK_WIDTH_RATIO = 0.84;
export const PROFILE_DOCK_BOTTOM_OFFSET = -3;
export const PROFILE_DOCK_BORDER_RADIUS = 16;

const HAIRLINE = StyleSheet.hairlineWidth;

/**
 * Dock “chrome”: left / right / bottom hairline only (no top border).
 * `borderWidth: hairline` after `borderTopWidth: 0` still draws a top stroke in RN.
 */
export const FLOATING_TAB_BAR_CHROME_STYLE = {
  borderTopWidth: 0,
  backgroundColor: 'transparent' as const,
  borderLeftWidth: HAIRLINE,
  borderRightWidth: HAIRLINE,
  borderBottomWidth: HAIRLINE,
  borderColor: 'rgba(255,255,255,0.28)',
  overflow: 'hidden' as const,
  ...(Platform.OS === 'ios' ? { borderCurve: 'continuous' as const } : {}),
  elevation: 0,
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 8 },
  shadowOpacity: 0.26,
  shadowRadius: 20,
};

export const FLOATING_TAB_BAR_LAYOUT_STYLE = {
  height: PROFILE_DOCK_HEIGHT,
  minHeight: PROFILE_DOCK_HEIGHT,
  borderRadius: PROFILE_DOCK_BORDER_RADIUS,
  paddingBottom: 0,
  paddingTop: 0,
  paddingHorizontal: 0,
};

/** Full `tabBarStyle` — use for defaults and to restore after Profile inline edit hides the bar. */
export const FLOATING_TAB_BAR_STYLE = {
  ...FLOATING_TAB_BAR_CHROME_STYLE,
  ...FLOATING_TAB_BAR_LAYOUT_STYLE,
};

/** Circular message action on `UserProfileScreen` (next to Link / Linked pill). */
export const PROFILE_MESSAGE_ACTION_SIZE = 48;

/** Y-offset for the scrolling content scrim: starts behind the avatar/name row. */
export const PROFILE_SCRIM_TOP =
  Math.round(PROFILE_HERO_HEIGHT * 0.24) + PROFILE_CONTENT_TOP_OFFSET;

/** Extra height below scrim so long scroll still has coverage. */
export const PROFILE_SCRIM_SCROLL_HEIGHT = PROFILE_HERO_HEIGHT + 2600;
