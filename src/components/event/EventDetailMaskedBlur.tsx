import React from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import MaskedView from '@react-native-masked-view/masked-view';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';

/**
 * Same masked-blur ramp as `ProfileMaskedBlur`: sharp at the top of the layer,
 * then progressively stronger blur toward the bottom (full blur in the lower band).
 */
export default function EventDetailMaskedBlur() {
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const heroRefHeight = Math.min(
    Math.round(windowHeight * 0.72),
    Math.round(windowWidth * (16 / 9)),
  );
  const blurRampHeight = Math.round(heroRefHeight * 0.42);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <MaskedView
        style={StyleSheet.absoluteFill}
        maskElement={
          <View style={styles.maskRoot}>
            <LinearGradient
              colors={[
                'transparent',
                'rgba(0,0,0,0.05)',
                'rgba(0,0,0,0.14)',
                'rgba(0,0,0,0.32)',
                'rgba(0,0,0,0.58)',
                'rgba(0,0,0,0.82)',
                'black',
              ]}
              locations={[0, 0.12, 0.28, 0.48, 0.68, 0.88, 1]}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={[styles.maskRamp, { height: blurRampHeight }]}
            />
            <View style={styles.maskFill} />
          </View>
        }
      >
        <BlurView intensity={80} tint="dark" style={{ flex: 1 }} />
      </MaskedView>
    </View>
  );
}

const styles = StyleSheet.create({
  maskRoot: { flex: 1 },
  maskRamp: { width: '100%' },
  maskFill: { flex: 1, backgroundColor: '#000' },
});
