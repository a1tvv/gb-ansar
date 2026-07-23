import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  Platform,
  Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import WelcomeScreen from './WelcomeScreen';

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

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />

      {/* Хедер сверху */}
      <View style={styles.header}>
        <Text style={styles.title}>Ansar HomeWear</Text>
        <Text style={styles.subtitle}>Каталог и поиск товаров</Text>
      </View>

      {/* Центральная зона — вся навигация здесь, вертикально по центру */}
      <View style={styles.centerZone}>

        {showInstallBanner && Platform.OS === 'web' && (
          <TouchableOpacity
            style={styles.installBanner}
            onPress={handleInstall}
            activeOpacity={0.8}
            testID="install-pwa-btn"
          >
            <View style={styles.installIconWrap}>
              <Ionicons name="download-outline" size={20} color="#4F46E5" />
            </View>
            <View style={styles.installContent}>
              <Text style={styles.installTitle}>Установить на телефон</Text>
              <Text style={styles.installSubtitle}>Быстрый доступ</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
          </TouchableOpacity>
        )}

        {/* Топ-2 приоритетных действия */}
        <View style={styles.primarySection}>
          <PrimaryAction
            title="Поиск по фото"
            subtitle="Сфотографируйте товар"
            icon="camera"
            accentColor="#4F46E5"
            onPress={() => router.push('/camera')}
            testID="menu-1"
          />
          <PrimaryAction
            title="Сканер штрихкода"
            subtitle="Отсканируйте код с упаковки"
            icon="barcode"
            accentColor="#059669"
            onPress={() => router.push('/barcode-scanner')}
            testID="menu-2"
          />
        </View>

        {/* Каталог */}
        <TouchableOpacity
          style={styles.secondaryAction}
          onPress={() => router.push('/catalog')}
          activeOpacity={0.7}
          testID="menu-3"
        >
          <View style={[styles.secondaryIcon, { backgroundColor: '#F3F4F6' }]}>
            <Ionicons name="grid-outline" size={20} color="#374151" />
          </View>
          <View style={styles.secondaryContent}>
            <Text style={styles.secondaryTitle}>Каталог товаров</Text>
            <Text style={styles.secondaryHint}>Все товары склада</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
        </TouchableOpacity>

        {/* Группа pending */}
        <View style={styles.tertiaryGroup}>
          <TouchableOpacity
            style={[styles.tertiaryAction, styles.tertiaryDivider]}
            onPress={() => router.push('/submit-pending')}
            activeOpacity={0.7}
            testID="menu-4"
          >
            <View style={[styles.tertiaryIcon, { backgroundColor: '#FEF3C7' }]}>
              <Ionicons name="add" size={18} color="#D97706" />
            </View>
            <View style={styles.tertiaryContent}>
              <Text style={styles.tertiaryTitle}>Отправить товар</Text>
              <Text style={styles.tertiaryHint}>Проблемный товар админу</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#9CA3AF" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.tertiaryAction}
            onPress={() => router.push('/pending-list')}
            activeOpacity={0.7}
            testID="menu-5"
          >
            <View style={[styles.tertiaryIcon, { backgroundColor: '#DBEAFE' }]}>
              <Ionicons name="clipboard-outline" size={18} color="#2563EB" />
            </View>
            <View style={styles.tertiaryContent}>
              <Text style={styles.tertiaryTitle}>Заявки на рассмотрение</Text>
              <Text style={styles.tertiaryHint}>Для админов склада</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#9CA3AF" />
          </TouchableOpacity>
        </View>

      </View>

      {/* Футер снизу */}
      <View style={styles.footer}>
        {isInstalled ? (
          <Text style={styles.footerText}>✓ Установлено как приложение · v2.0</Text>
        ) : (
          <Text style={styles.footerText}>
            Разработчики{' '}
            <Text
              style={styles.devLink}
              onPress={() => Linking.openURL('https://instagram.com/ab.dussi')}
            >
              ab.dussi
            </Text>
            {', '}
            <Text
              style={styles.devLink}
              onPress={() => Linking.openURL('https://instagram.com/du.z.r')}
            >
              du.z.r
            </Text>
          </Text>
        )}
      </View>

    </SafeAreaView>
  );
}

function PrimaryAction({
  title,
  subtitle,
  icon,
  accentColor,
  onPress,
  testID,
}: {
  title: string;
  subtitle: string;
  icon: any;
  accentColor: string;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <TouchableOpacity
      style={styles.primaryAction}
      onPress={onPress}
      activeOpacity={0.8}
      testID={testID}
    >
      <View style={[styles.primaryIconWrap, { backgroundColor: `${accentColor}15` }]}>
        <Ionicons name={icon} size={28} color={accentColor} />
      </View>
      <View style={styles.primaryContent}>
        <Text style={styles.primaryTitle}>{title}</Text>
        <Text style={styles.primarySubtitle}>{subtitle}</Text>
      </View>
      <View style={[styles.primaryArrow, { backgroundColor: accentColor }]}>
        <Ionicons name="arrow-forward" size={16} color="white" />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },

  // Хедер компактный сверху
  header: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 2,
  },

  // Центральная зона — весь контент, вертикально по центру
  centerZone: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
  },

  // PWA
  installBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    backgroundColor: 'white',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  installIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  installContent: { flex: 1 },
  installTitle: { fontSize: 13, fontWeight: '600', color: '#111827' },
  installSubtitle: { fontSize: 11, color: '#6B7280', marginTop: 1 },

  // Крупные основные действия
  primarySection: { gap: 10, marginBottom: 10 },
  primaryAction: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    borderRadius: 14,
    padding: 14,
    gap: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  primaryIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryContent: { flex: 1 },
  primaryTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  primarySubtitle: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  primaryArrow: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Каталог
  secondaryAction: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 12,
    gap: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  secondaryIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryContent: { flex: 1 },
  secondaryTitle: { fontSize: 14, fontWeight: '600', color: '#111827' },
  secondaryHint: { fontSize: 11, color: '#6B7280', marginTop: 1 },

  // Pending группа
  tertiaryGroup: {
    backgroundColor: 'white',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    overflow: 'hidden',
  },
  tertiaryAction: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 12,
  },
  tertiaryDivider: {
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  tertiaryIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tertiaryContent: { flex: 1 },
  tertiaryTitle: { fontSize: 13, fontWeight: '600', color: '#111827' },
  tertiaryHint: { fontSize: 11, color: '#6B7280', marginTop: 1 },

  // Футер снизу
  footer: {
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 16,
    paddingTop: 8,
  },
  footerText: { fontSize: 11, color: '#9CA3AF' },
  devLink: { color: '#4F46E5', fontWeight: '600' },
});