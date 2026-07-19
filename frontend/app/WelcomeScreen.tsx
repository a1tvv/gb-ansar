import React, { useEffect, useRef } from 'react';
import { StyleSheet, View, Text, Animated, Dimensions } from 'react-native';

const { height } = Dimensions.get('window');

interface WelcomeScreenProps {
  onAnimationEnd: () => void;
}

export default function WelcomeScreen({ onAnimationEnd }: WelcomeScreenProps) {
  // Создаем рефы для анимаций
  const fadeAnim = useRef(new Animated.Value(0)).current;      // Прозрачность
  const scaleAnim = useRef(new Animated.Value(0.8)).current;    // Масштаб лого
  const slideAnim = useRef(new Animated.Value(30)).current;     // Выплывание снизу

  useEffect(() => {
    // Запускаем параллельно три анимации
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 1000,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 6,
        tension: 40,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 800,
        useNativeDriver: true,
      }),
    ]).start(() => {
      // Задержка в 1.5 секунды, чтобы пользователь успел кайфануть от анимации
      setTimeout(() => {
        // Сигнализируем родительскому компоненту, что пора открывать каталог
        onAnimationEnd();
      }, 1500);
    });
  }, []);

  return (
    <View style={styles.container}>
      <Animated.View
        style={[
          styles.logoContainer,
          {
            opacity: fadeAnim,
            transform: [{ scale: scaleAnim }],
          },
        ]}
      >
        {/* Здесь может быть твоя SVG-иконка или картинка */}
        <Text style={styles.logoText}>Ansar HomeWear</Text>
      </Animated.View>

      <Animated.View
        style={[
          styles.footerContainer,
          {
            opacity: fadeAnim,
            transform: [{ translateY: slideAnim }],
          },
        ]}
      >
        <Text style={styles.loaderText}>Разработчики Абдурахим, Зайд</Text>
        <View style={styles.progressBar}>
          <Animated.View style={styles.progressLine} />
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a', // Темный стильный фон
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoContainer: {
    alignItems: 'center',
  },
  logoText: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#ffffff',
    letterSpacing: 2,
  },
  footerContainer: {
    position: 'absolute',
    bottom: height * 0.1,
    alignItems: 'center',
  },
  loaderText: {
    color: '#888888',
    fontSize: 14,
    marginBottom: 10,
  },
  progressBar: {
    width: 150,
    height: 3,
    backgroundColor: '#333333',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressLine: {
    width: '100%',
    height: '100%',
    backgroundColor: '#667eea', // Фиолетовый бренд-цвет
  },
});