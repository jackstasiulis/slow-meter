import React, { useEffect, useState } from 'react';
import { Alert, ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Image } from 'expo-image';
import { useNavigation, useRoute } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { navigateToUserProfile } from '../navigation/navigateToUserProfile';
import {
  formatAvailabilitySlotWindow,
  formatAvailabilitySubtitle,
  summarizeAvailability,
} from '../lib/availability';
import { AvailabilityCheck, AvailabilitySlot } from '../types';

type Voter = { id: string; username: string; avatar_url: string | null };

export default function AvailabilityCheckDetailScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const { availabilityCheckId } = route.params;

  const [availabilityCheck, setAvailabilityCheck] = useState<AvailabilityCheck | null>(null);
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [votesBySlot, setVotesBySlot] = useState<Record<string, string[]>>({});
  const [userMap, setUserMap] = useState<Record<string, Voter>>({});
  const [myId, setMyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [savingTitle, setSavingTitle] = useState(false);

  useEffect(() => {
    load();
  }, [availabilityCheckId]);

  async function load() {
    setLoading(true);

    const [{ data: authData }, checkResult, slotsResult, votesResult] = await Promise.all([
      supabase.auth.getUser(),
      supabase
        .from('availability_checks')
        .select('id, conversation_id, created_by, preset, title, timezone, range_start, range_end, created_at')
        .eq('id', availabilityCheckId)
        .single(),
      supabase
        .from('availability_slots')
        .select('id, availability_check_id, label, starts_at, ends_at, sort_order')
        .eq('availability_check_id', availabilityCheckId)
        .order('sort_order', { ascending: true }),
      supabase
        .from('availability_votes')
        .select('availability_check_id, availability_slot_id, user_id')
        .eq('availability_check_id', availabilityCheckId),
    ]);

    setMyId(authData.user?.id ?? null);

    if (!checkResult.data) {
      setLoading(false);
      return;
    }

    const voteMap: Record<string, string[]> = {};
    const voterIds = new Set<string>();

    for (const vote of votesResult.data ?? []) {
      if (!voteMap[vote.availability_slot_id]) voteMap[vote.availability_slot_id] = [];
      voteMap[vote.availability_slot_id].push(vote.user_id);
      voterIds.add(vote.user_id);
    }

    let nextUserMap: Record<string, Voter> = {};
    if (voterIds.size > 0) {
      const { data: users } = await supabase
        .from('users')
        .select('id, username, avatar_url')
        .in('id', [...voterIds]);

      for (const user of users ?? []) {
        nextUserMap[user.id] = user;
      }
    }

    setAvailabilityCheck(checkResult.data);
    setTitleDraft(checkResult.data.title ?? '');
    setSlots(slotsResult.data ?? []);
    setVotesBySlot(voteMap);
    setUserMap(nextUserMap);
    navigation.setOptions({ title: 'Availability' });
    setLoading(false);
  }

  async function deleteAvailabilityCheck() {
    if (!availabilityCheck || !myId || deleting) return;

    setDeleting(true);

    const deletedAt = new Date().toISOString();

    const { error: messageDeleteError } = await supabase
      .from('messages')
      .update({
        body: '',
        liked_by: [],
        post_id: null,
        event_id: null,
        poll_id: null,
        availability_check_id: null,
        deleted_at: deletedAt,
        deleted_by: myId,
      })
      .eq('availability_check_id', availabilityCheck.id)
      .eq('sender_id', myId);

    if (messageDeleteError) {
      Alert.alert('Error', messageDeleteError.message);
      setDeleting(false);
      return;
    }

    const { error: checkDeleteError } = await supabase
      .from('availability_checks')
      .delete()
      .eq('id', availabilityCheck.id)
      .eq('created_by', myId);

    if (checkDeleteError) {
      Alert.alert('Error', checkDeleteError.message);
      setDeleting(false);
      return;
    }

    setDeleting(false);
    navigation.goBack();
  }

  async function saveTitle() {
    if (!availabilityCheck || savingTitle) return;
    const nextTitle = titleDraft.trim();
    if (!nextTitle) return;

    setSavingTitle(true);
    const { error } = await supabase
      .from('availability_checks')
      .update({ title: nextTitle })
      .eq('id', availabilityCheck.id);

    if (error) {
      Alert.alert('Error', error.message);
      setSavingTitle(false);
      return;
    }

    setAvailabilityCheck((prev) => prev ? { ...prev, title: nextTitle } : prev);
    setEditingTitle(false);
    setSavingTitle(false);
  }

  if (loading) {
    return <ActivityIndicator style={{ flex: 1 }} color="#1a1a1a" />;
  }

  if (!availabilityCheck) {
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyTitle}>Availability check unavailable</Text>
        <Text style={styles.emptyText}>This card could not be loaded.</Text>
      </View>
    );
  }

  const summary = summarizeAvailability(slots, votesBySlot);
  const subtitle = formatAvailabilitySubtitle(availabilityCheck);
  const isCreator = availabilityCheck.created_by === myId;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      {editingTitle ? (
        <View style={styles.titleEditor}>
          <TextInput
            style={styles.titleInput}
            value={titleDraft}
            onChangeText={setTitleDraft}
            placeholder="Availability title"
            placeholderTextColor="#999"
            maxLength={80}
          />
          <View style={styles.titleEditorActions}>
            <TouchableOpacity
              style={styles.titleCancelBtn}
              onPress={() => { setTitleDraft(availabilityCheck.title); setEditingTitle(false); }}
              disabled={savingTitle}
            >
              <Text style={styles.titleCancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.titleSaveBtn, (!titleDraft.trim() || savingTitle) && styles.titleSaveBtnDisabled]}
              onPress={saveTitle}
              disabled={!titleDraft.trim() || savingTitle}
            >
              <Text style={styles.titleSaveText}>{savingTitle ? 'Saving...' : 'Save'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <>
          <Text style={styles.title}>{availabilityCheck.title}</Text>
          <TouchableOpacity style={styles.editTitleBtn} onPress={() => setEditingTitle(true)}>
            <Text style={styles.editTitleText}>Edit title</Text>
          </TouchableOpacity>
        </>
      )}
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      {isCreator ? (
        <TouchableOpacity
          style={[styles.deleteButton, deleting && styles.deleteButtonDisabled]}
          disabled={deleting}
          onPress={() => Alert.alert(
            'Delete availability check?',
            'This will remove the check from the conversation for everyone.',
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Delete', style: 'destructive', onPress: deleteAvailabilityCheck },
            ]
          )}
        >
          <Text style={styles.deleteButtonText}>{deleting ? 'Deleting...' : 'Delete availability check'}</Text>
        </TouchableOpacity>
      ) : null}

      <View style={styles.heroCard}>
        <Text style={styles.heroLabel}>Best fit</Text>
        <Text style={styles.heroTitle}>{summary.best_slot?.slot.label ?? 'No votes yet'}</Text>
        {summary.best_slot ? (
          <>
            <Text style={styles.heroMeta}>{formatAvailabilitySlotWindow(summary.best_slot.slot)}</Text>
            <Text style={styles.heroCount}>
              {summary.best_slot.count} of {Math.max(summary.respondent_ids.length, summary.best_slot.count)} voters can make it
            </Text>
          </>
        ) : (
          <Text style={styles.heroMeta}>Votes will appear here once the group responds.</Text>
        )}
      </View>

      <Text style={styles.sectionTitle}>Ranked slots</Text>
      {summary.ranked_slots.map((entry) => {
        const isMine = myId ? entry.voter_ids.includes(myId) : false;

        return (
          <View key={entry.slot.id} style={[styles.slotCard, isMine && styles.slotCardActive]}>
            <View style={styles.slotHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.slotLabel}>{entry.slot.label}</Text>
                <Text style={styles.slotWindow}>{formatAvailabilitySlotWindow(entry.slot)}</Text>
              </View>
              <Text style={styles.slotCount}>{entry.count}</Text>
            </View>

            {entry.voter_ids.length > 0 ? (
              <View style={styles.voterList}>
                {entry.voter_ids.map((voterId) => {
                  const voter = userMap[voterId];
                  if (!voter) return null;

                  return (
                    <TouchableOpacity
                      key={voter.id}
                      style={styles.voterRow}
                      onPress={() => navigateToUserProfile(navigation, voter.id)}
                    >
                      <View style={styles.voterAvatar}>
                        {voter.avatar_url ? (
                          <Image source={{ uri: voter.avatar_url }} style={styles.voterAvatarImage} />
                        ) : (
                          <Text style={styles.voterInitial}>{voter.username[0]?.toUpperCase()}</Text>
                        )}
                      </View>
                      <Text style={styles.voterName}>@{voter.username}</Text>
                      {myId === voter.id ? <Text style={styles.voterYou}>You</Text> : null}
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : (
              <Text style={styles.noVotes}>No one has selected this slot yet.</Text>
            )}
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fafaf8' },
  content: { padding: 20, paddingBottom: 48 },
  title: { fontSize: 22, fontWeight: '800', color: '#1a1a1a', lineHeight: 30 },
  editTitleBtn: { alignSelf: 'flex-start', marginTop: 8, marginBottom: 4 },
  editTitleText: { fontSize: 13, color: '#1a1a1a', fontWeight: '600' },
  titleEditor: { marginBottom: 8 },
  titleInput: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e3e3e3',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  titleEditorActions: { flexDirection: 'row', gap: 10, marginTop: 10 },
  titleCancelBtn: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: '#f1f1f1',
  },
  titleCancelText: { fontSize: 13, fontWeight: '700', color: '#666' },
  titleSaveBtn: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
  },
  titleSaveBtnDisabled: { backgroundColor: '#c9c9c9' },
  titleSaveText: { fontSize: 13, fontWeight: '700', color: '#fff' },
  subtitle: { fontSize: 13, color: '#777', marginTop: 6, marginBottom: 18 },
  deleteButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: '#feeceb',
    marginBottom: 18,
  },
  deleteButtonDisabled: { opacity: 0.6 },
  deleteButtonText: { fontSize: 13, fontWeight: '700', color: '#c62828' },
  heroCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 18,
    padding: 18,
    marginBottom: 24,
  },
  heroLabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.55)',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  heroTitle: { fontSize: 20, fontWeight: '800', color: '#fff', marginBottom: 8 },
  heroMeta: { fontSize: 13, color: 'rgba(255,255,255,0.72)', marginBottom: 4 },
  heroCount: { fontSize: 14, color: '#fff', fontWeight: '600' },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#1a1a1a', marginBottom: 12 },
  slotCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#ececec',
  },
  slotCardActive: { borderColor: '#1a1a1a' },
  slotHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  slotLabel: { fontSize: 16, fontWeight: '700', color: '#1a1a1a' },
  slotWindow: { fontSize: 13, color: '#888', marginTop: 3 },
  slotCount: {
    minWidth: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#1a1a1a',
    color: '#fff',
    textAlign: 'center',
    textAlignVertical: 'center',
    fontSize: 14,
    fontWeight: '700',
    overflow: 'hidden',
    paddingTop: 7,
  },
  voterList: { gap: 10 },
  voterRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  voterAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#e0e0e0',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  voterAvatarImage: { width: 34, height: 34 },
  voterInitial: { fontSize: 12, fontWeight: '700', color: '#777' },
  voterName: { flex: 1, fontSize: 14, fontWeight: '600', color: '#1a1a1a' },
  voterYou: { fontSize: 12, color: '#777', fontWeight: '700' },
  noVotes: { fontSize: 13, color: '#888' },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: '#fafaf8' },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#1a1a1a', marginBottom: 6 },
  emptyText: { fontSize: 14, color: '#777' },
});
