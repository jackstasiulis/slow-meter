import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useCurrentUser } from '../../hooks/useCurrentUser';

type ProfileTabIconProps = {
  focused: boolean;
  size?: number;
};

export default function ProfileTabIcon({ focused, size = 26 }: ProfileTabIconProps) {
  const { user } = useCurrentUser();
  const avatarUrl = user?.avatar_url;

  // Outer frame ≈ slot width (~31): size + border ring, without +6 which clips in the tab bar.
  const framePad = 3;
  return (
    <View
      style={[
        styles.frame,
        {
          width: size + framePad,
          height: size + framePad,
          borderRadius: (size + framePad) / 2,
        },
        focused ? styles.frameFocused : styles.frameIdle,
      ]}
    >
      {avatarUrl ? (
        <Image
          source={{ uri: avatarUrl }}
          style={{ width: size, height: size, borderRadius: size / 2 }}
          contentFit="cover"
        />
      ) : (
        <View
          style={[
            styles.placeholder,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
            },
          ]}
        >
          <Text style={styles.placeholderText}>👤</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    overflow: 'hidden',
  },
  frameFocused: {
    borderColor: 'rgba(255,255,255,0.95)',
  },
  frameIdle: {
    borderColor: 'rgba(255,255,255,0.55)',
  },
  placeholder: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: {
    fontSize: 13,
  },
});
