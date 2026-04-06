export type NearbyFriend = {
  userId: string;
  username: string;
  avatarUrl: string | null;
  lat: number;
  lng: number;
  distanceKm: number;
  updatedAt: string;
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
  createdBy: string;
  createdAt: string;
  rsvpCount: number;
};

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
