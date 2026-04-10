import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { GroupChip } from '../types/radar';

export function useGroupsForStartSomething(myId: string | null) {
  const [groups, setGroups] = useState<GroupChip[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!myId) return;
    let cancelled = false;
    setLoading(true);

    (async () => {
      // Get group conversation IDs the user is part of
      const { data: participantRows } = await supabase
        .from('conversation_participants')
        .select('conversation_id')
        .eq('user_id', myId);

      const convIds = (participantRows ?? []).map((r: any) => r.conversation_id);
      if (convIds.length === 0) {
        if (!cancelled) { setGroups([]); setLoading(false); }
        return;
      }

      const { data: convData } = await supabase
        .from('conversations')
        .select('id, name, avatar_url')
        .in('id', convIds)
        .eq('is_group', true)
        .order('name', { ascending: true });

      if (!cancelled) {
        setGroups(
          (convData ?? []).map((c: any) => ({
            id: c.id,
            name: c.name ?? 'Group',
            avatarUrl: c.avatar_url ?? null,
          }))
        );
        setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [myId]);

  return { groups, loading };
}
