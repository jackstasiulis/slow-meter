import React from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

export type ProfileLinkUser = {
  id: string;
  username: string;
  avatar_url: string | null;
};

type ProfileLinksSheetProps = {
  visible: boolean;
  title?: string;
  users: ProfileLinkUser[];
  loading: boolean;
  onClose: () => void;
  onPressUser: (userId: string) => void;
};

export default function ProfileLinksSheet({
  visible,
  title = 'Links',
  users,
  loading,
  onClose,
  onPressUser,
}: ProfileLinksSheetProps) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={onClose} />
        <View style={styles.modalSheet}>
          <View style={styles.handle} />
          <Text style={styles.modalTitle}>{title}</Text>
          {loading ? (
            <ActivityIndicator color="#1a1a1a" style={styles.loading} />
          ) : users.length === 0 ? (
            <Text style={styles.emptyList}>No links yet</Text>
          ) : (
            <FlatList
              data={users}
              keyExtractor={(u) => u.id}
              contentContainerStyle={styles.listContent}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.userRow}
                  onPress={() => onPressUser(item.id)}
                >
                  <View style={styles.userAvatar}>
                    {item.avatar_url ? (
                      <Image source={{ uri: item.avatar_url }} style={styles.userAvatarImg} />
                    ) : (
                      <Text style={styles.userAvatarInitial}>{item.username[0]?.toUpperCase()}</Text>
                    )}
                  </View>
                  <Text style={styles.userUsername}>@{item.username}</Text>
                </TouchableOpacity>
              )}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.3)' },
  modalBackdrop: { flex: 1 },
  modalSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '70%',
    paddingBottom: 32,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#ddd',
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 4,
  },
  modalTitle: {
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
    paddingVertical: 12,
    color: '#1a1a1a',
  },
  loading: { marginTop: 20 },
  listContent: { paddingHorizontal: 16 },
  emptyList: { textAlign: 'center', color: '#aaa', marginTop: 24 },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  userAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#e0e0e0',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  userAvatarImg: { width: 42, height: 42 },
  userAvatarInitial: { fontSize: 16, fontWeight: '600', color: '#888' },
  userUsername: { fontSize: 14, fontWeight: '600', color: '#1a1a1a' },
});
