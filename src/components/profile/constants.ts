import { Dimensions } from 'react-native';

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
