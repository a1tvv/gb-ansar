import React, { useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Animated,
  Easing,
  Dimensions,
} from 'react-native';

const { height: SCREEN_H } = Dimensions.get('window');

interface WelcomeScreenProps {
  onAnimationEnd: () => void;
}

export default function WelcomeScreen({ onAnimationEnd }: WelcomeScreenProps) {
  // Появление логотипа
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.92)).current;
  // Шторка снизу вверх: 0 = экран светлый, 1 = тёмный закрыл всё
  const wipeAnim = useRef(new Animated.Value(0)).current;
  // Заполнение прогресс-бара
  const progressAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Фаза 1 — логотип проявляется на светлом (400мс)
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 400,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 8,
        tension: 50,
        useNativeDriver: true,
      }),
    ]).start(() => {
      // Фаза 2 — шторка едет снизу + одновременно бежит прогресс
      Animated.parallel([
        Animated.sequence([
          Animated.delay(150),
          Animated.timing(wipeAnim, {
            toValue: 1,
            duration: 450,
            easing: Easing.bezier(0.65, 0, 0.35, 1),
            useNativeDriver: true,
          }),
        ]),
        Animated.timing(progressAnim, {
          toValue: 1,
          duration: 1150,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: false,
        }),
      ]).start(() => {
        onAnimationEnd();
      });
    });
  }, []);

  // Тёмный слой едет снизу вверх
  const darkLayerY = wipeAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [SCREEN_H, 0],
  });

  // Контент внутри тёмного слоя компенсирует сдвиг — визуально остаётся на месте
  const innerCompensationY = wipeAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-SCREEN_H, 0],
  });

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <View style={styles.root}>
      {/* ===== СВЕТЛЫЙ СЛОЙ (низ) ===== */}
      <View style={[styles.layer, styles.lightBg]}>
        <Animated.View
          style={[
            styles.centerBlock,
            { opacity: fadeAnim, transform: [{ scale: scaleAnim }] },
          ]}
        >
          <Text style={[styles.logoText, styles.logoDark]}>Ansar HomeWear</Text>
          <Text style={[styles.tagline, styles.taglineDark]}>Умный поиск товаров</Text>
          <View style={[styles.progressTrack, styles.trackLight]}>
            <Animated.View
              style={[styles.progressLine, styles.lineDark, { width: progressWidth }]}
            />
          </View>
        </Animated.View>
      </View>

      {/* ===== ТЁМНЫЙ СЛОЙ (шторка снизу) ===== */}
      <Animated.View
        style={[
          styles.layer,
          styles.darkBg,
          { transform: [{ translateY: darkLayerY }] },
        ]}
      >
        <Animated.View
          style={[
            styles.innerFill,
            { transform: [{ translateY: innerCompensationY }] },
          ]}
        >
          <View style={styles.centerBlock}>
            <Text style={[styles.logoText, styles.logoLight]}>Ansar HomeWear</Text>
            <Text style={[styles.tagline, styles.taglineLight]}>Умный поиск товаров</Text>
            <View style={[styles.progressTrack, styles.trackDark]}>
              <Animated.View
                style={[styles.progressLine, styles.lineLight, { width: progressWidth }]}
              />
            </View>
          </View>
        </Animated.View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F3F4F6' },

  layer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lightBg: { backgroundColor: '#F3F4F6' },
  darkBg: { backgroundColor: '#0A0A16' },

  // Внутренний контейнер тёмного слоя — компенсирует сдвиг родителя
  innerFill: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },

  centerBlock: { alignItems: 'center' },

  logoText: {
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  logoDark: { color: '#111827' },
  logoLight: { color: '#FFFFFF' },

  tagline: {
    marginTop: 8,
    fontSize: 14,
    letterSpacing: 0.8,
  },
  taglineDark: { color: '#6B7280' },
  taglineLight: { color: 'rgba(255, 255, 255, 0.55)' },

  progressTrack: {
    marginTop: 28,
    width: 180,
    height: 3,
    borderRadius: 2,
    overflow: 'hidden',
  },
  trackLight: { backgroundColor: 'rgba(17, 24, 39, 0.12)' },
  trackDark: { backgroundColor: 'rgba(255, 255, 255, 0.12)' },

  progressLine: { height: '100%', borderRadius: 2 },
  lineDark: { backgroundColor: '#4F46E5' },
  lineLight: { backgroundColor: '#6366F1' },
});