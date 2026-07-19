import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  ScrollView,
  Platform,
  Linking,
  ImageBackground // Импортируем компонент для фона
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

import WelcomeScreen from './WelcomeScreen'; // путь к файлу приветствия

// Ссылка на фон
const BACKGROUND_IMAGE_URL = 'https://ansar-home.ams3.cdn.digitaloceanspaces.com/main_bg.jpg';

export default function App() {
  const [isAppReady, setIsAppReady] = useState(false);

  if (!isAppReady) {
    return <WelcomeScreen onAnimationEnd={() => setIsAppReady(true)} />;
  }

  return <HomeScreen />;
}

function HomeScreen() {
  const router = useRouter();
  const [showInstallBanner, setShowInstallBanner] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (typeof window === 'undefined') return;

    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true;
    if (isStandalone) {
      setIsInstalled(true);
      return;
    }

    if ((window as any).deferredPWAPrompt) {
      setShowInstallBanner(true);
    }

    const onInstallable = () => setShowInstallBanner(true);
    const onInstalled = () => {
      setShowInstallBanner(false);
      setIsInstalled(true);
    };

    window.addEventListener('pwa-installable', onInstallable);
    window.addEventListener('pwa-installed', onInstalled);

    return () => {
      window.removeEventListener('pwa-installable', onInstallable);
      window.removeEventListener('pwa-installed', onInstalled);
    };
  }, []);

  const handleInstall = async () => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const prompt = (window as any).deferredPWAPrompt;
    if (!prompt) return;
    prompt.prompt();
    const choice = await prompt.userChoice;
    if (choice.outcome === 'accepted') {
      setShowInstallBanner(false);
    }
    (window as any).deferredPWAPrompt = null;
  };

  // Цвета с прозрачностью (0.75), чтобы сквозь них просвечивал фон
  const menuItems = [
    {
      id: '1',
      title: 'Поиск по фото',
      subtitle: 'Сфотографируйте товар',
      icon: 'camera' as const,
      color: ['rgba(54, 84, 217, 0.75)', 'rgba(118, 75, 162, 0.75)'],
      route: '/camera',
    },
    {
      id: '2',
      title: 'Сканер штрихкода',
      subtitle: 'Отсканируйте штрихкод',
      icon: 'barcode' as const,
      color: ['rgba(250, 112, 154, 0.75)', 'rgba(254, 225, 64, 0.75)'],
      route: '/barcode-scanner',
    },
    {
      id: '3',
      title: 'Каталог товаров',
      subtitle: 'Просмотр всех товаров',
      icon: 'grid' as const,
      color: ['rgba(240, 147, 251, 0.75)', 'rgba(245, 87, 108, 0.75)'],
      route: '/catalog',
    },
    {
      id: '4',
      title: 'Товар на рассмотрение',
      subtitle: 'Проблемные товары',
      icon: 'add-circle' as const,
      color: ['rgba(85, 0, 255, 0.75)', 'rgba(44, 226, 250, 0.75)'],
      route: '/submit-pending',
    },
    {
      id: '5',
      title: 'Заявки на рассмотрение',
      subtitle: 'Для админов склада',
      icon: 'clipboard' as const,
      color: ['rgba(67, 206, 162, 0.75)', 'rgba(24, 90, 157, 0.75)'],
      route: '/pending-list',
    },
  ];

  return (
    <ImageBackground
      source={{ uri: BACKGROUND_IMAGE_URL }}
      style={styles.container}
      resizeMode="cover"
    >
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="light-content" />
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.header}>
            <Text style={styles.title}>Ansar HomeWear</Text>
            <Text style={styles.subtitle}>Умный поиск товаров</Text>
          </View>

          {showInstallBanner && Platform.OS === 'web' && (
            <TouchableOpacity
              style={styles.installBannerWrapper}
              onPress={handleInstall}
              activeOpacity={0.9}
              testID="install-pwa-btn"
            >
              {/* Фейковое стекло для баннера PWA */}
              <View style={styles.installBannerGlass}>
                <View style={styles.installIcon}>
                  <Ionicons name="download" size={24} color="#fff" />
                </View>
                <View style={styles.installContent}>
                  <Text style={styles.installTitle}>Установить приложение</Text>
                  <Text style={styles.installSubtitle}>
                    Добавьте на главный экран для быстрого доступа
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={24} color="#fff" />
              </View>
            </TouchableOpacity>
          )}

          <View style={styles.cardsContainer}>
            {menuItems.map((item) => (
              <TouchableOpacity
                key={item.id}
                activeOpacity={0.9}
                onPress={() => router.push(item.route as any)}
                testID={`menu-${item.id}`}
                style={styles.cardWrapper}
              >
                {/* Градиент с прозрачностью и светлой рамкой создает эффект стекла */}
                <LinearGradient
                  colors={item.color as any}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.cardGradientGlass}
                >
                  <View style={styles.cardHeaderRow}>
                    <View style={styles.cardIcon}>
                      <Ionicons name={item.icon} size={32} color="white" />
                    </View>
                    <Text style={styles.cardTitle}>{item.title}</Text>
                  </View>
                  <Text style={styles.cardSubtitle}>{item.subtitle}</Text>
                </LinearGradient>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.footer}>
            {isInstalled ? (
              <Text style={styles.footerText}>
                ✓ Установлено как приложение • v2.0.0
              </Text>
            ) : (
              <Text style={styles.footerText}>
                Разработчики{' '}
                <Text
                  style={styles.devLink}
                  onPress={() => Linking.openURL('https://instagram.com/ab.dussi')}
                >
                  ab.dussi
                </Text>
                ,{' '}
                <Text
                  style={styles.devLink}
                  onPress={() => Linking.openURL('https://instagram.com/du.z.r')}
                >
                  du.z.r
                </Text>
              </Text>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000', 
  },
  safeArea: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 24,
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 16,
  },
  title: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#fff', 
    marginBottom: 8,
    textShadowColor: 'rgba(0, 0, 0, 0.4)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
  subtitle: {
    fontSize: 18,
    color: 'rgba(255, 255, 255, 0.85)',
  },

  installBannerWrapper: {
    marginHorizontal: 24,
    marginBottom: 16,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
  // Имитация стекла для баннера
  installBannerGlass: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.15)', // полупрозрачный белый фон
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)', // тонкая белая грань (эффект стекла)
  },
  installIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(102, 126, 234, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  installContent: {
    flex: 1,
    paddingHorizontal: 12,
  },
  installTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 2,
  },
  installSubtitle: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.7)',
  },

  cardsContainer: {
    paddingHorizontal: 24,
    gap: 16,
  },
  cardWrapper: {
    borderRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 8,
  },
  // Имитация стекла для плиток (добавлена обводка)
  cardGradientGlass: {
    borderRadius: 24,
    padding: 24,
    minHeight: 140,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)', // блик по краям
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  cardIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: 'white',
  },
  cardSubtitle: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.9)',
  },

  footer: {
    marginTop: 32,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.6)',
  },
  devLink: {
    color: '#fff',
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
});