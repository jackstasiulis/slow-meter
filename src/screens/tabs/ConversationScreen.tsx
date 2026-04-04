import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  ScrollView,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  ActivityIndicator,
  Image,
  Dimensions,
  Modal,
  Alert,
  Switch,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useRoute, useNavigation, useFocusEffect } from '@react-navigation/native';
import { useHeaderHeight } from '@react-navigation/elements';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';
import { supabase } from '../../lib/supabase';
import {
  buildAvailabilityForPreset,
  buildCustomAvailability,
  CUSTOM_AVAILABILITY_MAX_DETAILED_DAYS,
  CUSTOM_AVAILABILITY_MAX_SLOTS,
  formatAvailabilitySlotWindow,
  formatAvailabilitySubtitle,
  summarizeAvailability,
} from '../../lib/availability';
import {
  AvailabilityCheck,
  AvailabilityDaypart,
  AvailabilityPreset,
  AvailabilitySlot,
  GroupPlan,
  GroupPlanResponse,
  ReusablePlanTemplate,
} from '../../types';

const SCREEN_WIDTH = Dimensions.get('window').width;
const QUICK_PLAN_DETAILS_MAX_LEN = 120;
const CHAT_INITIAL_MESSAGE_LIMIT = 350;

type Sender = { id: string; username: string; avatar_url: string | null };

type SharedEvent = {
  id: string;
  title: string;
  date: string | null;
  time: string | null;
  location: string | null;
  description: string | null;
  image_url: string | null;
  creator?: { username: string; avatar_url: string | null } | null;
};

type Poll = {
  id: string;
  question: string;
  options: string[];
  created_by: string;
  votes?: Record<number, string[]>; // option_index → user_ids
};

type AvailabilityVotesByCheck = Record<string, Record<string, string[]>>;

type GroupPlanRsvpBuckets = { yes: string[]; no: string[]; maybe: string[] };

type Message = {
  id: string;
  body: string;
  sender_id: string;
  created_at: string;
  liked_by: string[];
  deleted_at?: string | null;
  deleted_by?: string | null;
  post_id?: string | null;
  event_id?: string | null;
  poll_id?: string | null;
  availability_check_id?: string | null;
  group_plan_id?: string | null;
  shared_post?: {
    id: string;
    media_url: string;
    caption: string | null;
    user?: { username: string };
  } | null;
  shared_event?: SharedEvent | null;
  shared_poll?: Poll | null;
  shared_availability?: AvailabilityCheck | null;
  shared_group_plan?: GroupPlan | null;
  sender?: Sender | null;
};

const COMPOSER_ROW_MIN_HEIGHT = 56;
const ACTION_MENU_BOTTOM_GAP = 8;

export default function ConversationScreen() {
  const headerHeight = useHeaderHeight();
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const { conversationId, otherUsername, otherUserId, isGroup, groupAvatarUrl: initialGroupAvatarUrl, groupName: initialGroupName } = route.params;

  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [myId, setMyId] = useState<string | null>(null);
  const [memberCount, setMemberCount] = useState<number | null>(null);
  const [otherUserProfile, setOtherUserProfile] = useState<Sender | null>(null);

  // Group settings
  const [groupName, setGroupName] = useState<string>(initialGroupName ?? '');
  const [groupAvatarUrl, setGroupAvatarUrl] = useState<string | null>(initialGroupAvatarUrl ?? null);
  const [showGroupSettings, setShowGroupSettings] = useState(false);
  const [editGroupName, setEditGroupName] = useState('');
  const [newGroupAvatarUri, setNewGroupAvatarUri] = useState<string | null>(null);
  const [savingGroup, setSavingGroup] = useState(false);

  // Group creator (for delete access control)
  const [groupCreatedBy, setGroupCreatedBy] = useState<string | null>(null);

  // Pinned events (up to 3)
  const [pinnedEvents, setPinnedEvents] = useState<SharedEvent[]>([]);

  // Polls
  const [showCreatePoll, setShowCreatePoll] = useState(false);
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState(['', '']);
  const [creatingPoll, setCreatingPoll] = useState(false);
  // poll votes: pollId → { optionIndex → userId[] }
  const [pollVotes, setPollVotes] = useState<Record<string, Record<number, string[]>>>({});

  // Availability checks
  const [showCreateAvailability, setShowCreateAvailability] = useState(false);
  const [creatingAvailability, setCreatingAvailability] = useState(false);
  const [availabilityVotes, setAvailabilityVotes] = useState<AvailabilityVotesByCheck>({});
  const [customStartDate, setCustomStartDate] = useState<Date>(new Date());
  const [customEndDate, setCustomEndDate] = useState<Date>(new Date(Date.now() + 86400000));
  const [showCustomStartPicker, setShowCustomStartPicker] = useState(false);
  const [showCustomEndPicker, setShowCustomEndPicker] = useState(false);
  const [customDayparts, setCustomDayparts] = useState<AvailabilityDaypart[]>(['afternoon', 'evening']);
  const [showCustomAvailabilityOptions, setShowCustomAvailabilityOptions] = useState(false);
  const customAvailabilityPreview = useMemo(
    () => buildCustomAvailability(customStartDate, customEndDate, customDayparts),
    [customStartDate, customEndDate, customDayparts]
  );

  // Action menu (+ button)
  const [showActionMenu, setShowActionMenu] = useState(false);

  // Create event
  const [showCreateEvent, setShowCreateEvent] = useState(false);
  const [eventImageUri, setEventImageUri] = useState<string | null>(null);
  const [eventTitle, setEventTitle] = useState('');
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedTime, setSelectedTime] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [eventLocation, setEventLocation] = useState('');
  const [locationQuery, setLocationQuery] = useState('');
  const [locationSuggestions, setLocationSuggestions] = useState<{ name: string; lat: string; lon: string }[]>([]);
  const [locationSearching, setLocationSearching] = useState(false);
  const [locationCoords, setLocationCoords] = useState<{ lat: string; lon: string } | null>(null);
  const [eventDescription, setEventDescription] = useState('');
  const [creatingEvent, setCreatingEvent] = useState(false);
  const locationSearchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Typing indicator
  const [typingUsernames, setTypingUsernames] = useState<string[]>([]);
  const typingChannel = useRef<any>(null);
  const typingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flatListRef = useRef<FlatList>(null);
  const textInputRef = useRef<TextInput>(null);
  const didInitialScrollToLatestRef = useRef(false);
  const lastTapRef = useRef<Record<string, number>>({});
  const senderCacheRef = useRef<Record<string, Sender>>({});
  const myUsernameRef = useRef<string>('');
  const availabilityCheckIdsRef = useRef<Set<string>>(new Set());
  const groupPlanIdsRef = useRef<Set<string>>(new Set());

  const [groupPlanRsvps, setGroupPlanRsvps] = useState<Record<string, GroupPlanRsvpBuckets>>({});
  const [voterDisplayEpoch, setVoterDisplayEpoch] = useState(0);

  const [showQuickPlansPicker, setShowQuickPlansPicker] = useState(false);
  const [planTemplates, setPlanTemplates] = useState<ReusablePlanTemplate[]>([]);
  const [loadingPlanTemplates, setLoadingPlanTemplates] = useState(false);
  const [showCreateGroupPlan, setShowCreateGroupPlan] = useState(false);
  const [groupPlanTitle, setGroupPlanTitle] = useState('');
  const [groupPlanLocation, setGroupPlanLocation] = useState('');
  const [groupPlanDetails, setGroupPlanDetails] = useState('');
  const [groupPlanSaveToMyList, setGroupPlanSaveToMyList] = useState(false);
  const [creatingGroupPlan, setCreatingGroupPlan] = useState(false);
  const [savingPostedPlanId, setSavingPostedPlanId] = useState<string | null>(null);
  const [showEditSavedQuickPlan, setShowEditSavedQuickPlan] = useState(false);
  const [editSavedPlanId, setEditSavedPlanId] = useState<string | null>(null);
  const [editSavedPlanTitle, setEditSavedPlanTitle] = useState('');
  const [editSavedPlanLocation, setEditSavedPlanLocation] = useState('');
  const [editSavedPlanDetails, setEditSavedPlanDetails] = useState('');
  const [savingEditSavedPlan, setSavingEditSavedPlan] = useState(false);
  const [composerHeight, setComposerHeight] = useState(COMPOSER_ROW_MIN_HEIGHT);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const onShow = Keyboard.addListener(showEvent, (e) => setKeyboardHeight(e.endCoordinates.height));
    const onHide = Keyboard.addListener(hideEvent, () => setKeyboardHeight(0));
    return () => { onShow.remove(); onHide.remove(); };
  }, []);

  function emptyGroupPlanRsvpBuckets(): GroupPlanRsvpBuckets {
    return { yes: [], no: [], maybe: [] };
  }

  async function ensureSendersCached(userIds: string[]) {
    const missing = userIds.filter((id) => !senderCacheRef.current[id]);
    if (missing.length === 0) return;
    const { data } = await supabase.from('users').select('id, username, avatar_url').in('id', missing);
    for (const u of data ?? []) {
      senderCacheRef.current[u.id] = { id: u.id, username: u.username, avatar_url: u.avatar_url };
    }
    setVoterDisplayEpoch((e) => e + 1);
  }

  async function loadGroupPlansMap(planIds: string[]) {
    if (planIds.length === 0) return {};

    const uniqueIds = [...new Set(planIds)];
    uniqueIds.forEach((id) => groupPlanIdsRef.current.add(id));

    const [{ data: plansData, error: plansError }, { data: rsvpsData }] = await Promise.all([
      supabase
        .from('group_plans')
        .select('id, conversation_id, created_by, title, location, details, created_at')
        .in('id', uniqueIds),
      supabase
        .from('group_plan_rsvps')
        .select('plan_id, user_id, response, updated_at')
        .in('plan_id', uniqueIds),
    ]);

    if (plansError || !plansData) return {};

    const bucketsByPlan: Record<string, GroupPlanRsvpBuckets> = {};
    for (const id of uniqueIds) bucketsByPlan[id] = emptyGroupPlanRsvpBuckets();

    const allVoterIds: string[] = [];
    for (const row of rsvpsData ?? []) {
      const b = bucketsByPlan[row.plan_id];
      if (!b) continue;
      if (!b[row.response as GroupPlanResponse].includes(row.user_id)) {
        b[row.response as GroupPlanResponse].push(row.user_id);
      }
      allVoterIds.push(row.user_id);
    }

    setGroupPlanRsvps((prev) => {
      const next = { ...prev };
      for (const id of uniqueIds) {
        next[id] = bucketsByPlan[id] ?? emptyGroupPlanRsvpBuckets();
      }
      return next;
    });

    await ensureSendersCached([...new Set(allVoterIds)]);

    const planMap: Record<string, GroupPlan> = {};
    for (const p of plansData ?? []) planMap[p.id] = p as GroupPlan;
    return planMap;
  }

  function isGroupPlanLoaded(planId: string) {
    return groupPlanIdsRef.current.has(planId);
  }

  async function loadAvailabilityMap(checkIds: string[]) {
    if (checkIds.length === 0) return {};

    const uniqueIds = [...new Set(checkIds)];
    uniqueIds.forEach((id) => availabilityCheckIdsRef.current.add(id));
    const [{ data: checksData, error: checksError }, { data: slotsData }, { data: votesData }] = await Promise.all([
      supabase
        .from('availability_checks')
        .select('id, conversation_id, created_by, preset, title, timezone, range_start, range_end, created_at')
        .in('id', uniqueIds),
      supabase
        .from('availability_slots')
        .select('id, availability_check_id, label, starts_at, ends_at, sort_order')
        .in('availability_check_id', uniqueIds)
        .order('sort_order', { ascending: true }),
      supabase
        .from('availability_votes')
        .select('availability_check_id, availability_slot_id, user_id')
        .in('availability_check_id', uniqueIds),
    ]);

    if (checksError || !checksData) return {};

    const slotsByCheck: Record<string, AvailabilityCheck['slots']> = {};
    for (const slot of slotsData ?? []) {
      if (!slotsByCheck[slot.availability_check_id]) slotsByCheck[slot.availability_check_id] = [];
      slotsByCheck[slot.availability_check_id]!.push(slot);
    }

    const votesByCheck: AvailabilityVotesByCheck = {};
    for (const vote of votesData ?? []) {
      if (!votesByCheck[vote.availability_check_id]) votesByCheck[vote.availability_check_id] = {};
      if (!votesByCheck[vote.availability_check_id][vote.availability_slot_id]) {
        votesByCheck[vote.availability_check_id][vote.availability_slot_id] = [];
      }
      votesByCheck[vote.availability_check_id][vote.availability_slot_id].push(vote.user_id);
    }

    setAvailabilityVotes((prev) => {
      const next = { ...prev };
      for (const id of uniqueIds) {
        next[id] = votesByCheck[id] ?? {};
      }
      return next;
    });

    const checkMap: Record<string, AvailabilityCheck> = {};
    for (const check of checksData ?? []) {
      checkMap[check.id] = { ...check, slots: slotsByCheck[check.id] ?? [] };
    }

    return checkMap;
  }

  function resetAvailabilityComposer() {
    setShowCreateAvailability(false);
    setShowCustomStartPicker(false);
    setShowCustomEndPicker(false);
    setShowCustomAvailabilityOptions(false);
    setCustomStartDate(new Date());
    setCustomEndDate(new Date(Date.now() + 86400000));
    setCustomDayparts(['afternoon', 'evening']);
  }

  function toggleCustomDaypart(daypart: AvailabilityDaypart) {
    setCustomDayparts((prev) => (
      prev.includes(daypart)
        ? prev.filter((value) => value !== daypart)
        : [...prev, daypart]
    ));
  }

  function isAvailabilityLoaded(checkId: string) {
    return availabilityCheckIdsRef.current.has(checkId);
  }

  async function syncMessageVisibility() {
    const { data: latestMessages } = await supabase
      .from('messages')
      .select('id, availability_check_id, group_plan_id')
      .eq('conversation_id', conversationId);

    if (!latestMessages) return;

    const visibleMessageIds = new Set(latestMessages.map((message: any) => message.id));
    const activeAvailabilityIds = new Set(
      latestMessages
        .map((message: any) => message.availability_check_id)
        .filter(Boolean)
    );
    const activeGroupPlanIds = new Set(
      latestMessages
        .map((message: any) => message.group_plan_id)
        .filter(Boolean)
    );

    availabilityCheckIdsRef.current = activeAvailabilityIds;
    groupPlanIdsRef.current = activeGroupPlanIds;
    setAvailabilityVotes((prev) => {
      const next: AvailabilityVotesByCheck = {};
      for (const [checkId, votes] of Object.entries(prev)) {
        if (activeAvailabilityIds.has(checkId)) next[checkId] = votes;
      }
      return next;
    });
    setGroupPlanRsvps((prev) => {
      const next: Record<string, GroupPlanRsvpBuckets> = {};
      for (const [planId, buckets] of Object.entries(prev)) {
        if (activeGroupPlanIds.has(planId)) next[planId] = buckets;
      }
      return next;
    });
    setMessages((prev) => prev.filter((message) => visibleMessageIds.has(message.id)));
  }

  async function syncAvailabilityChecks() {
    const availabilityIds = [...availabilityCheckIdsRef.current];
    if (availabilityIds.length === 0) return;

    const availabilityMap = await loadAvailabilityMap(availabilityIds);
    setMessages((prev) => prev.map((message) => {
      if (!message.availability_check_id) return message;
      return {
        ...message,
        shared_availability: availabilityMap[message.availability_check_id] ?? null,
      };
    }));
  }

  async function syncGroupPlans() {
    const planIds = [...groupPlanIdsRef.current];
    if (planIds.length === 0) return;

    const planMap = await loadGroupPlansMap(planIds);
    setMessages((prev) => prev.map((message) => {
      if (!message.group_plan_id) return message;
      return {
        ...message,
        shared_group_plan: planMap[message.group_plan_id] ?? null,
      };
    }));
  }

  useEffect(() => {
    let messageChannel: any;
    let availabilityVoteChannel: any;
    let availabilityCheckChannel: any;
    let groupPlanRsvpChannel: any;

    async function setup() {
      const messagesSelect =
        'id, body, sender_id, created_at, liked_by, deleted_at, deleted_by, post_id, event_id, poll_id, availability_check_id, group_plan_id';

      const groupHeaderPromise = isGroup
        ? Promise.all([
            supabase
              .from('conversation_participants')
              .select('*', { count: 'exact', head: true })
              .eq('conversation_id', conversationId),
            supabase
              .from('conversations')
              .select('pinned_event_ids, created_by')
              .eq('id', conversationId)
              .single(),
          ])
        : null;

      const dmProfilePromise = !isGroup && otherUserId
        ? supabase
          .from('users')
          .select('id, username, avatar_url')
          .eq('id', otherUserId)
          .single()
        : null;

      const [authRes, msgRes, groupHeadPack, dmProfileRes] = await Promise.all([
        supabase.auth.getUser(),
        supabase
          .from('messages')
          .select(messagesSelect)
          .eq('conversation_id', conversationId)
          .order('created_at', { ascending: false })
          .limit(CHAT_INITIAL_MESSAGE_LIMIT),
        groupHeaderPromise ?? Promise.resolve(null),
        dmProfilePromise ?? Promise.resolve({ data: null as any, error: null }),
      ]);

      const { data: { user } } = authRes;
      if (!user) return;
      setMyId(user.id);
      const { data: meRow } = await supabase.from('users').select('username').eq('id', user.id).single();
      if (meRow) myUsernameRef.current = meRow.username;

      let pinnedIdsForLoad: string[] = [];
      if (groupHeadPack) {
        const [participantsRes, convRes] = groupHeadPack as [{ count: number | null }, { data: any }];
        setMemberCount(participantsRes?.count ?? null);
        const convData = convRes?.data;
        setGroupCreatedBy(convData?.created_by ?? null);
        pinnedIdsForLoad = convData?.pinned_event_ids ?? [];
      }

      const dmRow = (dmProfileRes as { data?: { id: string; username: string; avatar_url: string | null } | null })?.data;
      if (dmRow) {
        setOtherUserProfile({ id: dmRow.id, username: dmRow.username, avatar_url: dmRow.avatar_url });
      }

      const { data: msgDataRaw, error: msgError } = msgRes;
      const msgData = msgError ? null : [...(msgDataRaw ?? [])].reverse();

      if (msgError) {
        const { data: fallbackData } = await supabase
          .from('messages')
          .select('id, body, sender_id, created_at, liked_by, deleted_at, deleted_by')
          .eq('conversation_id', conversationId)
          .order('created_at', { ascending: false })
          .limit(CHAT_INITIAL_MESSAGE_LIMIT);
        const fallbackChrono = [...(fallbackData ?? [])].reverse();
        setMessages((fallbackChrono).map((m: any) => ({
          ...m,
          post_id: null,
          event_id: null,
          poll_id: null,
          availability_check_id: null,
          group_plan_id: null,
          shared_post: null,
          shared_event: null,
          shared_poll: null,
          shared_availability: null,
          shared_group_plan: null,
          sender: null,
        })));
        setLoading(false);
        if (isGroup) {
          if (pinnedIdsForLoad.length > 0) {
            const { data: peData } = await supabase
              .from('events')
              .select('id, title, date, time, location, description, image_url, creator:users!events_created_by_fkey(username, avatar_url)')
              .in('id', pinnedIdsForLoad);
            setPinnedEvents((peData ?? []).map((e: any) => ({ ...e, creator: Array.isArray(e.creator) ? e.creator[0] ?? null : e.creator })));
          } else {
            setPinnedEvents([]);
          }
        }
      } else {
        const msgs = msgData ?? [];

        const postIds = [...new Set(msgs.filter((m: any) => m.post_id).map((m: any) => m.post_id))];
        const eventIds = [...new Set(msgs.filter((m: any) => m.event_id).map((m: any) => m.event_id))];
        const pollIds = [...new Set(msgs.filter((m: any) => m.poll_id).map((m: any) => m.poll_id))];
        const availabilityCheckIds = [...new Set(msgs.filter((m: any) => m.availability_check_id).map((m: any) => m.availability_check_id))];
        const groupPlanIds = [...new Set(msgs.filter((m: any) => m.group_plan_id).map((m: any) => m.group_plan_id))];
        const senderIdsToFetch = isGroup
          ? ([...new Set(msgs.map((m: any) => m.sender_id))] as string[]).filter((id) => !senderCacheRef.current[id])
          : [];

        const postsPromise = postIds.length > 0
          ? supabase
            .from('posts')
            .select('id, media_url, caption, user:users!posts_user_id_fkey(username)')
            .in('id', postIds)
          : Promise.resolve({ data: [] as any[] });

        const eventsPromise = eventIds.length > 0
          ? supabase
            .from('events')
            .select('id, title, date, time, location, description, image_url, creator:users!events_created_by_fkey(username, avatar_url)')
            .in('id', eventIds)
          : Promise.resolve({ data: [] as any[] });

        const pollsPromise = pollIds.length > 0
          ? supabase
            .from('polls')
            .select('id, question, options, created_by')
            .in('id', pollIds)
          : Promise.resolve({ data: [] as any[] });

        const pollVotesPromise = pollIds.length > 0
          ? supabase
            .from('poll_votes')
            .select('poll_id, user_id, option_index')
            .in('poll_id', pollIds)
          : Promise.resolve({ data: [] as any[] });

        const availabilityPromise: Promise<Record<string, AvailabilityCheck>> = availabilityCheckIds.length > 0
          ? loadAvailabilityMap(availabilityCheckIds)
          : Promise.resolve({});

        const groupPlansPromise: Promise<Record<string, GroupPlan>> = groupPlanIds.length > 0
          ? loadGroupPlansMap(groupPlanIds)
          : Promise.resolve({});

        const sendersPromise = senderIdsToFetch.length > 0
          ? supabase
            .from('users')
            .select('id, username, avatar_url')
            .in('id', senderIdsToFetch)
          : Promise.resolve({ data: [] as any[] });

        const pinnedEventsPromise = pinnedIdsForLoad.length > 0
          ? supabase
            .from('events')
            .select('id, title, date, time, location, description, image_url, creator:users!events_created_by_fkey(username, avatar_url)')
            .in('id', pinnedIdsForLoad)
          : Promise.resolve({ data: [] as any[] });

        const [
          { data: postsData },
          { data: eventsData },
          { data: pollsData },
          { data: votesData },
          availabilityMap,
          groupPlansMap,
          { data: usersData },
          { data: pinnedEventsData },
        ] = await Promise.all([
          postsPromise,
          eventsPromise,
          pollsPromise,
          pollVotesPromise,
          availabilityPromise,
          groupPlansPromise,
          sendersPromise,
          pinnedEventsPromise,
        ]);

        if (isGroup) {
          setPinnedEvents((pinnedEventsData ?? []).map((e: any) => ({ ...e, creator: Array.isArray(e.creator) ? e.creator[0] ?? null : e.creator })));
        }

        const postMap: Record<string, any> = {};
        for (const p of postsData ?? []) postMap[p.id] = p;

        const eventMap: Record<string, any> = {};
        for (const e of eventsData ?? []) eventMap[e.id] = { ...e, creator: Array.isArray(e.creator) ? e.creator[0] ?? null : e.creator };

        const votesMap: Record<string, Record<number, string[]>> = {};
        for (const v of votesData ?? []) {
          if (!votesMap[v.poll_id]) votesMap[v.poll_id] = {};
          if (!votesMap[v.poll_id][v.option_index]) votesMap[v.poll_id][v.option_index] = [];
          votesMap[v.poll_id][v.option_index].push(v.user_id);
        }
        const pollMap: Record<string, Poll> = {};
        for (const p of pollsData ?? []) pollMap[p.id] = { ...p, votes: votesMap[p.id] ?? {} };
        if (pollIds.length > 0) setPollVotes(votesMap);

        for (const u of usersData ?? []) {
          senderCacheRef.current[u.id] = { id: u.id, username: u.username, avatar_url: u.avatar_url };
        }

        setMessages(msgs.map((m: any) => ({
          ...m,
          shared_post: m.post_id ? postMap[m.post_id] ?? null : null,
          shared_event: m.event_id ? eventMap[m.event_id] ?? null : null,
          shared_poll: m.poll_id ? pollMap[m.poll_id] ?? null : null,
          shared_availability: m.availability_check_id ? availabilityMap[m.availability_check_id] ?? null : null,
          shared_group_plan: m.group_plan_id ? groupPlansMap[m.group_plan_id] ?? null : null,
          sender: isGroup ? senderCacheRef.current[m.sender_id] ?? null : null,
        })));
        setLoading(false);
      }

      messageChannel = supabase
        .channel(`conv:${conversationId}`)
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        }, async (payload) => {
          const newMsg: any = {
            ...payload.new,
            shared_post: null,
            shared_event: null,
            shared_poll: null,
            shared_availability: null,
            shared_group_plan: null,
            sender: null,
          };

          if (newMsg.poll_id) {
            const { data: p } = await supabase
              .from('polls')
              .select('id, question, options, created_by')
              .eq('id', newMsg.poll_id)
              .single();
            newMsg.shared_poll = p ? { ...p, votes: {} } : null;
          }

          if (newMsg.event_id) {
            const { data: ev } = await supabase
              .from('events')
              .select('id, title, date, time, location, description, image_url, creator:users!events_created_by_fkey(username, avatar_url)')
              .eq('id', newMsg.event_id)
              .single();
            newMsg.shared_event = ev ? { ...ev, creator: Array.isArray((ev as any).creator) ? (ev as any).creator[0] ?? null : (ev as any).creator } : null;
          }

          if (newMsg.post_id) {
            const { data: p } = await supabase
              .from('posts')
              .select('id, media_url, caption, user:users!posts_user_id_fkey(username)')
              .eq('id', newMsg.post_id)
              .single();
            newMsg.shared_post = p ?? null;
          }

          if (newMsg.availability_check_id) {
            const availabilityMap = await loadAvailabilityMap([newMsg.availability_check_id]);
            newMsg.shared_availability = availabilityMap[newMsg.availability_check_id] ?? null;
          }

          if (newMsg.group_plan_id) {
            const groupPlansMap = await loadGroupPlansMap([newMsg.group_plan_id]);
            newMsg.shared_group_plan = groupPlansMap[newMsg.group_plan_id] ?? null;
          }

          if (isGroup) {
            if (senderCacheRef.current[newMsg.sender_id]) {
              newMsg.sender = senderCacheRef.current[newMsg.sender_id];
            } else {
              const { data: u } = await supabase
                .from('users')
                .select('id, username, avatar_url')
                .eq('id', newMsg.sender_id)
                .single();
              if (u) {
                senderCacheRef.current[u.id] = { id: u.id, username: u.username, avatar_url: u.avatar_url };
                newMsg.sender = senderCacheRef.current[u.id];
              }
            }
          }

          setMessages((prev) => [...prev, newMsg]);
        })
        .on('postgres_changes', {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        }, (payload) => {
          setMessages((prev) =>
            prev.map((m) => {
              if (m.id !== payload.new.id) return m;
              const isDeleted = !!payload.new.deleted_at;
              return {
                ...m,
                body: payload.new.body,
                liked_by: payload.new.liked_by,
                post_id: payload.new.post_id,
                event_id: payload.new.event_id,
                poll_id: payload.new.poll_id,
                availability_check_id: payload.new.availability_check_id,
                group_plan_id: payload.new.group_plan_id,
                deleted_at: payload.new.deleted_at,
                deleted_by: payload.new.deleted_by,
                shared_post: isDeleted || !payload.new.post_id ? null : m.shared_post,
                shared_event: isDeleted || !payload.new.event_id ? null : m.shared_event,
                shared_poll: isDeleted || !payload.new.poll_id ? null : m.shared_poll,
                shared_availability: isDeleted || !payload.new.availability_check_id ? null : m.shared_availability,
                shared_group_plan: isDeleted || !payload.new.group_plan_id ? null : m.shared_group_plan,
              };
            })
          );
        })
        .on('postgres_changes', {
          event: 'DELETE',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        }, (payload) => {
          setMessages((prev) => prev.filter((m) => m.id !== payload.old.id));
        })
        .subscribe();

      availabilityVoteChannel = supabase
        .channel(`availability-votes:${conversationId}`)
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'availability_votes',
        }, (payload) => {
          const row = payload.eventType === 'DELETE' ? payload.old : payload.new;
          const checkId = row?.availability_check_id as string | undefined;
          const slotId = row?.availability_slot_id as string | undefined;
          const userId = row?.user_id as string | undefined;

          if (!checkId || !slotId || !userId || !isAvailabilityLoaded(checkId)) return;

          setAvailabilityVotes((prev) => {
            const next = { ...prev };
            const byCheck = { ...(next[checkId] ?? {}) };
            const existing = [...(byCheck[slotId] ?? [])];

            if (payload.eventType === 'DELETE') {
              byCheck[slotId] = existing.filter((value) => value !== userId);
            } else if (!existing.includes(userId)) {
              byCheck[slotId] = [...existing, userId];
            } else {
              byCheck[slotId] = existing;
            }

            next[checkId] = byCheck;
            return next;
          });
        })
        .subscribe();

      groupPlanRsvpChannel = supabase
        .channel(`group-plan-rsvps:${conversationId}`)
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'group_plan_rsvps',
        }, (payload) => {
          const row = payload.eventType === 'DELETE' ? payload.old : payload.new;
          const planId = row?.plan_id as string | undefined;
          const userId = row?.user_id as string | undefined;
          const response = row?.response as GroupPlanResponse | undefined;
          if (!planId || !isGroupPlanLoaded(planId)) return;

          setGroupPlanRsvps((prev) => {
            const next = { ...prev };
            const buckets: GroupPlanRsvpBuckets = { ...(next[planId] ?? emptyGroupPlanRsvpBuckets()) };
            (['yes', 'no', 'maybe'] as const).forEach((k) => {
              buckets[k] = (buckets[k] ?? []).filter((id) => id !== userId);
            });
            if (payload.eventType !== 'DELETE' && response && userId) {
              const list = buckets[response] ?? [];
              if (!list.includes(userId)) buckets[response] = [...list, userId];
            }
            next[planId] = buckets;
            return next;
          });
          if (userId) void ensureSendersCached([userId]);
        })
        .subscribe();

      availabilityCheckChannel = supabase
        .channel(`availability-checks:${conversationId}`)
        .on('postgres_changes', {
          event: 'UPDATE',
          schema: 'public',
          table: 'availability_checks',
        }, (payload) => {
          const updated = payload.new as any;
          if (!updated?.id) return;
          if (!availabilityCheckIdsRef.current.has(updated.id)) return;

          setMessages((prev) => prev.map((m) => {
            if (m.availability_check_id !== updated.id || !m.shared_availability) return m;
            return {
              ...m,
              shared_availability: {
                ...m.shared_availability,
                title: updated.title ?? m.shared_availability.title,
                preset: updated.preset ?? m.shared_availability.preset,
                timezone: updated.timezone ?? m.shared_availability.timezone,
                range_start: updated.range_start ?? m.shared_availability.range_start,
                range_end: updated.range_end ?? m.shared_availability.range_end,
              },
            };
          }));
        })
        .subscribe();
    }

    setup();
    return () => {
      if (messageChannel) supabase.removeChannel(messageChannel);
      if (availabilityVoteChannel) supabase.removeChannel(availabilityVoteChannel);
      if (availabilityCheckChannel) supabase.removeChannel(availabilityCheckChannel);
      if (groupPlanRsvpChannel) supabase.removeChannel(groupPlanRsvpChannel);
    };
  }, []);

  // Typing presence channel
  useEffect(() => {
    if (!myId) return;
    const ch = supabase.channel(`typing:${conversationId}`, { config: { presence: { key: myId } } });
    ch.on('presence', { event: 'sync' }, () => {
      const state = ch.presenceState();
      const names: string[] = [];
      for (const key of Object.keys(state)) {
        if (key === myId) continue;
        const presences: any[] = state[key];
        if (presences.some((p) => p.typing)) names.push(presences[0]?.username ?? '');
      }
      setTypingUsernames(names.filter(Boolean));
    });
    ch.subscribe();
    typingChannel.current = ch;
    return () => { supabase.removeChannel(ch); };
  }, [myId]);

  function handleTextChange(val: string) {
    setText(val);
    if (!typingChannel.current || !myId) return;
    typingChannel.current.track({ typing: val.length > 0, username: myUsernameRef.current });
    if (typingTimeout.current) clearTimeout(typingTimeout.current);
    if (val.length > 0) {
      typingTimeout.current = setTimeout(() => {
        typingChannel.current?.track({ typing: false, username: myUsernameRef.current });
      }, 3000);
    }
  }

  // Reload pinned event when returning to this screen (not on initial mount — setup() handles that)
  const isMounted = useRef(false);
  useFocusEffect(useCallback(() => {
    if (!isMounted.current) { isMounted.current = true; return; }
    syncMessageVisibility();
    syncAvailabilityChecks();
    syncGroupPlans();
    if (!isGroup) return;
    supabase
      .from('conversations')
      .select('pinned_event_ids')
      .eq('id', conversationId)
      .single()
      .then(({ data: convData }) => {
        const ids: string[] = convData?.pinned_event_ids ?? [];
        if (ids.length === 0) { setPinnedEvents([]); return; }
        supabase
          .from('events')
          .select('id, title, date, time, location, description, image_url, creator:users!events_created_by_fkey(username, avatar_url)')
          .in('id', ids)
          .then(({ data: peData }) => {
            if (peData) setPinnedEvents(peData.map((e: any) => ({ ...e, creator: Array.isArray(e.creator) ? e.creator[0] ?? null : e.creator })));
            else setPinnedEvents([]);
          });
      });
  }, [conversationId, isGroup]));

  async function sendMessage() {
    if (!text.trim() || !myId) return;
    setSending(true);
    const body = text.trim();
    setText('');
    await supabase.from('messages').insert({ conversation_id: conversationId, sender_id: myId, body });
    setSending(false);
  }

  async function handleMessageTap(message: Message) {
    if (message.deleted_at) return;
    const now = Date.now();
    const last = lastTapRef.current[message.id] ?? 0;
    if (now - last < 300) {
      if (!myId) return;
      const alreadyLiked = (message.liked_by ?? []).includes(myId);
      const newLikedBy = alreadyLiked
        ? message.liked_by.filter((id) => id !== myId)
        : [...(message.liked_by ?? []), myId];
      setMessages((prev) =>
        prev.map((m) => m.id === message.id ? { ...m, liked_by: newLikedBy } : m)
      );
      await supabase.from('messages').update({ liked_by: newLikedBy }).eq('id', message.id);
    }
    lastTapRef.current[message.id] = now;
  }

  function formatDate(d: Date) {
    return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  }

  function formatTime(d: Date) {
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }

  function formatShortDate(d: Date) {
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  function formatNominatimAddress(r: any): string {
    const addr = r.address ?? {};
    const parts: string[] = [];
    const street = [addr.house_number, addr.road].filter(Boolean).join(' ');
    if (street) parts.push(street);
    const city = addr.city ?? addr.town ?? addr.village ?? addr.municipality;
    if (city) parts.push(city);
    if (addr.postcode) parts.push(addr.postcode);
    if (addr.country) parts.push(addr.country);
    return parts.join(', ') || r.display_name;
  }

  function debouncedLocationSearch(q: string) {
    setLocationQuery(q);
    setEventLocation('');
    setLocationSuggestions([]);
    if (locationSearchTimeout.current) clearTimeout(locationSearchTimeout.current);
    if (!q.trim()) return;
    locationSearchTimeout.current = setTimeout(async () => {
      setLocationSearching(true);
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&q=${encodeURIComponent(q)}&limit=5`,
          { headers: { 'User-Agent': 'SlowMeterApp/1.0' } }
        );
        const data = await res.json();
        setLocationSuggestions(data.map((r: any) => ({ name: formatNominatimAddress(r), lat: r.lat as string, lon: r.lon as string })));
      } catch {
        setLocationSuggestions([]);
      }
      setLocationSearching(false);
    }, 500);
  }

  async function pickEventImage() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      allowsEditing: true,
      aspect: [2, 1],
    });
    if (!result.canceled) setEventImageUri(result.assets[0].uri);
  }

  async function createEvent() {
    if (!eventTitle.trim() || !myId || creatingEvent) return;
    setCreatingEvent(true);

    // Use OSM static map as default image if no photo picked but location coords exist
    let uploadedImageUrl: string | null = null;
    if (!eventImageUri && locationCoords) {
      const { lat, lon } = locationCoords;
      uploadedImageUrl = `https://staticmap.openstreetmap.de/staticmap.php?center=${lat},${lon}&zoom=15&size=800x400&markers=${lat},${lon},red-pushpin`;
    }
    if (eventImageUri) {
      const fileExt = eventImageUri.split('.').pop()?.toLowerCase() ?? 'jpg';
      const filePath = `${myId}/event_${Date.now()}.${fileExt}`;
      const base64 = await FileSystem.readAsStringAsync(eventImageUri, { encoding: 'base64' as any });
      const { error: uploadError } = await supabase.storage
        .from('media')
        .upload(filePath, decode(base64), { contentType: `image/${fileExt}`, upsert: true });
      if (!uploadError) {
        const { data: { publicUrl } } = supabase.storage.from('media').getPublicUrl(filePath);
        uploadedImageUrl = publicUrl;
      }
    }

    const { data: ev, error } = await supabase
      .from('events')
      .insert({
        conversation_id: conversationId,
        created_by: myId,
        title: eventTitle.trim(),
        date: selectedDate ? formatDate(selectedDate) : null,
        time: selectedTime ? formatTime(selectedTime) : null,
        location: eventLocation.trim() || null,
        description: eventDescription.trim() || null,
        image_url: uploadedImageUrl,
      })
      .select('id')
      .single();

    if (error || !ev) {
      Alert.alert('Error', error?.message ?? 'Could not create event');
      setCreatingEvent(false);
      return;
    }

    await supabase.from('messages').insert({
      conversation_id: conversationId,
      sender_id: myId,
      body: '',
      event_id: ev.id,
    });

    setCreatingEvent(false);
    setShowCreateEvent(false);
    setEventTitle('');
    setSelectedDate(null);
    setSelectedTime(null);
    setShowDatePicker(false);
    setShowTimePicker(false);
    setEventLocation('');
    setLocationQuery('');
    setLocationSuggestions([]);
    setLocationCoords(null);
    setEventDescription('');
    setEventImageUri(null);
  }

  async function createPoll() {
    const validOptions = pollOptions.filter((o) => o.trim().length > 0);
    if (!pollQuestion.trim() || validOptions.length < 2 || !myId || creatingPoll) return;
    setCreatingPoll(true);
    const { data: poll, error } = await supabase
      .from('polls')
      .insert({ conversation_id: conversationId, created_by: myId, question: pollQuestion.trim(), options: validOptions })
      .select('id')
      .single();
    if (error || !poll) { Alert.alert('Error', error?.message ?? 'Could not create poll'); setCreatingPoll(false); return; }
    await supabase.from('messages').insert({ conversation_id: conversationId, sender_id: myId, body: '', poll_id: poll.id });
    setCreatingPoll(false);
    setShowCreatePoll(false);
    setPollQuestion('');
    setPollOptions(['', '']);
  }

  async function votePoll(pollId: string, optionIndex: number) {
    if (!myId) return;
    const existing = pollVotes[pollId] ?? {};
    const myCurrentVote = Object.entries(existing).find(([, voters]) => voters.includes(myId));
    if (myCurrentVote && parseInt(myCurrentVote[0]) === optionIndex) {
      // Toggle off
      await supabase.from('poll_votes').delete().eq('poll_id', pollId).eq('user_id', myId);
      setPollVotes((prev) => {
        const updated = { ...prev[pollId] };
        updated[optionIndex] = (updated[optionIndex] ?? []).filter((id) => id !== myId);
        return { ...prev, [pollId]: updated };
      });
    } else {
      // Remove old vote first, then insert new
      if (myCurrentVote) {
        await supabase.from('poll_votes').delete().eq('poll_id', pollId).eq('user_id', myId);
      }
      await supabase.from('poll_votes').upsert({ poll_id: pollId, user_id: myId, option_index: optionIndex });
      setPollVotes((prev) => {
        const updated: Record<number, string[]> = {};
        for (const [k, v] of Object.entries(prev[pollId] ?? {})) {
          updated[parseInt(k)] = (v as string[]).filter((id) => id !== myId);
        }
        updated[optionIndex] = [...(updated[optionIndex] ?? []), myId];
        return { ...prev, [pollId]: updated };
      });
    }
    // Refresh shared_poll votes on message
    setMessages((prev) => prev.map((m) => {
      if (m.poll_id !== pollId || !m.shared_poll) return m;
      const updated: Record<number, string[]> = {};
      for (const [k, v] of Object.entries(pollVotes[pollId] ?? {})) updated[parseInt(k)] = v as string[];
      return { ...m, shared_poll: { ...m.shared_poll, votes: updated } };
    }));
  }

  async function createAvailabilityCheck(preset: AvailabilityPreset) {
    if (!myId || creatingAvailability) return;

    const generated = preset === 'custom'
      ? customAvailabilityPreview
      : buildAvailabilityForPreset(preset);

    if (generated.slots.length === 0) {
      Alert.alert('No future slots', 'Try a different preset or a wider custom range.');
      return;
    }

    setCreatingAvailability(true);

    const { data: insertedCheck, error: checkError } = await supabase
      .from('availability_checks')
      .insert({
        conversation_id: conversationId,
        created_by: myId,
        preset: generated.preset,
        title: generated.title,
        timezone: generated.timezone,
        range_start: generated.range_start,
        range_end: generated.range_end,
      })
      .select('id, conversation_id, created_by, preset, title, timezone, range_start, range_end, created_at')
      .single();

    if (checkError || !insertedCheck) {
      Alert.alert('Error', checkError?.message ?? 'Could not create availability check');
      setCreatingAvailability(false);
      return;
    }

    const { data: insertedSlots, error: slotError } = await supabase
      .from('availability_slots')
      .insert(generated.slots.map((slot) => ({
        availability_check_id: insertedCheck.id,
        label: slot.label,
        starts_at: slot.starts_at,
        ends_at: slot.ends_at,
        sort_order: slot.sort_order,
      })))
      .select('id, availability_check_id, label, starts_at, ends_at, sort_order')
      .order('sort_order', { ascending: true });

    if (slotError) {
      Alert.alert('Error', slotError.message);
      setCreatingAvailability(false);
      return;
    }

    const { error: messageError } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversationId,
        sender_id: myId,
        body: '',
        availability_check_id: insertedCheck.id,
      });

    if (messageError) {
      Alert.alert('Error', messageError.message);
      setCreatingAvailability(false);
      return;
    }

    availabilityCheckIdsRef.current.add(insertedCheck.id);
    setAvailabilityVotes((prev) => ({ ...prev, [insertedCheck.id]: {} }));
    setMessages((prev) => prev.map((message) => (
      message.availability_check_id === insertedCheck.id
        ? { ...message, shared_availability: { ...insertedCheck, slots: insertedSlots ?? [] } }
        : message
    )));
    setCreatingAvailability(false);
    resetAvailabilityComposer();
  }

  async function toggleAvailabilityVote(checkId: string, slotId: string) {
    if (!myId) return;

    const alreadySelected = (availabilityVotes[checkId]?.[slotId] ?? []).includes(myId);

    if (alreadySelected) {
      await supabase
        .from('availability_votes')
        .delete()
        .eq('availability_check_id', checkId)
        .eq('availability_slot_id', slotId)
        .eq('user_id', myId);

      setAvailabilityVotes((prev) => {
        const byCheck = { ...(prev[checkId] ?? {}) };
        byCheck[slotId] = (byCheck[slotId] ?? []).filter((value) => value !== myId);
        return { ...prev, [checkId]: byCheck };
      });
      return;
    }

    const { error } = await supabase
      .from('availability_votes')
      .insert({
        availability_check_id: checkId,
        availability_slot_id: slotId,
        user_id: myId,
      });

    if (error) {
      Alert.alert('Error', error.message);
      return;
    }

    setAvailabilityVotes((prev) => {
      const byCheck = { ...(prev[checkId] ?? {}) };
      const voters = byCheck[slotId] ?? [];
      byCheck[slotId] = voters.includes(myId) ? voters : [...voters, myId];
      return { ...prev, [checkId]: byCheck };
    });
  }

  function resetGroupPlanComposer() {
    setShowCreateGroupPlan(false);
    setGroupPlanTitle('');
    setGroupPlanLocation('');
    setGroupPlanDetails('');
    setGroupPlanSaveToMyList(false);
  }

  async function fetchPlanTemplatesList(): Promise<ReusablePlanTemplate[]> {
    if (!myId) return [];
    const { data, error } = await supabase
      .from('reusable_plan_templates')
      .select('id, user_id, title, location, details, created_at, updated_at')
      .eq('user_id', myId)
      .order('updated_at', { ascending: false });
    if (error) {
      Alert.alert('Error', error.message);
      return [];
    }
    return (data ?? []) as ReusablePlanTemplate[];
  }

  async function openQuickPlansHub() {
    setShowActionMenu(false);
    setShowQuickPlansPicker(true);
    setLoadingPlanTemplates(true);
    const list = await fetchPlanTemplatesList();
    setLoadingPlanTemplates(false);
    setPlanTemplates(list);
  }

  function resetEditSavedQuickPlan() {
    setShowEditSavedQuickPlan(false);
    setEditSavedPlanId(null);
    setEditSavedPlanTitle('');
    setEditSavedPlanLocation('');
    setEditSavedPlanDetails('');
  }

  function openEditSavedQuickPlan(t: ReusablePlanTemplate) {
    setEditSavedPlanId(t.id);
    setEditSavedPlanTitle(t.title);
    setEditSavedPlanLocation(t.location ?? '');
    setEditSavedPlanDetails(t.details ?? '');
    setShowQuickPlansPicker(false);
    setShowEditSavedQuickPlan(true);
  }

  function promptSavedQuickPlanActions(t: ReusablePlanTemplate) {
    Alert.alert(
      t.title,
      'Edit this saved quick plan or remove it from your list.',
      [
        { text: 'Edit', onPress: () => openEditSavedQuickPlan(t) },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            Alert.alert('Delete saved plan?', 'You can always save a plan from chat again later.', [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Delete',
                style: 'destructive',
                onPress: async () => {
                  if (!myId) return;
                  const { error } = await supabase.from('reusable_plan_templates').delete().eq('id', t.id).eq('user_id', myId);
                  if (error) {
                    Alert.alert('Could not delete', error.message);
                    return;
                  }
                  setPlanTemplates((prev) => prev.filter((p) => p.id !== t.id));
                },
              },
            ]);
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  }

  async function submitEditSavedQuickPlan() {
    if (!myId || !editSavedPlanId || savingEditSavedPlan) return;
    if (!editSavedPlanTitle.trim()) {
      Alert.alert('Title required', 'Give the plan a short title.');
      return;
    }
    setSavingEditSavedPlan(true);
    const locationVal = editSavedPlanLocation.trim() || null;
    const detailsVal = editSavedPlanDetails.trim()
      ? editSavedPlanDetails.trim().slice(0, QUICK_PLAN_DETAILS_MAX_LEN)
      : null;
    const { error } = await supabase
      .from('reusable_plan_templates')
      .update({
        title: editSavedPlanTitle.trim(),
        location: locationVal,
        details: detailsVal,
        updated_at: new Date().toISOString(),
      })
      .eq('id', editSavedPlanId)
      .eq('user_id', myId);
    setSavingEditSavedPlan(false);
    if (error) {
      Alert.alert('Could not save', error.message);
      return;
    }
    resetEditSavedQuickPlan();
    const list = await fetchPlanTemplatesList();
    setPlanTemplates(list);
    setShowQuickPlansPicker(true);
  }

  async function insertGroupPlanAndMessage(
    title: string,
    locationTrimmed: string | null,
    detailsTrimmed: string | null,
  ): Promise<{ plan: GroupPlan } | { error: string }> {
    if (!myId) return { error: 'Not signed in' };
    const { data: plan, error } = await supabase
      .from('group_plans')
      .insert({
        conversation_id: conversationId,
        created_by: myId,
        title: title.trim(),
        location: locationTrimmed,
        details: detailsTrimmed,
      })
      .select('id, conversation_id, created_by, title, location, details, created_at')
      .single();
    if (error || !plan) return { error: error?.message ?? 'Could not create plan' };
    const { error: msgErr } = await supabase.from('messages').insert({
      conversation_id: conversationId,
      sender_id: myId,
      body: '',
      group_plan_id: plan.id,
    });
    if (msgErr) {
      await supabase.from('group_plans').delete().eq('id', plan.id);
      return { error: msgErr.message };
    }
    groupPlanIdsRef.current.add(plan.id);
    setGroupPlanRsvps((prev) => ({ ...prev, [plan.id]: emptyGroupPlanRsvpBuckets() }));
    return { plan: plan as GroupPlan };
  }

  async function submitNewGroupPlan() {
    if (!myId || creatingGroupPlan) return;
    if (!groupPlanTitle.trim()) {
      Alert.alert('Title required', 'Give the plan a short title.');
      return;
    }
    setCreatingGroupPlan(true);
    const locationVal = groupPlanLocation.trim() || null;
    const detailsVal = groupPlanDetails.trim()
      ? groupPlanDetails.trim().slice(0, QUICK_PLAN_DETAILS_MAX_LEN)
      : null;
    if (groupPlanSaveToMyList) {
      const { error: tErr } = await supabase.from('reusable_plan_templates').insert({
        user_id: myId,
        title: groupPlanTitle.trim(),
        location: locationVal,
        details: detailsVal,
      });
      if (tErr) {
        setCreatingGroupPlan(false);
        Alert.alert('Error', tErr.message);
        return;
      }
    }
    const result = await insertGroupPlanAndMessage(groupPlanTitle, locationVal, detailsVal);
    setCreatingGroupPlan(false);
    if ('error' in result) {
      Alert.alert('Error', result.error);
      return;
    }
    resetGroupPlanComposer();
    setShowQuickPlansPicker(false);
  }

  async function instantiateGroupPlanTemplate(template: ReusablePlanTemplate) {
    if (!myId || creatingGroupPlan) return;
    setCreatingGroupPlan(true);
    const locationVal = template.location?.trim() || null;
    const detailsVal = template.details?.trim()
      ? template.details.trim().slice(0, QUICK_PLAN_DETAILS_MAX_LEN)
      : null;
    const result = await insertGroupPlanAndMessage(template.title, locationVal, detailsVal);
    setCreatingGroupPlan(false);
    if ('error' in result) {
      Alert.alert('Error', result.error);
      return;
    }
    setShowQuickPlansPicker(false);
  }

  function openCreateGroupPlanFromPicker() {
    setShowQuickPlansPicker(false);
    setShowCreateGroupPlan(true);
  }

  async function setGroupPlanRsvpResponse(planId: string, rsvp: GroupPlanResponse) {
    if (!myId) return;
    const buckets = groupPlanRsvps[planId] ?? emptyGroupPlanRsvpBuckets();
    let myCurrent: GroupPlanResponse | null = null;
    (['yes', 'no', 'maybe'] as const).forEach((k) => {
      if (buckets[k].includes(myId)) myCurrent = k;
    });
    if (myCurrent !== null && myCurrent === rsvp) {
      const clearKey: GroupPlanResponse = myCurrent;
      const { error } = await supabase.from('group_plan_rsvps').delete().eq('plan_id', planId).eq('user_id', myId);
      if (error) {
        Alert.alert('Error', error.message);
        return;
      }
      setGroupPlanRsvps((prev) => {
        const next = { ...prev };
        const old = next[planId] ?? emptyGroupPlanRsvpBuckets();
        const b: GroupPlanRsvpBuckets = {
          yes: [...old.yes],
          no: [...old.no],
          maybe: [...old.maybe],
        };
        if (clearKey === 'yes') b.yes = b.yes.filter((id) => id !== myId);
        else if (clearKey === 'no') b.no = b.no.filter((id) => id !== myId);
        else b.maybe = b.maybe.filter((id) => id !== myId);
        next[planId] = b;
        return next;
      });
      return;
    }
    const { error } = await supabase
      .from('group_plan_rsvps')
      .upsert({ plan_id: planId, user_id: myId, response: rsvp }, { onConflict: 'plan_id,user_id' });
    if (error) {
      Alert.alert('Error', error.message);
      return;
    }
    setGroupPlanRsvps((prev) => {
      const next = { ...prev };
      const old = next[planId] ?? emptyGroupPlanRsvpBuckets();
      const b: GroupPlanRsvpBuckets = {
        yes: [...old.yes],
        no: [...old.no],
        maybe: [...old.maybe],
      };
      if (rsvp === 'yes') {
        b.yes = [...b.yes.filter((id) => id !== myId), myId];
        b.no = b.no.filter((id) => id !== myId);
        b.maybe = b.maybe.filter((id) => id !== myId);
      } else if (rsvp === 'no') {
        b.no = [...b.no.filter((id) => id !== myId), myId];
        b.yes = b.yes.filter((id) => id !== myId);
        b.maybe = b.maybe.filter((id) => id !== myId);
      } else {
        b.maybe = [...b.maybe.filter((id) => id !== myId), myId];
        b.yes = b.yes.filter((id) => id !== myId);
        b.no = b.no.filter((id) => id !== myId);
      }
      next[planId] = b;
      return next;
    });
  }

  function renderGroupPlanVoters(userIds: string[]) {
    void voterDisplayEpoch;
    const maxShown = 5;
    const shown = userIds.slice(0, maxShown);
    const overflow = userIds.length - shown.length;
    return (
      <View style={styles.groupPlanVotersWrap}>
        {shown.map((uid) => {
          const u = senderCacheRef.current[uid];
          return (
            <View key={uid} style={styles.groupPlanVoterChip}>
              <View style={styles.groupPlanVoterAvatar}>
                {u?.avatar_url ? (
                  <Image source={{ uri: u.avatar_url }} style={styles.groupPlanVoterAvatarImg} />
                ) : (
                  <Text style={styles.groupPlanVoterAvatarInitial}>
                    {u?.username?.[0]?.toUpperCase() ?? '?'}
                  </Text>
                )}
              </View>
              <Text style={styles.groupPlanVoterUsername} numberOfLines={1}>
                {u?.username ? `@${u.username}` : '…'}
              </Text>
            </View>
          );
        })}
        {overflow > 0 && (
          <View style={styles.groupPlanVoterChip}>
            <Text style={styles.groupPlanVoterOverflow}>+{overflow} more</Text>
          </View>
        )}
      </View>
    );
  }

  function renderAvailabilityVoterFaces(userIds: string[], selected: boolean) {
    void voterDisplayEpoch;
    if (userIds.length === 0) return null;
    const maxShown = 4;
    const shown = userIds.slice(0, maxShown);
    const overflow = userIds.length - shown.length;
    const borderColor = selected ? '#1a1a1a' : '#f7f7f7';
    return (
      <View style={styles.availabilityFacesRow}>
        {shown.map((uid, index) => {
          const u = senderCacheRef.current[uid];
          return (
            <View
              key={uid}
              style={[
                styles.availabilityFace,
                { borderColor },
                index > 0 && styles.availabilityFaceOverlap,
              ]}
            >
              {u?.avatar_url ? (
                <Image source={{ uri: u.avatar_url }} style={styles.availabilityFaceImg} />
              ) : (
                <View style={[styles.availabilityFaceFallback, selected && styles.availabilityFaceFallbackSelected]}>
                  <Text style={[styles.availabilityFaceInitial, selected && styles.availabilityFaceInitialSelected]}>
                    {u?.username?.[0]?.toUpperCase() ?? '?'}
                  </Text>
                </View>
              )}
            </View>
          );
        })}
        {overflow > 0 && (
          <View style={[styles.availabilityFace, styles.availabilityFaceMore, { borderColor }, shown.length > 0 && styles.availabilityFaceOverlap]}>
            <Text style={[styles.availabilityFaceMoreText, selected && styles.availabilityFaceMoreTextSelected]}>
              +{overflow}
            </Text>
          </View>
        )}
      </View>
    );
  }

  async function savePostedPlanToMyTemplates(plan: GroupPlan) {
    if (!myId) return;
    setSavingPostedPlanId(plan.id);
    const { error } = await supabase.from('reusable_plan_templates').insert({
      user_id: myId,
      title: plan.title,
      location: plan.location?.trim() ? plan.location.trim() : null,
      details: plan.details?.trim()
        ? plan.details.trim().slice(0, QUICK_PLAN_DETAILS_MAX_LEN)
        : null,
    });
    setSavingPostedPlanId(null);
    if (error) {
      Alert.alert('Could not save', error.message);
      return;
    }
    Alert.alert('Saved', 'This plan was added to your quick plans.');
  }

  async function softDeleteMessage(message: Message) {
    if (!myId || message.sender_id !== myId || message.deleted_at) return;

    const updatePayload = {
      body: '',
      liked_by: [],
      post_id: null,
      event_id: null,
      poll_id: null,
      availability_check_id: null,
      group_plan_id: null,
      deleted_at: new Date().toISOString(),
      deleted_by: myId,
    };

    const { error } = await supabase
      .from('messages')
      .update(updatePayload)
      .eq('id', message.id)
      .eq('sender_id', myId);

    if (error) {
      Alert.alert('Error', error.message);
      return;
    }

    if (message.availability_check_id) {
      availabilityCheckIdsRef.current.delete(message.availability_check_id);
      setAvailabilityVotes((prev) => {
        const next = { ...prev };
        delete next[message.availability_check_id!];
        return next;
      });

      await supabase
        .from('availability_checks')
        .delete()
        .eq('id', message.availability_check_id)
        .eq('created_by', myId);
    }

    if (message.group_plan_id) {
      groupPlanIdsRef.current.delete(message.group_plan_id);
      setGroupPlanRsvps((prev) => {
        const next = { ...prev };
        delete next[message.group_plan_id!];
        return next;
      });

      await supabase
        .from('group_plans')
        .delete()
        .eq('id', message.group_plan_id)
        .eq('created_by', myId);
    }

    setMessages((prev) => prev.map((entry) => (
      entry.id === message.id
        ? {
            ...entry,
            ...updatePayload,
            shared_post: null,
            shared_event: null,
            shared_poll: null,
            shared_availability: null,
            shared_group_plan: null,
          }
        : entry
    )));
  }

  async function pinEvent(event: SharedEvent) {
    const isAlreadyPinned = pinnedEvents.some((e) => e.id === event.id);
    let newPinnedIds: string[];
    if (isAlreadyPinned) {
      newPinnedIds = pinnedEvents.filter((e) => e.id !== event.id).map((e) => e.id);
    } else {
      if (pinnedEvents.length >= 3) {
        Alert.alert('Too many pinned events', 'Only 3 events can be pinned at a time. Long-press a pinned event to unpin it first.');
        return;
      }
      newPinnedIds = [...pinnedEvents.map((e) => e.id), event.id];
    }
    const { error } = await supabase
      .from('conversations')
      .update({ pinned_event_ids: newPinnedIds })
      .eq('id', conversationId);
    if (error) {
      Alert.alert('Could not pin event', error.message);
      return;
    }
    if (isAlreadyPinned) {
      setPinnedEvents((prev) => prev.filter((e) => e.id !== event.id));
    } else {
      setPinnedEvents((prev) => [...prev, event]);
    }
  }

  async function deleteGroup() {
    Alert.alert('Delete Group?', 'This will permanently delete the group and all its messages.', [
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase
            .from('conversations')
            .delete()
            .eq('id', conversationId);
          if (error) { Alert.alert('Error', error.message); return; }
          setShowGroupSettings(false);
          navigation.navigate('MainTabs', { screen: 'Messages' });
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  async function pickGroupAvatar() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (!result.canceled) setNewGroupAvatarUri(result.assets[0].uri);
  }

  async function saveGroupSettings() {
    if (!editGroupName.trim()) return;
    setSavingGroup(true);
    try {
      let finalAvatarUrl = groupAvatarUrl;
      if (newGroupAvatarUri && myId) {
        const fileExt = newGroupAvatarUri.split('.').pop()?.toLowerCase() ?? 'jpg';
        const filePath = `${myId}/group_${conversationId}.${fileExt}`;
        const base64 = await FileSystem.readAsStringAsync(newGroupAvatarUri, { encoding: 'base64' as any });
        const { error: uploadError } = await supabase.storage
          .from('media')
          .upload(filePath, decode(base64), { contentType: `image/${fileExt}`, upsert: true });
        if (uploadError) throw uploadError;
        const { data: { publicUrl } } = supabase.storage.from('media').getPublicUrl(filePath);
        finalAvatarUrl = publicUrl;
      }

      const { error } = await supabase
        .from('conversations')
        .update({ name: editGroupName.trim(), avatar_url: finalAvatarUrl })
        .eq('id', conversationId);
      if (error) throw error;

      setGroupName(editGroupName.trim());
      setGroupAvatarUrl(finalAvatarUrl);
      setNewGroupAvatarUri(null);
      setShowGroupSettings(false);
      navigation.setOptions({ title: editGroupName.trim() });
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setSavingGroup(false);
    }
  }

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h`;
    return `${Math.floor(hrs / 24)}d`;
  };

  const scrollConversationToLatest = useCallback((animated = false) => {
    requestAnimationFrame(() => {
      flatListRef.current?.scrollToOffset({ offset: 0, animated });
    });
  }, []);

  useEffect(() => {
    if (loading || didInitialScrollToLatestRef.current || messages.length === 0) return;
    didInitialScrollToLatestRef.current = true;
    scrollConversationToLatest(false);
  }, [loading, messages.length, scrollConversationToLatest]);

  if (loading) return <ActivityIndicator style={{ flex: 1 }} color="#1a1a1a" />;

  const isIos = Platform.OS === 'ios';

  const actionMenu = (
    <View style={styles.actionMenu}>
      <TouchableOpacity style={styles.actionMenuItem} onPress={() => { setShowActionMenu(false); setShowCreateAvailability(true); }}>
        <Text style={styles.actionMenuIcon}>⏱</Text>
        <Text style={styles.actionMenuLabel}>Availability</Text>
      </TouchableOpacity>
      <View style={styles.actionMenuDivider} />
      <TouchableOpacity style={styles.actionMenuItem} onPress={openQuickPlansHub}>
        <Text style={styles.actionMenuIcon}>📋</Text>
        <Text style={styles.actionMenuLabel}>Quick plans</Text>
      </TouchableOpacity>
      <View style={styles.actionMenuDivider} />
      <TouchableOpacity style={styles.actionMenuItem} onPress={() => { setShowActionMenu(false); setShowCreateEvent(true); }}>
        <Text style={styles.actionMenuIcon}>📅</Text>
        <Text style={styles.actionMenuLabel}>Event</Text>
      </TouchableOpacity>
      <View style={styles.actionMenuDivider} />
      <TouchableOpacity style={styles.actionMenuItem} onPress={() => { setShowActionMenu(false); setShowCreatePoll(true); }}>
        <Text style={styles.actionMenuIcon}>📊</Text>
        <Text style={styles.actionMenuLabel}>Poll</Text>
      </TouchableOpacity>
    </View>
  );

  const composer = (
    <View
      style={styles.composerContainer}
      onLayout={(event) => {
        const nextHeight = Math.ceil(event.nativeEvent.layout.height);
        if (nextHeight > 0 && Math.abs(nextHeight - composerHeight) > 1) {
          setComposerHeight(nextHeight);
          if (isIos) scrollConversationToLatest(false);
        }
      }}
    >
      {typingUsernames.length > 0 && (
        <View style={styles.typingRow}>
          <Text style={styles.typingText}>
            {typingUsernames.join(', ')} {typingUsernames.length === 1 ? 'is' : 'are'} typing
          </Text>
          <Text style={styles.typingDots}>•••</Text>
        </View>
      )}
      <View style={styles.inputRow}>
      {isGroup && (
        <TouchableOpacity
          style={styles.eventBtn}
          onPress={() => setShowActionMenu((v) => !v)}
        >
          <Text style={styles.plusBtnText}>+</Text>
        </TouchableOpacity>
      )}
      <TextInput
        ref={textInputRef}
        style={styles.input}
        placeholder="Message..."
        placeholderTextColor="#999"
        value={text}
        onChangeText={handleTextChange}
        onFocus={() => {
          scrollConversationToLatest(false);
        }}
        multiline
        maxLength={1000}
        autoComplete="off"
        textContentType="none"
        importantForAutofill="no"
        blurOnSubmit={false}
        returnKeyType="send"
        onSubmitEditing={sendMessage}
      />
      <TouchableOpacity
        style={[styles.sendBtn, !text.trim() && styles.sendBtnDisabled]}
        onPress={sendMessage}
        disabled={!text.trim() || sending}
      >
        <Text style={styles.sendBtnText}>↑</Text>
      </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      {isGroup && (
        <TouchableOpacity
          style={styles.groupHeader}
          onPress={() => { setEditGroupName(groupName); setNewGroupAvatarUri(null); setShowGroupSettings(true); }}
        >
          <View style={styles.groupHeaderAvatar}>
            {groupAvatarUrl ? (
              <Image source={{ uri: groupAvatarUrl }} style={styles.groupHeaderAvatarImg} />
            ) : (
              <Text style={styles.groupHeaderAvatarIcon}>👥</Text>
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.groupHeaderName}>{groupName}</Text>
            {memberCount !== null && (
              <Text style={styles.groupMemberCount}>{memberCount} members</Text>
            )}
          </View>
          <Text style={styles.groupEditHint}>Edit</Text>
        </TouchableOpacity>
      )}

      {/* Pinned event banners (up to 3) */}
      {isGroup && pinnedEvents.map((pe) => (
        <TouchableOpacity
          key={pe.id}
          style={styles.pinnedBanner}
          onPress={() => navigation.navigate('EventDetail', { eventId: pe.id })}
          onLongPress={() => Alert.alert('Unpin event?', 'Remove this event from the top of the chat?', [
            { text: 'Unpin', style: 'destructive', onPress: () => pinEvent(pe) },
            { text: 'Cancel', style: 'cancel' },
          ])}
        >
          <Text style={styles.pinnedIcon}>📌</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.pinnedLabel}>Pinned event</Text>
            <Text style={styles.pinnedTitle} numberOfLines={1}>{pe.title}</Text>
          </View>
          {pe.date ? <Text style={styles.pinnedDate}>{pe.date}</Text> : null}
        </TouchableOpacity>
      ))}

      <KeyboardAvoidingView
        style={styles.chatKeyboardAvoid}
        behavior="padding"
        keyboardVerticalOffset={headerHeight}
      >
        <FlatList
          ref={flatListRef}
          style={styles.messageListFlex}
          data={[...messages].reverse()}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.messageList}
          inverted
          maintainVisibleContentPosition={{ minIndexForVisible: 0, autoscrollToTopThreshold: 1 }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          ListEmptyComponent={
            <View style={styles.emptyChat}>
              <Text style={styles.emptyChatText}>
                {isGroup ? `Say hi to the group!` : `Say hi to @${otherUsername}!`}
              </Text>
            </View>
          }
          renderItem={({ item }) => {
          const isMe = item.sender_id === myId;
          const isDeleted = !!item.deleted_at;
          const likeCount = (item.liked_by ?? []).length;
          const iLiked = myId ? (item.liked_by ?? []).includes(myId) : false;
          const hasSharedPost = !isDeleted && !!item.post_id && !!item.shared_post;
          const hasSharedEvent = !isDeleted && !!item.event_id && !!item.shared_event;
          const hasSharedPoll = !isDeleted && !!item.poll_id && !!item.shared_poll;
          const hasSharedAvailability = !isDeleted && !!item.availability_check_id && !!item.shared_availability;
          const hasSharedGroupPlan = !isDeleted && !!item.group_plan_id && !!item.shared_group_plan;
          const showSender = !isDeleted && isGroup && !isMe && !!item.sender;
          const showDmAvatar = !isDeleted && !isGroup && !isMe && !!otherUserProfile;

          const bubbleContent = (
            <>
              {isDeleted ? (
                <View style={styles.deletedMessageRow}>
                  <Text style={styles.deletedMessageText}>Message deleted</Text>
                </View>
              ) : null}
              {hasSharedEvent && (
                <TouchableOpacity
                  style={[styles.eventCard, isMe ? styles.eventCardMe : styles.eventCardThem]}
                  activeOpacity={0.85}
                  onPress={() => navigation.navigate('EventDetail', { eventId: item.shared_event!.id })}
                  onLongPress={() => {
                    if (!isGroup) return;
                    const isPinned = pinnedEvents.some((e) => e.id === item.shared_event!.id);
                    Alert.alert(
                      isPinned ? 'Unpin event?' : 'Pin event?',
                      isPinned
                        ? 'Remove this event from the top of the chat?'
                        : 'Pin this event to the top of the chat for everyone to see?',
                      [
                        { text: isPinned ? 'Unpin' : 'Pin', onPress: () => pinEvent(item.shared_event!) },
                        { text: 'Cancel', style: 'cancel' },
                      ]
                    );
                  }}
                >
                  {item.shared_event!.image_url ? (
                    <Image source={{ uri: item.shared_event!.image_url }} style={styles.eventCardImage} resizeMode="cover" />
                  ) : null}
                  <View style={styles.eventCardBody}>
                    <Text style={styles.eventCardEmoji}>📅</Text>
                    <Text style={styles.eventCardTitle}>{item.shared_event!.title}</Text>
                    {item.shared_event!.date ? <Text style={styles.eventCardDetail}>📆 {item.shared_event!.date}</Text> : null}
                    {item.shared_event!.time ? <Text style={styles.eventCardDetail}>🕐 {item.shared_event!.time}</Text> : null}
                    {item.shared_event!.location ? <Text style={styles.eventCardDetail}>📍 {item.shared_event!.location}</Text> : null}
                    {item.shared_event!.description ? <Text style={styles.eventCardDesc}>{item.shared_event!.description}</Text> : null}
                    {item.shared_event!.creator && (
                      <View style={styles.eventCardCreatorRow}>
                        <View style={styles.eventCardCreatorAvatar}>
                          {item.shared_event!.creator.avatar_url ? (
                            <Image source={{ uri: item.shared_event!.creator.avatar_url }} style={styles.eventCardCreatorAvatarImg} />
                          ) : (
                            <Text style={styles.eventCardCreatorInitial}>
                              {item.shared_event!.creator.username[0]?.toUpperCase()}
                            </Text>
                          )}
                        </View>
                        <Text style={styles.eventCardCreatorName}>@{item.shared_event!.creator.username}</Text>
                      </View>
                    )}
                    <Text style={styles.eventCardTap}>Tap to view details</Text>
                  </View>
                </TouchableOpacity>
              )}
              {hasSharedPoll && (() => {
                const poll = item.shared_poll!;
                const votes = pollVotes[poll.id] ?? {};
                const totalVotes = Object.values(votes).reduce((s, arr) => s + arr.length, 0);
                const myVote = Object.entries(votes).find(([, arr]) => myId && arr.includes(myId));
                const myVoteIndex = myVote ? parseInt(myVote[0]) : null;
                return (
                  <TouchableOpacity
                    style={styles.pollCard}
                    activeOpacity={0.85}
                    onPress={() => navigation.navigate('PollDetail', { pollId: poll.id })}
                  >
                    <Text style={styles.pollEmoji}>📊</Text>
                    <Text style={styles.pollQuestion}>{poll.question}</Text>
                    {poll.options.map((opt: string, idx: number) => {
                      const count = (votes[idx] ?? []).length;
                      const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
                      const voted = myVoteIndex === idx;
                      return (
                        <TouchableOpacity key={idx} style={styles.pollOption} onPress={() => votePoll(poll.id, idx)}>
                          <View style={[styles.pollBar, { width: `${pct}%` as any }]} />
                          <View style={styles.pollOptionRow}>
                            <Text style={[styles.pollOptionText, voted && styles.pollOptionTextVoted]}>{opt}</Text>
                            <Text style={styles.pollPct}>{totalVotes > 0 ? `${pct}%` : ''}</Text>
                          </View>
                          {voted && <Text style={styles.pollCheck}>✓</Text>}
                        </TouchableOpacity>
                      );
                    })}
                    <Text style={styles.pollTotal}>{totalVotes} vote{totalVotes !== 1 ? 's' : ''}</Text>
                  </TouchableOpacity>
                );
              })()}
              {hasSharedAvailability && (() => {
                const availability = item.shared_availability!;
                const slotVotes = availabilityVotes[availability.id] ?? {};
                const summary = summarizeAvailability(availability.slots ?? [], slotVotes);
                const subtitle = formatAvailabilitySubtitle(availability);
                return (
                  <TouchableOpacity
                    style={[styles.availabilityCard, isMe ? styles.availabilityCardMe : styles.availabilityCardThem]}
                    activeOpacity={0.9}
                    onPress={() => navigation.navigate('AvailabilityCheckDetail', { availabilityCheckId: availability.id })}
                    onLongPress={() => {
                      if (!isMe || isDeleted) return;
                      Alert.alert(
                        'Delete message?',
                        'This will replace the message with a deleted message note in the chat.',
                        [
                          { text: 'Cancel', style: 'cancel' },
                          { text: 'Delete', style: 'destructive', onPress: () => softDeleteMessage(item) },
                        ]
                      );
                    }}
                  >
                    <Text style={styles.availabilityEyebrow}>Availability check</Text>
                    <Text style={styles.availabilityTitle}>{availability.title}</Text>
                    {subtitle ? <Text style={styles.availabilitySubtitle}>{subtitle}</Text> : null}
                    {summary.best_slot ? (
                      <View style={styles.availabilityBestFit}>
                        <Text style={styles.availabilityBestFitLabel}>Best fit</Text>
                        <View style={styles.availabilityBestFitRow}>
                          <Text style={styles.availabilityBestFitText}>
                            {summary.best_slot.slot.label}
                          </Text>
                          <Text style={styles.availabilityBestFitCount}>
                            {summary.best_slot.count}/{Math.max(summary.respondent_ids.length, summary.best_slot.count)}
                          </Text>
                        </View>
                      </View>
                    ) : (
                      <Text style={styles.availabilityHint}>Be the first to mark a slot.</Text>
                    )}
                    {(availability.slots ?? []).map((slot: AvailabilitySlot) => {
                      const voterIds = slotVotes[slot.id] ?? [];
                      const selected = myId ? voterIds.includes(myId) : false;
                      return (
                        <TouchableOpacity
                          key={slot.id}
                          style={[styles.availabilityOption, selected && styles.availabilityOptionSelected]}
                          onPress={() => toggleAvailabilityVote(availability.id, slot.id)}
                        >
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.availabilityOptionLabel, selected && styles.availabilityOptionLabelSelected]}>
                              {slot.label}
                            </Text>
                            <Text style={[styles.availabilityOptionMeta, selected && styles.availabilityOptionMetaSelected]}>
                              {formatAvailabilitySlotWindow(slot)}
                            </Text>
                          </View>
                          <View style={styles.availabilitySlotRight}>
                            {renderAvailabilityVoterFaces(voterIds, selected)}
                            {voterIds.length > 0 && (
                              <Text style={[styles.availabilitySlotCount, selected && styles.availabilitySlotCountSelected]}>
                                {voterIds.length}
                              </Text>
                            )}
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                    <Text style={styles.availabilityFooter}>
                      {summary.respondent_ids.length} voter{summary.respondent_ids.length !== 1 ? 's' : ''} · Tap for details
                    </Text>
                  </TouchableOpacity>
                );
              })()}
              {hasSharedGroupPlan && (() => {
                void voterDisplayEpoch;
                const plan = item.shared_group_plan!;
                const planId = plan.id;
                const buckets = groupPlanRsvps[planId] ?? emptyGroupPlanRsvpBuckets();
                const myRsvp: GroupPlanResponse | null = myId && buckets.yes.includes(myId)
                  ? 'yes'
                  : myId && buckets.no.includes(myId)
                    ? 'no'
                    : myId && buckets.maybe.includes(myId)
                      ? 'maybe'
                      : null;
                const pill = (label: string, response: GroupPlanResponse, count: number) => (
                  <TouchableOpacity
                    key={response}
                    style={[styles.groupPlanPill, myRsvp === response && styles.groupPlanPillSelected]}
                    onPress={() => setGroupPlanRsvpResponse(planId, response)}
                  >
                    <Text style={[styles.groupPlanPillLabel, myRsvp === response && styles.groupPlanPillLabelSelected]}>
                      {label} {count > 0 ? count : ''}
                    </Text>
                  </TouchableOpacity>
                );
                return (
                  <TouchableOpacity
                    style={[styles.groupPlanCard, isMe ? styles.groupPlanCardMe : styles.groupPlanCardThem]}
                    activeOpacity={0.9}
                    onLongPress={() => {
                      if (!isMe || isDeleted) return;
                      Alert.alert(
                        'Delete message?',
                        'This will replace the message with a deleted message note in the chat.',
                        [
                          { text: 'Cancel', style: 'cancel' },
                          { text: 'Delete', style: 'destructive', onPress: () => softDeleteMessage(item) },
                        ]
                      );
                    }}
                  >
                    <Text style={styles.groupPlanEyebrow}>Quick plan</Text>
                    <Text style={styles.groupPlanTitle}>{plan.title}</Text>
                    {plan.location ? <Text style={styles.groupPlanLocationLine}>📍 {plan.location}</Text> : null}
                    {plan.details ? (
                      <Text style={styles.groupPlanDetailsLine} numberOfLines={1}>
                        {plan.details}
                      </Text>
                    ) : null}
                    <View style={styles.groupPlanPillRow}>
                      {pill('Yes', 'yes', buckets.yes.length)}
                      {pill('No', 'no', buckets.no.length)}
                      {pill('Maybe', 'maybe', buckets.maybe.length)}
                    </View>
                    {(['yes', 'no', 'maybe'] as const).map((k) => {
                      const ids = buckets[k];
                      if (ids.length === 0) return null;
                      const prefix = k === 'yes' ? 'Yes' : k === 'no' ? 'No' : 'Maybe';
                      return (
                        <View key={k} style={styles.groupPlanWhoRow}>
                          <Text style={styles.groupPlanWhoLabel}>{prefix}</Text>
                          {renderGroupPlanVoters(ids)}
                        </View>
                      );
                    })}
                    {isGroup && myId ? (
                      <TouchableOpacity
                        style={styles.groupPlanSaveToMine}
                        onPress={() => savePostedPlanToMyTemplates(plan)}
                        disabled={savingPostedPlanId === plan.id}
                        hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                      >
                        <Text style={styles.groupPlanSaveToMineText}>
                          {savingPostedPlanId === plan.id ? 'Saving…' : 'Save to my quick plans'}
                        </Text>
                      </TouchableOpacity>
                    ) : null}
                  </TouchableOpacity>
                );
              })()}

              {hasSharedPost && (
                <TouchableOpacity
                  style={[styles.sharedPost, isMe ? styles.sharedPostMe : styles.sharedPostThem]}
                  onPress={() => navigation.navigate('PostDetail', { post: item.shared_post })}
                  activeOpacity={0.85}
                >
                  <Image source={{ uri: item.shared_post!.media_url }} style={styles.sharedPostImage} />
                  <View style={styles.sharedPostInfo}>
                    <Text style={styles.sharedPostUser}>@{item.shared_post!.user?.username}</Text>
                    {item.shared_post!.caption ? (
                      <Text style={styles.sharedPostCaption} numberOfLines={2}>{item.shared_post!.caption}</Text>
                    ) : null}
                  </View>
                </TouchableOpacity>
              )}
              {!isDeleted && item.body ? (
                <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem]}>
                  <Text style={[styles.bubbleText, isMe ? styles.bubbleTextMe : styles.bubbleTextThem]}>
                    {item.body}
                  </Text>
                  <Text style={[styles.bubbleTime, isMe ? styles.bubbleTimeMe : styles.bubbleTimeThem]}>
                    {timeAgo(item.created_at)}
                  </Text>
                </View>
              ) : null}
              {!isDeleted && likeCount > 0 && (
                <View style={[styles.likeRow, isMe ? styles.likeRowMe : styles.likeRowThem]}>
                  <Text style={[styles.likeHeart, iLiked && styles.likeHeartActive]}>♥</Text>
                  {likeCount > 1 && <Text style={styles.likeCount}>{likeCount}</Text>}
                </View>
              )}
            </>
          );

          return (
            <TouchableOpacity
              activeOpacity={1}
              onPress={() => handleMessageTap(item)}
              onLongPress={() => {
                if (!isMe || isDeleted) return;
                Alert.alert(
                  'Delete message?',
                  'This will replace the message with a deleted message note in the chat.',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Delete', style: 'destructive', onPress: () => softDeleteMessage(item) },
                  ]
                );
              }}
            >
              {showSender ? (
                <View style={styles.groupMessageRow}>
                  <TouchableOpacity onPress={() => navigation.navigate('UserProfile', { userId: item.sender!.id })}>
                    <View style={styles.senderAvatar}>
                      {item.sender!.avatar_url ? (
                        <Image source={{ uri: item.sender!.avatar_url }} style={styles.senderAvatarImg} />
                      ) : (
                        <Text style={styles.senderAvatarInitial}>
                          {item.sender!.username[0]?.toUpperCase()}
                        </Text>
                      )}
                    </View>
                  </TouchableOpacity>
                  <View style={styles.groupMessageContent}>
                    <TouchableOpacity onPress={() => navigation.navigate('UserProfile', { userId: item.sender!.id })}>
                      <Text style={styles.senderUsername}>@{item.sender!.username}</Text>
                    </TouchableOpacity>
                    {bubbleContent}
                  </View>
                </View>
              ) : showDmAvatar ? (
                <View style={styles.groupMessageRow}>
                  <TouchableOpacity onPress={() => navigation.navigate('UserProfile', { userId: otherUserProfile!.id })}>
                    <View style={styles.senderAvatar}>
                      {otherUserProfile!.avatar_url ? (
                        <Image source={{ uri: otherUserProfile!.avatar_url }} style={styles.senderAvatarImg} />
                      ) : (
                        <Text style={styles.senderAvatarInitial}>
                          {otherUserProfile!.username[0]?.toUpperCase()}
                        </Text>
                      )}
                    </View>
                  </TouchableOpacity>
                  <View style={styles.groupMessageContent}>
                    {bubbleContent}
                  </View>
                </View>
              ) : (
                bubbleContent
              )}
            </TouchableOpacity>
          );
          }}
        />
        {isGroup && showActionMenu && (
          <View style={StyleSheet.absoluteFillObject} pointerEvents="box-none">
            <TouchableOpacity
              style={[styles.actionMenuBackdrop, { bottom: keyboardHeight + composerHeight }]}
              activeOpacity={1}
              onPress={() => setShowActionMenu(false)}
            />
            <View
              style={[styles.actionMenuFloat, { bottom: keyboardHeight + composerHeight + ACTION_MENU_BOTTOM_GAP }]}
            >
              {actionMenu}
            </View>
          </View>
        )}
        {composer}
      </KeyboardAvoidingView>

      <Modal visible={showCreateAvailability} animationType="slide" transparent onRequestClose={resetAvailabilityComposer}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'height' : 'padding'} keyboardVerticalOffset={0}>
          <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={resetAvailabilityComposer} />
          <View style={styles.createEventSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Availability Check</Text>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Text style={styles.availabilityComposerLabel}>Quick options</Text>
              <Text style={styles.availabilityComposerHint}>Tap once to generate and send a lightweight check.</Text>
              <View style={styles.availabilityPresetList}>
                {[
                  { key: 'tonight', label: 'Tonight' },
                  { key: 'tomorrow', label: 'Tomorrow' },
                  { key: 'this_weekend', label: 'This weekend' },
                  { key: 'next_week', label: 'Next week' },
                ].map((preset) => (
                  <TouchableOpacity
                    key={preset.key}
                    style={styles.availabilityPresetButton}
                    onPress={() => {
                      createAvailabilityCheck(preset.key as AvailabilityPreset);
                    }}
                    disabled={creatingAvailability}
                  >
                    <Text style={styles.availabilityPresetButtonText}>{preset.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.availabilityCustomEntry}>
                <Text style={styles.availabilityCustomEntryLabel}>Or build your own</Text>
                <TouchableOpacity
                  style={[
                    styles.availabilityPresetButton,
                    showCustomAvailabilityOptions && styles.availabilityPresetButtonActive,
                  ]}
                  onPress={() => {
                    setShowCustomAvailabilityOptions((value) => !value);
                    setShowCustomStartPicker(false);
                    setShowCustomEndPicker(false);
                  }}
                  disabled={creatingAvailability}
                >
                  <Text
                    style={[
                      styles.availabilityPresetButtonText,
                      showCustomAvailabilityOptions && styles.availabilityPresetButtonTextActive,
                    ]}
                  >
                    Custom
                  </Text>
                </TouchableOpacity>
              </View>

              {showCustomAvailabilityOptions && (
                <>
                  <View style={styles.availabilityComposerDivider} />

                  <Text style={styles.availabilityComposerLabel}>Custom</Text>
                  <Text style={styles.availabilityComposerHint}>Pick a date range and the dayparts to include.</Text>
                  <Text style={styles.availabilityComposerRule}>
                    Detailed slots are available for up to {CUSTOM_AVAILABILITY_MAX_DETAILED_DAYS} days.
                  </Text>

                  <TouchableOpacity
                    style={styles.pickerBtn}
                    onPress={() => { setShowCustomStartPicker((value) => !value); setShowCustomEndPicker(false); }}
                  >
                    <Text style={styles.pickerBtnIcon}>📆</Text>
                    <Text style={styles.pickerBtnText}>Start {formatShortDate(customStartDate)}</Text>
                  </TouchableOpacity>
                  {showCustomStartPicker && (
                    <DateTimePicker
                      value={customStartDate}
                      mode="date"
                      display="spinner"
                      minimumDate={new Date()}
                      textColor="#1a1a1a"
                      onChange={(_: any, date?: Date) => {
                        if (Platform.OS === 'android') setShowCustomStartPicker(false);
                        if (!date) return;
                        setCustomStartDate(date);
                        if (date.getTime() > customEndDate.getTime()) setCustomEndDate(date);
                      }}
                      style={styles.inlinePicker}
                    />
                  )}

                  <TouchableOpacity
                    style={styles.pickerBtn}
                    onPress={() => { setShowCustomEndPicker((value) => !value); setShowCustomStartPicker(false); }}
                  >
                    <Text style={styles.pickerBtnIcon}>🗓</Text>
                    <Text style={styles.pickerBtnText}>End {formatShortDate(customEndDate)}</Text>
                  </TouchableOpacity>
                  {showCustomEndPicker && (
                    <DateTimePicker
                      value={customEndDate}
                      mode="date"
                      display="spinner"
                      minimumDate={customStartDate}
                      textColor="#1a1a1a"
                      onChange={(_: any, date?: Date) => {
                        if (Platform.OS === 'android') setShowCustomEndPicker(false);
                        if (date) setCustomEndDate(date);
                      }}
                      style={styles.inlinePicker}
                    />
                  )}

                  <View style={styles.availabilityDaypartRow}>
                    {(['morning', 'afternoon', 'evening'] as AvailabilityDaypart[]).map((daypart) => {
                      const selected = customDayparts.includes(daypart);
                      return (
                        <TouchableOpacity
                          key={daypart}
                          style={[styles.availabilityDaypartChip, selected && styles.availabilityDaypartChipSelected]}
                          onPress={() => toggleCustomDaypart(daypart)}
                        >
                          <Text style={[styles.availabilityDaypartChipText, selected && styles.availabilityDaypartChipTextSelected]}>
                            {daypart[0].toUpperCase()}{daypart.slice(1)}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  {customDayparts.length > 0 && (
                    <View style={styles.availabilityPreviewBox}>
                      <Text style={styles.availabilityPreviewTitle}>Custom preview</Text>
                      {customAvailabilityPreview.generation_mode === 'daily' ? (
                        <Text style={styles.availabilityPreviewText}>
                          This range is being simplified to one broader option per day.
                        </Text>
                      ) : (
                        <Text style={styles.availabilityPreviewText}>
                          This range will use detailed daypart slots.
                        </Text>
                      )}
                      {customAvailabilityPreview.truncated ? (
                        <Text style={styles.availabilityPreviewText}>
                          Only the first {CUSTOM_AVAILABILITY_MAX_SLOTS} options will be included.
                        </Text>
                      ) : null}
                      <Text style={styles.availabilityPreviewMeta}>
                        {customAvailabilityPreview.slots.length} option{customAvailabilityPreview.slots.length !== 1 ? 's' : ''} will be created
                      </Text>
                    </View>
                  )}

                  <TouchableOpacity
                    style={[styles.saveBtn, (customDayparts.length === 0 || creatingAvailability) && styles.saveBtnDisabled]}
                    onPress={() => createAvailabilityCheck('custom')}
                    disabled={customDayparts.length === 0 || creatingAvailability}
                  >
                    {creatingAvailability
                      ? <ActivityIndicator color="#fff" />
                      : <Text style={styles.saveBtnText}>Create Custom Check</Text>
                    }
                  </TouchableOpacity>
                </>
              )}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
      {/* Create event modal */}
      <Modal visible={showCreateEvent} animationType="slide" transparent onRequestClose={() => setShowCreateEvent(false)}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'height' : 'padding'} keyboardVerticalOffset={0}>
          <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setShowCreateEvent(false)} />
          <View style={styles.createEventSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Create Event</Text>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <TextInput
                style={styles.createEventInput}
                placeholder="Event title (required)"
                placeholderTextColor="#999"
                value={eventTitle}
                onChangeText={setEventTitle}
              />

              {/* Photo picker */}
              <TouchableOpacity style={styles.eventPhotoPicker} onPress={pickEventImage}>
                {eventImageUri ? (
                  <Image source={{ uri: eventImageUri }} style={styles.eventPhotoPreview} />
                ) : (
                  <View style={styles.eventPhotoEmpty}>
                    <Text style={styles.eventPhotoIcon}>🖼</Text>
                    <Text style={styles.eventPhotoLabel}>Add a photo</Text>
                  </View>
                )}
                {eventImageUri && (
                  <TouchableOpacity
                    style={styles.eventPhotoClear}
                    onPress={() => setEventImageUri(null)}
                  >
                    <Text style={styles.pickerClear}>✕</Text>
                  </TouchableOpacity>
                )}
              </TouchableOpacity>

              {/* Date picker */}
              <TouchableOpacity
                style={styles.pickerBtn}
                onPress={() => { setShowDatePicker((v) => !v); setShowTimePicker(false); }}
              >
                <Text style={styles.pickerBtnIcon}>📆</Text>
                <Text style={[styles.pickerBtnText, !selectedDate && styles.pickerBtnPlaceholder]}>
                  {selectedDate ? formatDate(selectedDate) : 'Select date'}
                </Text>
                {selectedDate && (
                  <TouchableOpacity onPress={() => { setSelectedDate(null); setShowDatePicker(false); }}>
                    <Text style={styles.pickerClear}>✕</Text>
                  </TouchableOpacity>
                )}
              </TouchableOpacity>
              {showDatePicker && (
                <DateTimePicker
                  value={selectedDate ?? new Date()}
                  mode="date"
                  display="spinner"
                  minimumDate={new Date()}
                  textColor="#1a1a1a"
                  onChange={(_: any, date?: Date) => {
                    if (Platform.OS === 'android') setShowDatePicker(false);
                    if (date) setSelectedDate(date);
                  }}
                  style={styles.inlinePicker}
                />
              )}

              {/* Time picker */}
              <TouchableOpacity
                style={styles.pickerBtn}
                onPress={() => { setShowTimePicker((v) => !v); setShowDatePicker(false); }}
              >
                <Text style={styles.pickerBtnIcon}>🕐</Text>
                <Text style={[styles.pickerBtnText, !selectedTime && styles.pickerBtnPlaceholder]}>
                  {selectedTime ? formatTime(selectedTime) : 'Select time'}
                </Text>
                {selectedTime && (
                  <TouchableOpacity onPress={() => { setSelectedTime(null); setShowTimePicker(false); }}>
                    <Text style={styles.pickerClear}>✕</Text>
                  </TouchableOpacity>
                )}
              </TouchableOpacity>
              {showTimePicker && (
                <DateTimePicker
                  value={selectedTime ?? new Date()}
                  mode="time"
                  display="spinner"
                  textColor="#1a1a1a"
                  onChange={(_: any, time?: Date) => {
                    if (Platform.OS === 'android') setShowTimePicker(false);
                    if (time) setSelectedTime(time);
                  }}
                  style={styles.inlinePicker}
                />
              )}

              {/* Location autocomplete */}
              <View style={styles.locationWrapper}>
                <View style={styles.pickerBtn}>
                  <Text style={styles.pickerBtnIcon}>📍</Text>
                  <TextInput
                    style={styles.locationInput}
                    placeholder="Search location..."
                    placeholderTextColor="#999"
                    value={eventLocation || locationQuery}
                    onChangeText={(t) => { if (eventLocation) setEventLocation(''); debouncedLocationSearch(t); }}
                    autoCorrect={false}
                  />
                  {(locationQuery || eventLocation) ? (
                    <TouchableOpacity onPress={() => { setEventLocation(''); setLocationQuery(''); setLocationSuggestions([]); setLocationCoords(null); }}>
                      <Text style={styles.pickerClear}>✕</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
                {locationSearching && <ActivityIndicator size="small" color="#888" style={{ marginTop: 6 }} />}
                {locationSuggestions.length > 0 && (
                  <View style={styles.locationDropdown}>
                    {locationSuggestions.map((s, i) => (
                      <TouchableOpacity
                        key={i}
                        style={[styles.locationSuggestion, i < locationSuggestions.length - 1 && styles.locationSuggestionBorder]}
                        onPress={() => { setEventLocation(s.name); setLocationQuery(s.name); setLocationCoords({ lat: s.lat, lon: s.lon }); setLocationSuggestions([]); }}
                      >
                        <Text style={styles.locationSuggestionText} numberOfLines={2}>{s.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>

              <TextInput
                style={styles.createEventInputMulti}
                placeholder="Description (optional)"
                placeholderTextColor="#999"
                value={eventDescription}
                onChangeText={setEventDescription}
                multiline
              />
              <TouchableOpacity
                style={[styles.saveBtn, (!eventTitle.trim() || creatingEvent) && styles.saveBtnDisabled]}
                onPress={createEvent}
                disabled={!eventTitle.trim() || creatingEvent}
              >
                {creatingEvent
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.saveBtnText}>Create Event</Text>
                }
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
      {/* Create poll modal */}
      <Modal visible={showCreatePoll} animationType="slide" transparent onRequestClose={() => setShowCreatePoll(false)}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'height' : 'padding'} keyboardVerticalOffset={0}>
          <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setShowCreatePoll(false)} />
          <View style={styles.createEventSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Create Poll</Text>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <TextInput
                style={styles.pollInput}
                placeholder="Ask a question..."
                placeholderTextColor="#999"
                value={pollQuestion}
                onChangeText={setPollQuestion}
              />
              {pollOptions.map((opt, i) => (
                <View key={i} style={styles.pollOptionInputRow}>
                  <TextInput
                    style={styles.pollOptionInput}
                    placeholder={`Option ${i + 1}`}
                    placeholderTextColor="#999"
                    value={opt}
                    onChangeText={(t) => setPollOptions((prev) => prev.map((o, j) => j === i ? t : o))}
                  />
                  {pollOptions.length > 2 && (
                    <TouchableOpacity style={styles.pollRemoveOption} onPress={() => setPollOptions((prev) => prev.filter((_, j) => j !== i))}>
                      <Text style={styles.pollRemoveOptionText}>✕</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ))}
              {pollOptions.length < 6 && (
                <TouchableOpacity style={styles.pollAddOption} onPress={() => setPollOptions((prev) => [...prev, ''])}>
                  <Text style={styles.pollAddOptionText}>+ Add option</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[styles.saveBtn, (!pollQuestion.trim() || pollOptions.filter((o) => o.trim()).length < 2 || creatingPoll) && styles.saveBtnDisabled]}
                onPress={createPoll}
                disabled={!pollQuestion.trim() || pollOptions.filter((o) => o.trim()).length < 2 || creatingPoll}
              >
                {creatingPoll
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.saveBtnText}>Create Poll</Text>
                }
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={showQuickPlansPicker}
        animationType="slide"
        transparent
        onRequestClose={() => setShowQuickPlansPicker(false)}
      >
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'height' : 'padding'} keyboardVerticalOffset={0}>
          <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setShowQuickPlansPicker(false)} />
          <View style={styles.createEventSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Quick plans</Text>
            <Text style={styles.planPickerHint}>Pick a saved plan or create a new one for this chat. Long-press a saved plan to edit or delete.</Text>
            <TouchableOpacity
              style={styles.planPickerNewRow}
              onPress={openCreateGroupPlanFromPicker}
              disabled={creatingGroupPlan}
            >
              <Text style={styles.planPickerNewIcon}>＋</Text>
              <Text style={styles.planPickerNewLabel}>Create new quick plan</Text>
            </TouchableOpacity>
            {loadingPlanTemplates ? (
              <ActivityIndicator style={{ marginVertical: 24 }} color="#1a1a1a" />
            ) : planTemplates.length === 0 ? (
              <Text style={styles.planPickerEmpty}>No saved quick plans yet. Save one when you create a plan.</Text>
            ) : (
              <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} style={{ maxHeight: Dimensions.get('window').height * 0.45 }}>
                {planTemplates.map((t) => (
                  <TouchableOpacity
                    key={t.id}
                    style={styles.planPickerSavedRow}
                    onPress={() => instantiateGroupPlanTemplate(t)}
                    onLongPress={() => promptSavedQuickPlanActions(t)}
                    delayLongPress={400}
                    disabled={creatingGroupPlan}
                  >
                    <Text style={styles.planPickerSavedTitle} numberOfLines={2}>{t.title}</Text>
                    {t.location ? <Text style={styles.planPickerSavedLocation} numberOfLines={1}>📍 {t.location}</Text> : null}
                    {t.details ? (
                      <Text style={styles.planPickerSavedDetails} numberOfLines={1}>{t.details}</Text>
                    ) : null}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
            {creatingGroupPlan ? (
              <View style={styles.planPickerSending}>
                <ActivityIndicator color="#1a1a1a" />
                <Text style={styles.planPickerSendingText}>Posting…</Text>
              </View>
            ) : null}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={showEditSavedQuickPlan} animationType="slide" transparent onRequestClose={resetEditSavedQuickPlan}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'height' : 'padding'} keyboardVerticalOffset={0}>
          <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={resetEditSavedQuickPlan} />
          <View style={styles.createEventSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Edit saved quick plan</Text>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <TextInput
                style={styles.pollInput}
                placeholder="Title (required)"
                placeholderTextColor="#999"
                value={editSavedPlanTitle}
                onChangeText={setEditSavedPlanTitle}
              />
              <TextInput
                style={styles.pollInput}
                placeholder="Location (optional)"
                placeholderTextColor="#999"
                value={editSavedPlanLocation}
                onChangeText={setEditSavedPlanLocation}
              />
              <Text style={styles.groupPlanDetailsFieldLabel}>Details (optional)</Text>
              <TextInput
                style={styles.groupPlanDetailsInput}
                placeholder="Short note visible on the card"
                placeholderTextColor="#aaa"
                value={editSavedPlanDetails}
                onChangeText={(t) => setEditSavedPlanDetails(t.slice(0, QUICK_PLAN_DETAILS_MAX_LEN))}
                maxLength={QUICK_PLAN_DETAILS_MAX_LEN}
                numberOfLines={1}
              />
              <TouchableOpacity
                style={[styles.saveBtn, (!editSavedPlanTitle.trim() || savingEditSavedPlan) && styles.saveBtnDisabled]}
                onPress={submitEditSavedQuickPlan}
                disabled={!editSavedPlanTitle.trim() || savingEditSavedPlan}
              >
                {savingEditSavedPlan
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.saveBtnText}>Save changes</Text>
                }
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={showCreateGroupPlan} animationType="slide" transparent onRequestClose={resetGroupPlanComposer}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'height' : 'padding'} keyboardVerticalOffset={0}>
          <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={resetGroupPlanComposer} />
          <View style={styles.createEventSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>New quick plan</Text>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <TextInput
                style={styles.pollInput}
                placeholder="Title (required)"
                placeholderTextColor="#999"
                value={groupPlanTitle}
                onChangeText={setGroupPlanTitle}
              />
              <TextInput
                style={styles.pollInput}
                placeholder="Location (optional)"
                placeholderTextColor="#999"
                value={groupPlanLocation}
                onChangeText={setGroupPlanLocation}
              />
              <Text style={styles.groupPlanDetailsFieldLabel}>Details (optional)</Text>
              <TextInput
                style={styles.groupPlanDetailsInput}
                placeholder="Short note visible on the card"
                placeholderTextColor="#aaa"
                value={groupPlanDetails}
                onChangeText={(t) => setGroupPlanDetails(t.slice(0, QUICK_PLAN_DETAILS_MAX_LEN))}
                maxLength={QUICK_PLAN_DETAILS_MAX_LEN}
                numberOfLines={1}
              />
              <View style={styles.groupPlanSaveRow}>
                <Text style={styles.groupPlanSaveLabel}>Save to my quick plans</Text>
                <Switch
                  value={groupPlanSaveToMyList}
                  onValueChange={setGroupPlanSaveToMyList}
                  trackColor={{ false: '#ccc', true: '#1a1a1a' }}
                  thumbColor="#fff"
                />
              </View>
              <TouchableOpacity
                style={[styles.saveBtn, (!groupPlanTitle.trim() || creatingGroupPlan) && styles.saveBtnDisabled]}
                onPress={submitNewGroupPlan}
                disabled={!groupPlanTitle.trim() || creatingGroupPlan}
              >
                {creatingGroupPlan
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.saveBtnText}>Send to chat</Text>
                }
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Group settings modal */}
      <Modal visible={showGroupSettings} animationType="slide" transparent onRequestClose={() => setShowGroupSettings(false)}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior="padding">
          <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setShowGroupSettings(false)} />
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Group Settings</Text>

            {/* Avatar picker */}
            <TouchableOpacity style={styles.groupAvatarPicker} onPress={pickGroupAvatar}>
              {newGroupAvatarUri || groupAvatarUrl ? (
                <Image source={{ uri: newGroupAvatarUri ?? groupAvatarUrl! }} style={styles.groupAvatarPickerImg} />
              ) : (
                <Text style={styles.groupAvatarPickerIcon}>👥</Text>
              )}
              <View style={styles.groupAvatarBadge}>
                <Text style={styles.groupAvatarBadgeText}>Edit</Text>
              </View>
            </TouchableOpacity>

            <TextInput
              style={styles.groupNameInput}
              value={editGroupName}
              onChangeText={setEditGroupName}
              placeholder="Group name..."
              placeholderTextColor="#999"
            />

            <TouchableOpacity
              style={[styles.saveBtn, (!editGroupName.trim() || savingGroup) && styles.saveBtnDisabled]}
              onPress={saveGroupSettings}
              disabled={!editGroupName.trim() || savingGroup}
            >
              {savingGroup
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.saveBtnText}>Save</Text>
              }
            </TouchableOpacity>

            {myId === groupCreatedBy && (
              <TouchableOpacity
                style={[styles.saveBtn, { backgroundColor: '#e0245e', marginTop: 12 }]}
                onPress={() => { setShowGroupSettings(false); deleteGroup(); }}
              >
                <Text style={styles.saveBtnText}>Delete Group</Text>
              </TouchableOpacity>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fafaf8' },
  chatKeyboardAvoid: { flex: 1 },
  composerContainer: {
    width: '100%',
    flexShrink: 0,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  groupHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10, paddingHorizontal: 16,
    backgroundColor: '#f0f0f0', borderBottomWidth: 1, borderBottomColor: '#e8e8e8',
  },
  groupHeaderAvatar: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#e0e0e0', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  groupHeaderAvatarImg: { width: 36, height: 36 },
  groupHeaderAvatarIcon: { fontSize: 18 },
  groupHeaderName: { fontSize: 13, fontWeight: '700', color: '#1a1a1a' },
  groupMemberCount: { fontSize: 11, color: '#888', marginTop: 1 },
  groupEditHint: { fontSize: 12, color: '#888' },
  messageListFlex: { flex: 1 },
  messageList: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    gap: 4,
    flexGrow: 1,
  },
  emptyChat: { flex: 1, alignItems: 'center', justifyContent: 'center', marginTop: 80 },
  emptyChatText: { fontSize: 15, color: '#aaa' },
  groupMessageRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginBottom: 2 },
  senderAvatar: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: '#e0e0e0', alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden', marginBottom: 4,
  },
  senderAvatarImg: { width: 32, height: 32 },
  senderAvatarInitial: { fontSize: 12, fontWeight: '600', color: '#888' },
  groupMessageContent: { flex: 1 },
  senderUsername: { fontSize: 11, fontWeight: '600', color: '#888', marginBottom: 3, marginLeft: 4 },
  bubble: {
    maxWidth: '75%', paddingHorizontal: 14, paddingVertical: 9,
    borderRadius: 18, marginBottom: 2,
  },
  bubbleMe: { alignSelf: 'flex-end', backgroundColor: '#1a1a1a', borderBottomRightRadius: 4 },
  bubbleThem: { alignSelf: 'flex-start', backgroundColor: '#e8e8e8', borderBottomLeftRadius: 4 },
  bubbleText: { fontSize: 15, lineHeight: 20 },
  bubbleTextMe: { color: '#fff' },
  bubbleTextThem: { color: '#1a1a1a' },
  bubbleTime: { fontSize: 10, marginTop: 3 },
  bubbleTimeMe: { color: 'rgba(255,255,255,0.6)', textAlign: 'right' },
  bubbleTimeThem: { color: '#aaa' },
  likeRow: { flexDirection: 'row', alignItems: 'center', gap: 2, marginBottom: 6, marginTop: -2 },
  likeRowMe: { justifyContent: 'flex-end', paddingRight: 6 },
  likeRowThem: { justifyContent: 'flex-start', paddingLeft: 6 },
  likeHeart: { fontSize: 12, color: '#ccc' },
  likeHeartActive: { color: '#e0245e' },
  likeCount: { fontSize: 11, color: '#aaa' },
  deletedMessageRow: {
    alignSelf: 'center',
    marginBottom: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  deletedMessageText: {
    fontSize: 12,
    color: '#999',
    fontStyle: 'italic',
  },
  sharedPost: {
    maxWidth: '75%', borderRadius: 12, overflow: 'hidden',
    marginBottom: 4, borderWidth: 1, borderColor: '#e0e0e0', backgroundColor: '#fff',
  },
  sharedPostMe: { alignSelf: 'flex-end' },
  sharedPostThem: { alignSelf: 'flex-start' },
  sharedPostImage: { width: SCREEN_WIDTH * 0.6, height: SCREEN_WIDTH * 0.6 },
  sharedPostInfo: { padding: 8 },
  sharedPostUser: { fontSize: 12, fontWeight: '600', color: '#1a1a1a', marginBottom: 2 },
  sharedPostCaption: { fontSize: 12, color: '#555' },
  inputRow: {
    flexDirection: 'row', alignItems: 'flex-end',
    paddingHorizontal: 12, paddingVertical: 8, gap: 8,
    backgroundColor: '#fff',
  },
  input: {
    flex: 1, minHeight: 40, maxHeight: 100,
    backgroundColor: '#f5f5f5', borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, color: '#1a1a1a',
  },
  sendBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#1a1a1a', alignItems: 'center', justifyContent: 'center',
  },
  sendBtnDisabled: { backgroundColor: '#ccc' },
  sendBtnText: { color: '#fff', fontSize: 20, fontWeight: '700' },
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)' },
  modalSheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 24, paddingBottom: 40,
  },
  modalHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#ddd', alignSelf: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 16, fontWeight: '700', color: '#1a1a1a', textAlign: 'center', marginBottom: 20 },
  groupAvatarPicker: { alignSelf: 'center', marginBottom: 20, alignItems: 'center' },
  groupAvatarPickerImg: { width: 80, height: 80, borderRadius: 40 },
  groupAvatarPickerIcon: { fontSize: 40, width: 80, height: 80, borderRadius: 40, backgroundColor: '#e0e0e0', textAlign: 'center', lineHeight: 80 },
  groupAvatarBadge: { marginTop: 8, paddingHorizontal: 14, paddingVertical: 5, backgroundColor: '#1a1a1a', borderRadius: 20 },
  groupAvatarBadgeText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  groupNameInput: {
    width: '100%', height: 48, backgroundColor: '#f5f5f5',
    borderRadius: 10, paddingHorizontal: 14, fontSize: 15, color: '#1a1a1a', marginBottom: 16,
  },
  saveBtn: {
    width: '100%', height: 50, backgroundColor: '#1a1a1a',
    borderRadius: 10, alignItems: 'center', justifyContent: 'center',
  },
  saveBtnDisabled: { backgroundColor: '#ccc' },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  eventCard: { width: SCREEN_WIDTH * 0.72, borderRadius: 12, backgroundColor: '#1a1a1a', marginBottom: 4, overflow: 'hidden' },
  eventCardMe: { alignSelf: 'flex-end' },
  eventCardThem: { alignSelf: 'flex-start' },
  eventCardEmoji: { fontSize: 20, marginBottom: 6 },
  eventCardTitle: { fontSize: 15, fontWeight: '700', color: '#fff', marginBottom: 6 },
  eventCardDetail: { fontSize: 13, color: 'rgba(255,255,255,0.8)', marginTop: 3 },
  eventCardDesc: { fontSize: 13, color: 'rgba(255,255,255,0.6)', marginTop: 6, fontStyle: 'italic' },
  eventBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#1a1a1a', alignItems: 'center', justifyContent: 'center',
  },
  plusBtnText: { fontSize: 22, color: '#fff', fontWeight: '300', lineHeight: 26 },
  actionMenuBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  actionMenuFloat: {
    position: 'absolute',
    left: 12,
  },
  actionMenu: {
    backgroundColor: '#1a1a1a', borderRadius: 14,
    overflow: 'hidden', minWidth: 130,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 8,
  },
  actionMenuItem: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingVertical: 13,
  },
  actionMenuIcon: { fontSize: 17 },
  actionMenuLabel: { fontSize: 15, fontWeight: '600', color: '#fff' },
  actionMenuDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.1)', marginHorizontal: 12 },
  createEventInput: {
    width: '100%', height: 48, backgroundColor: '#f5f5f5',
    borderRadius: 10, paddingHorizontal: 14, fontSize: 15, color: '#1a1a1a', marginBottom: 12,
  },
  createEventInputMulti: {
    width: '100%', height: 80, backgroundColor: '#f5f5f5',
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, color: '#1a1a1a', marginBottom: 12,
    textAlignVertical: 'top',
  },
  pickerBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    height: 48, backgroundColor: '#f5f5f5', borderRadius: 10,
    paddingHorizontal: 14, marginBottom: 12,
  },
  pickerBtnIcon: { fontSize: 16 },
  pickerBtnText: { flex: 1, fontSize: 15, color: '#1a1a1a' },
  pickerBtnPlaceholder: { color: '#999' },
  pickerClear: { fontSize: 14, color: '#aaa', paddingHorizontal: 4 },
  inlinePicker: { width: '100%', marginBottom: 12, backgroundColor: '#fff', borderRadius: 10 },
  locationWrapper: { marginBottom: 12 },
  locationInput: { flex: 1, fontSize: 15, color: '#1a1a1a', height: 48 },
  locationDropdown: {
    backgroundColor: '#fff', borderRadius: 10,
    borderWidth: 1, borderColor: '#e0e0e0',
    marginTop: -8, overflow: 'hidden',
  },
  locationSuggestion: { paddingHorizontal: 14, paddingVertical: 12 },
  locationSuggestionBorder: { borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  locationSuggestionText: { fontSize: 13, color: '#1a1a1a', lineHeight: 18 },
  // Pinned banner
  pinnedBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, paddingVertical: 10,
    backgroundColor: '#fff8e1', borderBottomWidth: 1, borderBottomColor: '#ffe082',
  },
  pinnedIcon: { fontSize: 16 },
  pinnedLabel: { fontSize: 10, fontWeight: '700', color: '#f5a623', textTransform: 'uppercase', letterSpacing: 0.5 },
  pinnedTitle: { fontSize: 13, fontWeight: '600', color: '#1a1a1a' },
  pinnedDate: { fontSize: 11, color: '#888' },
  // Event card extras
  eventCardImage: { width: '100%', height: 130 },
  eventCardBody: { gap: 2, padding: 12 },
  eventCardTap: { fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 8 },
  eventCardCreatorRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  eventCardCreatorAvatar: {
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  eventCardCreatorAvatarImg: { width: 20, height: 20 },
  eventCardCreatorInitial: { fontSize: 9, fontWeight: '700', color: '#fff' },
  eventCardCreatorName: { fontSize: 11, color: 'rgba(255,255,255,0.6)', fontWeight: '500' },
  // Event photo picker
  eventPhotoPicker: {
    width: '100%', height: 140, borderRadius: 10,
    backgroundColor: '#f5f5f5', marginBottom: 12,
    overflow: 'hidden', position: 'relative',
  },
  eventPhotoPreview: { width: '100%', height: '100%' },
  eventPhotoEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6 },
  eventPhotoIcon: { fontSize: 28 },
  eventPhotoLabel: { fontSize: 14, color: '#999' },
  eventPhotoClear: {
    position: 'absolute', top: 8, right: 8,
    backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 12,
    paddingHorizontal: 8, paddingVertical: 4,
  },
  createEventSheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 24, paddingBottom: 40,
    maxHeight: Dimensions.get('window').height * 0.85,
  },
  // Poll widget
  pollCard: {
    width: SCREEN_WIDTH * 0.72, backgroundColor: '#1a1a1a',
    borderRadius: 14, padding: 14, marginBottom: 4,
    alignSelf: 'flex-start',
  },
  pollEmoji: { fontSize: 18, marginBottom: 4 },
  pollQuestion: { fontSize: 15, fontWeight: '700', color: '#fff', marginBottom: 10 },
  pollOption: {
    borderRadius: 8, overflow: 'hidden', marginBottom: 6,
    backgroundColor: 'rgba(255,255,255,0.1)', position: 'relative', minHeight: 36,
    justifyContent: 'center',
  },
  pollBar: {
    position: 'absolute', left: 0, top: 0, bottom: 0,
    backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: 8,
  },
  pollOptionRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 10, paddingVertical: 8, zIndex: 1,
  },
  pollOptionText: { fontSize: 14, color: 'rgba(255,255,255,0.85)', fontWeight: '500', flex: 1 },
  pollOptionTextVoted: { fontWeight: '700', color: '#fff' },
  pollPct: { fontSize: 13, color: 'rgba(255,255,255,0.6)', fontWeight: '600', marginLeft: 6 },
  pollCheck: {
    position: 'absolute', right: 10, fontSize: 13, color: '#fff', fontWeight: '700', zIndex: 2,
  },
  pollTotal: { fontSize: 12, color: 'rgba(255,255,255,0.45)', marginTop: 4 },
  // Create poll modal
  pollInput: {
    backgroundColor: '#f5f5f5', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 15, color: '#1a1a1a', marginBottom: 10,
  },
  pollOptionInput: {
    backgroundColor: '#f5f5f5', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9,
    fontSize: 14, color: '#1a1a1a', marginBottom: 8, flex: 1,
  },
  pollOptionInputRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 0 },
  pollRemoveOption: { padding: 6 },
  pollRemoveOptionText: { fontSize: 16, color: '#aaa' },
  pollAddOption: { paddingVertical: 8, alignItems: 'center', marginBottom: 12 },
  pollAddOptionText: { fontSize: 14, color: '#1a73e8', fontWeight: '600' },
  // Availability checks
  availabilityCard: {
    width: SCREEN_WIDTH * 0.76,
    borderRadius: 16,
    padding: 12,
    marginBottom: 4,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e8e8e8',
  },
  availabilityCardMe: { alignSelf: 'flex-end' },
  availabilityCardThem: { alignSelf: 'flex-start' },
  availabilityEyebrow: {
    fontSize: 11,
    fontWeight: '700',
    color: '#777',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  availabilityTitle: { fontSize: 15, fontWeight: '800', color: '#1a1a1a' },
  availabilitySubtitle: { fontSize: 11, color: '#777', marginTop: 3, marginBottom: 8 },
  availabilityBestFit: {
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 8,
    backgroundColor: '#f6f1e7',
    borderWidth: 1,
    borderColor: '#eadfca',
  },
  availabilityBestFitLabel: { fontSize: 10, fontWeight: '700', color: '#8b6f47', marginBottom: 3, textTransform: 'uppercase' },
  availabilityBestFitRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  availabilityBestFitText: { flex: 1, fontSize: 13, fontWeight: '700', color: '#1a1a1a' },
  availabilityBestFitCount: { fontSize: 12, fontWeight: '800', color: '#8b6f47' },
  availabilityHint: { fontSize: 12, color: '#666', marginBottom: 8 },
  availabilityOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 6,
    backgroundColor: '#f7f7f7',
  },
  availabilityOptionSelected: { backgroundColor: '#1a1a1a' },
  availabilityOptionLabel: { fontSize: 13, fontWeight: '700', color: '#1a1a1a' },
  availabilityOptionLabelSelected: { color: '#fff' },
  availabilityOptionMeta: { fontSize: 10, color: '#888', marginTop: 2 },
  availabilityOptionMetaSelected: { color: 'rgba(255,255,255,0.55)' },
  availabilityFacesRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  availabilityFace: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    overflow: 'hidden',
    backgroundColor: '#dde6dd',
  },
  availabilityFaceOverlap: { marginLeft: -8 },
  availabilityFaceImg: { width: '100%', height: '100%' },
  availabilityFaceFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#dde6dd',
  },
  availabilityFaceFallbackSelected: { backgroundColor: '#555' },
  availabilityFaceInitial: { fontSize: 9, fontWeight: '800', color: '#3a5c3a' },
  availabilityFaceInitialSelected: { color: '#fff' },
  availabilityFaceMore: {
    backgroundColor: '#c0cfc0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  availabilityFaceMoreText: { fontSize: 8, fontWeight: '800', color: '#2a4a2a' },
  availabilityFaceMoreTextSelected: { color: '#fff' },
  availabilitySlotRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  availabilitySlotCount: {
    fontSize: 12,
    fontWeight: '800',
    color: '#555',
    minWidth: 14,
    textAlign: 'center',
  },
  availabilitySlotCountSelected: { color: '#fff' },
  availabilityFooter: { fontSize: 11, color: '#777', marginTop: 2 },
  availabilityComposerLabel: { fontSize: 15, fontWeight: '700', color: '#1a1a1a', marginBottom: 6 },
  availabilityComposerHint: { fontSize: 13, color: '#777', marginBottom: 12, lineHeight: 18 },
  availabilityComposerRule: { fontSize: 12, color: '#888', marginBottom: 12 },
  availabilityPresetList: { gap: 10 },
  availabilityPresetButton: {
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  availabilityPresetButtonActive: { backgroundColor: '#1a1a1a' },
  availabilityPresetButtonText: { fontSize: 15, fontWeight: '600', color: '#1a1a1a' },
  availabilityPresetButtonTextActive: { color: '#fff' },
  availabilityCustomEntry: { marginTop: 16 },
  availabilityCustomEntryLabel: { fontSize: 12, color: '#888', marginBottom: 8, fontWeight: '600' },
  availabilityComposerDivider: { height: 1, backgroundColor: '#ececec', marginVertical: 18 },
  availabilityDaypartRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  availabilityDaypartChip: {
    flex: 1,
    borderRadius: 999,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: '#f2f2f2',
  },
  availabilityDaypartChipSelected: { backgroundColor: '#1a1a1a' },
  availabilityDaypartChipText: { fontSize: 13, fontWeight: '700', color: '#555' },
  availabilityDaypartChipTextSelected: { color: '#fff' },
  availabilityPreviewBox: {
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  availabilityPreviewTitle: { fontSize: 12, fontWeight: '700', color: '#1a1a1a', marginBottom: 4 },
  availabilityPreviewText: { fontSize: 12, color: '#666', lineHeight: 17, marginBottom: 3 },
  availabilityPreviewMeta: { fontSize: 12, fontWeight: '700', color: '#1a1a1a', marginTop: 4 },
  // Quick plans (group chat)
  planPickerHint: { fontSize: 13, color: '#666', marginBottom: 14, lineHeight: 18 },
  planPickerNewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    marginBottom: 12,
  },
  planPickerNewIcon: { fontSize: 20, color: '#fff', fontWeight: '300' },
  planPickerNewLabel: { fontSize: 16, fontWeight: '700', color: '#fff' },
  planPickerEmpty: { fontSize: 14, color: '#888', marginVertical: 12, lineHeight: 20 },
  planPickerSavedRow: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    marginBottom: 8,
  },
  planPickerSavedTitle: { fontSize: 15, fontWeight: '700', color: '#1a1a1a' },
  planPickerSavedLocation: { fontSize: 12, color: '#666', marginTop: 4 },
  planPickerSavedDetails: { fontSize: 10, color: '#888', marginTop: 2 },
  planPickerSending: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16 },
  planPickerSendingText: { fontSize: 14, color: '#555' },
  groupPlanCard: {
    width: SCREEN_WIDTH * 0.76,
    borderRadius: 16,
    padding: 12,
    marginBottom: 4,
    backgroundColor: '#f4f7f4',
    borderWidth: 1,
    borderColor: '#c8dcc8',
  },
  groupPlanCardMe: { alignSelf: 'flex-end' },
  groupPlanCardThem: { alignSelf: 'flex-start' },
  groupPlanEyebrow: {
    fontSize: 11,
    fontWeight: '700',
    color: '#5a7a5a',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  groupPlanTitle: { fontSize: 15, fontWeight: '800', color: '#1a1a1a' },
  groupPlanLocationLine: { fontSize: 12, color: '#555', marginTop: 4, marginBottom: 2 },
  groupPlanDetailsLine: { fontSize: 10, color: '#666', lineHeight: 13, marginBottom: 6 },
  groupPlanDetailsFieldLabel: { fontSize: 11, color: '#888', marginBottom: 4, fontWeight: '600' },
  groupPlanDetailsInput: {
    width: '100%',
    height: 34,
    backgroundColor: '#f8f8f8',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 11,
    color: '#444',
    marginBottom: 12,
  },
  groupPlanPillRow: { flexDirection: 'row', gap: 8, marginTop: 4, marginBottom: 6 },
  groupPlanPill: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#e4ebe4',
    alignItems: 'center',
  },
  groupPlanPillSelected: { backgroundColor: '#1a1a1a' },
  groupPlanPillLabel: { fontSize: 12, fontWeight: '700', color: '#2d4a2d' },
  groupPlanPillLabelSelected: { color: '#fff' },
  groupPlanWhoRow: {
    flexDirection: 'column',
    marginTop: 6,
    gap: 4,
  },
  groupPlanWhoLabel: { fontSize: 11, fontWeight: '700', color: '#555' },
  groupPlanVotersWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  groupPlanVoterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(0,0,0,0.06)',
    borderRadius: 20,
    paddingVertical: 3,
    paddingHorizontal: 7,
  },
  groupPlanVoterAvatar: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#dfe8df',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupPlanVoterAvatarImg: { width: 20, height: 20 },
  groupPlanVoterAvatarInitial: { fontSize: 9, fontWeight: '800', color: '#4a5c4a' },
  groupPlanVoterUsername: { fontSize: 12, fontWeight: '600', color: '#333', maxWidth: 90 },
  groupPlanVoterOverflow: { fontSize: 12, fontWeight: '600', color: '#888' },
  groupPlanSaveToMine: {
    alignSelf: 'flex-start',
    marginTop: 10,
    paddingVertical: 6,
    paddingHorizontal: 2,
  },
  groupPlanSaveToMineText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2d5a2d',
    textDecorationLine: 'underline',
  },
  groupPlanSaveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    paddingVertical: 4,
  },
  groupPlanSaveLabel: { fontSize: 15, fontWeight: '600', color: '#1a1a1a', flex: 1, paddingRight: 12 },
  typingRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 16, paddingVertical: 4,
  },
  typingText: { fontSize: 12, color: '#aaa', fontStyle: 'italic' },
  typingDots: { fontSize: 12, color: '#aaa', letterSpacing: 2 },
});
