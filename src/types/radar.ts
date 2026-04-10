export type NearbyFriend = {
  userId: string;
  username: string;
  avatarUrl: string | null;
  lat: number;
  lng: number;
  distanceKm: number;
  updatedAt: string;
};

/** People going (for radar card face pile); capped in the hook. */
export type RadarGoingPreview = {
  userId: string;
  avatarUrl: string | null;
  username: string;
};

export type RadarEvent = {
  id: string;
  title: string;
  date: string | null;
  time: string | null;
  location: string | null;
  locationLat: number | null;
  locationLng: number | null;
  imageUrl: string | null;
  conversationId: string;
  groupName: string | null;
  groupImageUrl: string | null;
  createdBy: string;
  createdAt: string;
  rsvpCount: number;
  /** Up to a few attendees who RSVP’d going, for avatars on the card */
  goingPreview: RadarGoingPreview[];
};

export type ScoredFriendEvent = RadarEvent & {
  score: number;
  distanceKm: number | null;
  urgencyLabel: string | null;
  friendsGoingLabel: string | null;
};

export type NearbyEvent = {
  id: string;
  title: string;
  time: string | null;
  date: string | null;
  distanceKm: number;
  lat: number;
  lng: number;
  source: string;
};

export type GroupChip = {
  id: string;
  name: string;
  avatarUrl: string | null;
};

export type TimeFilter = 'all' | 'now' | 'tonight' | 'weekend';

export type LocationPayload = {
  lat: number;
  lng: number;
  label: string;
};

export type SavedLocation = {
  id: string;
  userId: string;
  name: string;
  lat: number;
  lng: number;
  createdAt: string;
};
