import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

export default function HomeScreen() {
  const router = useRouter();

  const menuItems = [
    {
      id: '1',
      title: 'Поиск по фото',
      subtitle: 'Сфотографируйте товар',
      icon: 'camera' as const,
      color: ['#667eea', '#764ba2'],
      route: '/camera',
    },
    {
      id: '2',
      title: 'Каталог товаров',
      subtitle: 'Просмотр всех товаров',
      icon: 'grid' as const,
      color: ['#f093fb', '#f5576c'],
      route: '/catalog',
    },
    {
      id: '3',
      title: 'Добавить товар',
      subtitle: 'Новый товар в каталог',
      icon: 'add-circle' as const,
      color: ['#4facfe', '#00f2fe'],
      route: '/add-product',
    },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={styles.title}>AI Каталог</Text>
          <Text style={styles.subtitle}>Умный поиск товаров</Text>
        </View>

        <View style={styles.cardsContainer}>
          {menuItems.map((item) => (
            <TouchableOpacity
              key={item.id}
              activeOpacity={0.9}
              onPress={() => router.push(item.route as any)}
            >
              <LinearGradient
                colors={item.color}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.card}
              >
                <View style={styles.cardIcon}>
                  <Ionicons name={item.icon} size={40} color="white" />
                </View>
                <Text style={styles.cardTitle}>{item.title}</Text>
                <Text style={styles.cardSubtitle}>{item.subtitle}</Text>
              </LinearGradient>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Версия 1.0.0</Text>
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
    paddingTop: 40,
    paddingBottom: 32,
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
  cardsContainer: {
    paddingHorizontal: 24,
    gap: 16,
  },
  card: {
    borderRadius: 24,
    padding: 24,
    minHeight: 160,
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
  cardIcon: {
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 4,
  },
  cardSubtitle: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.9)',
  },
  footer: {
    marginTop: 40,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 12,
    color: '#adb5bd',
  },
});
