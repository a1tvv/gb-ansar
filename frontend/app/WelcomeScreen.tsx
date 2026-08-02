import React, { useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Animated,
  Easing,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

// Размеры логотипа
const LOGO_BIG = 88;
const LOGO_SCALE_SMALL = 0.48;
// Высота шапки, в которую схлопывается сплэш
const HEADER_H = 170;

interface WelcomeScreenProps {
  onAnimationEnd: () => void;
}

export default function WelcomeScreen({ onAnimationEnd }: WelcomeScreenProps) {
  // Появление логотипа
  const logoIn = useRef(new Animated.Value(0)).current;
  // Появление/исчезновение подписей
  const textIn = useRef(new Animated.Value(0)).current;
  // Схлопывание панели вверх: 0 = весь экран, 1 = шапка
  const collapse = useRef(new Animated.Value(0)).current;
  // Финальное растворение всего сплэша
  const exitFade = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.sequence([
      // 1. Логотип выскакивает
      Animated.spring(logoIn, {
        toValue: 1,
        friction: 7,
        tension: 60,
        useNativeDriver: false,
      }),
      // 2. Подписи проявляются
      Animated.timing(textIn, {
        toValue: 1,
        duration: 260,
        easing: Easing.out(Easing.ease),
        useNativeDriver: false,
      }),
      // 3. Пауза, чтобы прочитали
      Animated.delay(320),
      // 4. Подписи гаснут
      Animated.timing(textIn, {
        toValue: 0,
        duration: 160,
        easing: Easing.in(Easing.ease),
        useNativeDriver: false,
      }),
      // 5. Панель схлопывается вверх, логотип уезжает влево и мельчает
      Animated.timing(collapse, {
        toValue: 1,
        duration: 380,
        easing: Easing.bezier(0.6, 0, 0.3, 1),
        useNativeDriver: false,
      }),
      // 6. Небольшая задержка и растворение
      Animated.delay(120),
      Animated.timing(exitFade, {
        toValue: 0,
        duration: 220,
        easing: Easing.out(Easing.ease),
        useNativeDriver: false,
      }),
    ]).start(() => {
      onAnimationEnd();
    });
  }, []);

  // Высота фиолетовой панели
  const panelHeight = collapse.interpolate({
    inputRange: [0, 1],
    outputRange: [SCREEN_H, HEADER_H],
  });

  // Скругление нижних углов появляется при схлопывании
  const panelRadius = collapse.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0, 8, 26],
  });

  // Логотип: появление
  const logoScaleIn = logoIn.interpolate({
    inputRange: [0, 1],
    outputRange: [0.6, 1],
  });

  // Логотип: уменьшение при схлопывании
  const logoScaleOut = collapse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, LOGO_SCALE_SMALL],
  });

  // Логотип: уезжает к левому краю
  const logoShiftX = collapse.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -(SCREEN_W / 2 - 20 - (LOGO_BIG * LOGO_SCALE_SMALL) / 2)],
  });

  return (
    <Animated.View style={[styles.root, { opacity: exitFade }]}>
      <Animated.View
        style={[
          styles.panelWrap,
          {
            height: panelHeight,
            borderBottomLeftRadius: panelRadius,
            borderBottomRightRadius: panelRadius,
          },
        ]}
      >
        <LinearGradient
          colors={['#6479E5', '#6B6BCF', '#744AA1']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.gradient}
        >
          <View style={styles.centerBlock}>
            <Animated.View
              style={[
                styles.logoBox,
                {
                  opacity: logoIn,
                  transform: [
                    { translateX: logoShiftX },
                    { scale: Animated.multiply(logoScaleIn, logoScaleOut) },
                  ],
                },
              ]}
            >
              <Text style={styles.logoLetter}>A</Text>
            </Animated.View>

            <Animated.View
              style={[
                styles.textBlock,
                {
                  opacity: textIn,
                  transform: [
                    {
                      translateY: textIn.interpolate({
                        inputRange: [0, 1],
                        outputRange: [10, 0],
                      }),
                    },
                  ],
                },
              ]}
            >
              <Text style={styles.brandText}>Ansar HomeWear</Text>
              <Text style={styles.taglineText}>AI КАТАЛОГ</Text>
            </Animated.View>
          </View>
        </LinearGradient>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#F3F4F6',
  },
  panelWrap: {
    width: '100%',
    overflow: 'hidden',
  },
  gradient: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerBlock: {
    alignItems: 'center',
  },
  logoBox: {
    width: LOGO_BIG,
    height: LOGO_BIG,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 14,
    elevation: 8,
  },
  logoLetter: {
    fontSize: 42,
    fontWeight: '800',
    color: '#6D3E9E',
  },
  textBlock: {
    alignItems: 'center',
    marginTop: 22,
  },
  brandText: {
    fontSize: 26,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.3,
  },
  taglineText: {
    marginTop: 6,
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.6)',
    letterSpacing: 4,
  },
});