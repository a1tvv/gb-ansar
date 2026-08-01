import React, { useEffect, useRef } from 'react';
import { StyleSheet, View, Text, Animated, Easing } from 'react-native';

interface WelcomeScreenProps {
  onAnimationEnd: () => void;
}

export default function WelcomeScreen({ onAnimationEnd }: WelcomeScreenProps) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.85)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      // Фаза 1: появление лого — 400мс
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 400,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          friction: 7,
          tension: 45,
          useNativeDriver: true,
        }),
      ]),
      // Фаза 2: заполнение прогресс-бара — 800мс
      Animated.timing(progressAnim, {
        toValue: 1,
        duration: 800,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: false,
      }),
    ]).start(() => {
      onAnimationEnd();
    });
  }, []);

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <View style={styles.container}>
      <Animated.View
        style={[
          styles.centerBlock,
          {
            opacity: fadeAnim,
            transform: [{ scale: scaleAnim }],
          },
        ]}
      >
        <Text style={styles.logoText}>Ansar HomeWear</Text>
        <Text style={styles.tagline}>Умный поиск товаров</Text>

        <View style={styles.progressBar}>
          <Animated.View style={[styles.progressLine, { width: progressWidth }]} />
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f14',
    justifyContent: 'center',
    alignItems: 'center',
  },
  centerBlock: {
    alignItems: 'center',
  },
  logoText: {
    fontSize: 34,
    fontWeight: 'bold',
    color: '#ffffff',
    letterSpacing: 1.5,
  },
  tagline: {
    marginTop: 8,
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.55)',
    letterSpacing: 1,
  },
  progressBar: {
    marginTop: 32,
    width: 180,
    height: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressLine: {
    height: '100%',
    backgroundColor: '#4F46E5',
    borderRadius: 2,
  },
});
