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
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

export default function HomeScreen() {
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

  const menuItems = [
    {
      id: '1',
      title: 'Поиск по фото',
      subtitle: 'Сфотографируйте товар',
      icon: 'camera' as const,
      color: ['#3654d9', '#764ba2'],
      route: '/camera',
    },
    {
      id: '2',
      title: 'Сканер штрихкода',
      subtitle: 'Отсканируйте штрихкод',
      icon: 'barcode' as const,
      color: ['#fa709a', '#fee140'],
      route: '/barcode-scanner',
    },
    {
      id: '3',
      title: 'Каталог товаров',
      subtitle: 'Просмотр всех товаров',
      icon: 'grid' as const,
      color: ['#f093fb', '#f5576c'],
      route: '/catalog',
    },
    {
      id: '4',
      title: 'Товар на рассмотрение',
      subtitle: 'Просмотр всех товаров',
      icon: 'grid' as const,
      color: ['#5500ff', '#2ce2fa'],
      route: '/catalog',
    },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={styles.title}>Ansar HomeWear</Text>
          <Text style={styles.subtitle}>Умный поиск товаров</Text>
        </View>

        {showInstallBanner && Platform.OS === 'web' && (
          <TouchableOpacity
            style={styles.installBanner}
            onPress={handleInstall}
            activeOpacity={0.9}
            testID="install-pwa-btn"
          >
            <View style={styles.installIcon}>
              <Ionicons name="download" size={24} color="#667eea" />
            </View>
            <View style={styles.installContent}>
              <Text style={styles.installTitle}>Установить приложение</Text>
              <Text style={styles.installSubtitle}>
                Добавьте на главный экран для быстрого доступа
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={24} color="#667eea" />
          </TouchableOpacity>
        )}

        <View style={styles.cardsContainer}>
          {menuItems.map((item) => (
            <TouchableOpacity
              key={item.id}
              activeOpacity={0.9}
              onPress={() => router.push(item.route as any)}
              testID={`menu-${item.id}`}
            >
              <LinearGradient
                colors={item.color as any}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.card}
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
            <Text style={styles.footerText}>Разработчик ab.dussi</Text>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
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
    color: '#1a1a1a',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 18,
    color: '#6c757d',
  },
  installBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    marginHorizontal: 24,
    marginBottom: 16,
    padding: 16,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#667eea',
    gap: 12,
  },
  installIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#667eea15',
    alignItems: 'center',
    justifyContent: 'center',
  },
  installContent: {
    flex: 1,
  },
  installTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1a1a1a',
    marginBottom: 2,
  },
  installSubtitle: {
    fontSize: 12,
    color: '#6c757d',
  },
  cardsContainer: {
    paddingHorizontal: 24,
    gap: 16,
  },
  card: {
    borderRadius: 24,
    padding: 24,
    minHeight: 140,
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
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
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
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
    color: '#adb5bd',
  },
});