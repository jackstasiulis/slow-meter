import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Image,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { supabase } from '../lib/supabase';

type Voter = { id: string; username: string; avatar_url: string | null };

type PollOption = {
  text: string;
  voters: Voter[];
};

export default function PollDetailScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const { pollId } = route.params;

  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState<PollOption[]>([]);
  const [totalVotes, setTotalVotes] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const { data: poll } = await supabase
      .from('polls')
      .select('id, question, options')
      .eq('id', pollId)
      .single();

    if (!poll) { setLoading(false); return; }

    const { data: votes } = await supabase
      .from('poll_votes')
      .select('option_index, user_id')
      .eq('poll_id', pollId);

    const voterIds = [...new Set((votes ?? []).map((v: any) => v.user_id))];
    let userMap: Record<string, Voter> = {};
    if (voterIds.length > 0) {
      const { data: users } = await supabase
        .from('users')
        .select('id, username, avatar_url')
        .in('id', voterIds);
      for (const u of users ?? []) userMap[u.id] = u;
    }

    const optionList: PollOption[] = (poll.options as string[]).map((text, idx) => {
      const votersForOption = (votes ?? [])
        .filter((v: any) => v.option_index === idx)
        .map((v: any) => userMap[v.user_id])
        .filter(Boolean);
      return { text, voters: votersForOption };
    });

    setQuestion(poll.question);
    setOptions(optionList);
    setTotalVotes((votes ?? []).length);
    navigation.setOptions({ title: 'Poll Results' });
    setLoading(false);
  }

  if (loading) return <ActivityIndicator style={{ flex: 1 }} color="#1a1a1a" />;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.question}>{question}</Text>
      <Text style={styles.total}>{totalVotes} vote{totalVotes !== 1 ? 's' : ''} total</Text>

      {options.map((opt, i) => {
        const pct = totalVotes > 0 ? Math.round((opt.voters.length / totalVotes) * 100) : 0;
        return (
          <View key={i} style={styles.optionBlock}>
            <View style={styles.optionHeader}>
              <Text style={styles.optionText}>{opt.text}</Text>
              <Text style={styles.optionPct}>{pct}% · {opt.voters.length}</Text>
            </View>
            <View style={styles.barTrack}>
              <View style={[styles.barFill, { width: `${pct}%` }]} />
            </View>
            {opt.voters.length > 0 && (
              <View style={styles.voterList}>
                {opt.voters.map((v) => (
                  <TouchableOpacity
                    key={v.id}
                    style={styles.voterRow}
                    onPress={() => navigation.navigate('UserProfile', { userId: v.id })}
                  >
                    <View style={styles.voterAvatar}>
                      {v.avatar_url ? (
                        <Image source={{ uri: v.avatar_url }} style={styles.voterAvatarImg} />
                      ) : (
                        <Text style={styles.voterAvatarInitial}>{v.username[0]?.toUpperCase()}</Text>
                      )}
                    </View>
                    <Text style={styles.voterUsername}>@{v.username}</Text>
                  </TouchableOpacity>
                ))}
              </View>
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
  question: { fontSize: 20, fontWeight: '800', color: '#1a1a1a', lineHeight: 28, marginBottom: 6 },
  total: { fontSize: 13, color: '#aaa', marginBottom: 24 },
  optionBlock: {
    backgroundColor: '#fff', borderRadius: 14, padding: 16,
    marginBottom: 14, borderWidth: 1, borderColor: '#f0f0f0',
  },
  optionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  optionText: { fontSize: 15, fontWeight: '700', color: '#1a1a1a', flex: 1 },
  optionPct: { fontSize: 13, color: '#888', fontWeight: '600', marginLeft: 8 },
  barTrack: { height: 6, backgroundColor: '#f0f0f0', borderRadius: 3, marginBottom: 12, overflow: 'hidden' },
  barFill: { height: '100%', backgroundColor: '#1a1a1a', borderRadius: 3 },
  voterList: { gap: 8 },
  voterRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  voterAvatar: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: '#e0e0e0', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  voterAvatarImg: { width: 32, height: 32 },
  voterAvatarInitial: { fontSize: 12, fontWeight: '600', color: '#888' },
  voterUsername: { fontSize: 14, fontWeight: '600', color: '#1a1a1a' },
});
