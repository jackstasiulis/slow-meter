export type User = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  cover_url: string | null;
  bio: string | null;
  follower_count: number;
  following_count: number;
  link_count: number;
  created_at: string;
};

export type Event = {
  id: string;
  conversation_id: string;
  created_by: string;
  title: string;
  date: string | null;
  time: string | null;
  location: string | null;
  description: string | null;
  image_url: string | null;
  created_at: string;
  group_name?: string | null;
};

export type Post = {
  id: string;
  user_id: string;
  media_url: string;
  media_urls?: string[];
  media_type: 'photo' | 'video';
  caption: string | null;
  location_label: string | null;
  like_count: number;
  comment_count: number;
  created_at: string;
  user?: User;
  liked_by_me?: boolean;
  tagged_user_ids?: string[];
  preview_comments?: { id: string; body: string; user: { username: string } }[];
};

export type AvailabilityPreset =
  | 'tonight'
  | 'tomorrow'
  | 'this_weekend'
  | 'next_week'
  | 'custom';

export type AvailabilityDaypart = 'morning' | 'afternoon' | 'evening';

export type AvailabilitySlot = {
  id: string;
  availability_check_id: string;
  label: string;
  starts_at: string;
  ends_at: string;
  sort_order: number;
};

export type AvailabilityCheck = {
  id: string;
  conversation_id: string;
  created_by: string;
  preset: AvailabilityPreset;
  title: string;
  timezone: string | null;
  range_start: string | null;
  range_end: string | null;
  created_at: string;
  slots?: AvailabilitySlot[];
};

export type AvailabilityVoteRow = {
  availability_check_id: string;
  availability_slot_id: string;
  user_id: string;
};

export type AvailabilitySummarySlot = {
  slot: AvailabilitySlot;
  voter_ids: string[];
  count: number;
};

export type AvailabilitySummary = {
  best_slot: AvailabilitySummarySlot | null;
  ranked_slots: AvailabilitySummarySlot[];
  respondent_ids: string[];
};

export type GroupPlanResponse = 'yes' | 'no' | 'maybe';

export type GroupPlan = {
  id: string;
  conversation_id: string;
  created_by: string;
  title: string;
  location: string | null;
  details: string | null;
  created_at: string;
};

export type GroupPlanRsvpRow = {
  plan_id: string;
  user_id: string;
  response: GroupPlanResponse;
  updated_at: string;
};

export type ReusablePlanTemplate = {
  id: string;
  user_id: string;
  title: string;
  location: string | null;
  details: string | null;
  created_at: string;
  updated_at: string;
};
