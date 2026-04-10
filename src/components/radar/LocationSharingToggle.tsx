import React from 'react';
import { TouchableOpacity, Text, StyleSheet, View } from 'react-native';

type Props = {
  isSharing: boolean;
  onToggle: () => void;
  permissionDenied: boolean;
};

export default function LocationSharingToggle({ isSharing, onToggle, permissionDenied }: Props) {
  return (
    <TouchableOpacity
      onPress={onToggle}
      style={[styles.btn, isSharing && styles.btnActive]}
      activeOpacity={0.75}
      accessibilityLabel={isSharing ? 'Stop sharing location' : 'Share location'}
      accessibilityRole="button"
    >
      <Text style={[styles.icon, isSharing && styles.iconActive]}>📡</Text>
      <Text style={[styles.label, isSharing && styles.labelActive]}>
        {isSharing ? 'Live' : 'Off'}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.28)',
    marginRight: 8,
  },
  btnActive: {
    backgroundColor: 'rgba(76, 175, 80, 0.28)',
    borderColor: 'rgba(129, 199, 132, 0.45)',
  },
  icon: {
    fontSize: 13,
  },
  iconActive: {},
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.8)',
    letterSpacing: 0.3,
  },
  labelActive: {
    color: '#a5d6a7',
  },
});
