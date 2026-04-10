import React from 'react';
import { ActivityIndicator, FlatList, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Image } from 'expo-image';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={onClose} />
        <View style={[styles.modalSheet, { paddingBottom: Math.max(insets.bottom, 20) }]}>
          <BlurView intensity={55} tint="dark" style={StyleSheet.absoluteFill} />
          <View style={styles.sheetGlassTint} pointerEvents="none" />
          <View style={styles.handle} />
          <Text style={styles.modalTitle}>{title}</Text>
          {loading ? (
            <ActivityIndicator color="#fff" style={styles.loading} />
          ) : users.length === 0 ? (
            <Text style={styles.emptyList}>No links yet</Text>
          ) : (
            <FlatList
              data={users}
              keyExtractor={(u) => u.id}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.listContent}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.userRow}
                  onPress={() => onPressUser(item.id)}
                  activeOpacity={0.85}
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
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'transparent',
  },
  modalBackdrop: { flex: 1 },
  modalSheet: {
    maxHeight: '72%',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
  },
  sheetGlassTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.35)',
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 6,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
    paddingVertical: 10,
    color: 'rgba(255,255,255,0.96)',
    letterSpacing: -0.3,
  },
  loading: { marginTop: 20, marginBottom: 28 },
  listContent: { paddingHorizontal: 16, paddingBottom: 8 },
  emptyList: {
    textAlign: 'center',
    color: 'rgba(255,255,255,0.62)',
    marginTop: 20,
    marginBottom: 36,
    fontSize: 15,
    fontWeight: '500',
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.18)',
  },
  userAvatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  userAvatarImg: { width: 46, height: 46 },
  userAvatarInitial: { fontSize: 18, fontWeight: '700', color: '#fff' },
  userUsername: { fontSize: 16, fontWeight: '600', color: 'rgba(255,255,255,0.95)' },
});
