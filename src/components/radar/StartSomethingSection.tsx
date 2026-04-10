import React from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { GroupChip } from '../../types/radar';

type Props = {
  groups: GroupChip[];
  onGroupSelect: (group: GroupChip) => void;
};

const AVATAR_COLORS = ['#c8e6c9', '#bbdefb', '#f8bbd9', '#fff9c4', '#e1bee7', '#ffe0b2'];

function GroupButton({ group, onPress }: { group: GroupChip; onPress: () => void }) {
  const colorIdx = group.name.charCodeAt(0) % AVATAR_COLORS.length;
  const avatarColor = AVATAR_COLORS[colorIdx];

  return (
    <TouchableOpacity style={styles.groupBtn} onPress={onPress} activeOpacity={0.72}>
      {/* Avatar circle — real image if available, else initials */}
      {group.avatarUrl ? (
        <Image source={{ uri: group.avatarUrl }} style={styles.avatarImage} resizeMode="cover" />
      ) : (
        <View style={[styles.avatar, { backgroundColor: avatarColor }]}>
          <Text style={styles.avatarInitial}>{group.name[0]?.toUpperCase() ?? '?'}</Text>
        </View>
      )}
      {/* Group name */}
      <Text style={styles.groupName} numberOfLines={1}>{group.name}</Text>
      {/* CTA label */}
      <Text style={styles.cta}>Propose →</Text>
    </TouchableOpacity>
  );
}

export default function StartSomethingSection({ groups, onGroupSelect }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Start something</Text>
      <Text style={styles.sub}>Propose a plan to one of your groups</Text>

      {groups.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.scrollRow}
        >
          {groups.map((g) => (
            <GroupButton key={g.id} group={g} onPress={() => onGroupSelect(g)} />
          ))}
        </ScrollView>
      ) : (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>No group chats yet — create one in Messages</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginBottom: 16,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  heading: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 2,
  },
  sub: {
    fontSize: 12,
    color: '#aaa',
    marginBottom: 14,
  },
  scrollRow: {
    flexDirection: 'row',
    gap: 10,
    paddingBottom: 2,
  },
  groupBtn: {
    width: 110,
    backgroundColor: '#f7f6f3',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 12,
    alignItems: 'flex-start',
    gap: 6,
    borderWidth: 1,
    borderColor: '#ebe9e4',
  },
  avatarImage: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginBottom: 2,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  avatarInitial: {
    fontSize: 15,
    fontWeight: '700',
    color: '#333',
  },
  groupName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1a1a1a',
    maxWidth: 86,
  },
  cta: {
    fontSize: 11,
    fontWeight: '500',
    color: '#aaa',
  },
  emptyState: {
    paddingVertical: 8,
  },
  emptyText: {
    fontSize: 13,
    color: '#bbb',
    fontStyle: 'italic',
  },
});
