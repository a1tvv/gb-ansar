import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  FlatList,
  Image,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;
const PAGE_SIZE = 20;

interface PendingProduct {
  id: string;
  name?: string;
  images: string[];
  barcode?: string;
  article_number?: string;
  note?: string;
  created_at: string;
}

export default function PendingListScreen() {
  const router = useRouter();
  const [items, setItems] = useState<PendingProduct[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [skip, setSkip] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  const load = useCallback(async (reset = false) => {
    const currentSkip = reset ? 0 : skip;
    if (!reset && (isLoadingMore || !hasMore)) return;
    try {
      if (reset) setIsLoading(true);
      else setIsLoadingMore(true);

      const response = await fetch(
        `${API_URL}/api/pending-products?skip=${currentSkip}&limit=${PAGE_SIZE}`
      );
      const data = await response.json();

      if (reset) {
        setItems(data);
        setSkip(PAGE_SIZE);
      } else {
        setItems((prev) => [...prev, ...data]);
        setSkip((prev) => prev + PAGE_SIZE);
      }
      setHasMore(data.length === PAGE_SIZE);
    } catch (e) {
      Alert.alert('Ошибка', 'Не удалось загрузить заявки');
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
      setRefreshing(false);
    }
  }, [skip, isLoadingMore, hasMore]);

  useFocusEffect(
    useCallback(() => {
      setSkip(0);
      setHasMore(true);
      load(true);
    }, [])
  );

  const onRefresh = () => {
    setRefreshing(true);
    setSkip(0);
    setHasMore(true);
    load(true);
  };

  const renderCard = ({ item }: { item: PendingProduct }) => {
    const mainImage = item.images && item.images.length > 0 ? item.images[0] : null;
    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.7}
        onPress={() =>
          router.push({ pathname: '/pending-detail', params: { id: item.id } })
        }
      >
        {mainImage ? (
          <Image source={{ uri: mainImage }} style={styles.image} resizeMode="cover" />
        ) : (
          <View style={[styles.image, styles.noImage]}>
            <Ionicons name="image-outline" size={48} color="#adb5bd" />
          </View>
        )}
        {item.images && item.images.length > 1 && (
          <View style={styles.photoCount}>
            <Ionicons name="images" size={12} color="white" />
            <Text style={styles.photoCountText}>{item.images.length}</Text>
          </View>
        )}
        <View style={styles.info}>
          <Text style={styles.name} numberOfLines={2}>
            {item.name || '(без названия)'}
          </Text>
          {item.barcode && <Text style={styles.meta}>Штрихкод: {item.barcode}</Text>}
          {item.article_number && (
            <Text style={styles.meta}>Артикул: {item.article_number}</Text>
          )}
          <View style={styles.actionRow}>
            <Text style={styles.reviewLabel}>На рассмотрении</Text>
            <Ionicons name="chevron-forward" size={20} color="#667eea" />
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#1a1a1a" />
        </TouchableOpacity>
        <Text style={styles.title}>Заявки на рассмотрение</Text>
        <View style={{ width: 40 }} />
      </View>

      {isLoading && !refreshing ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#667eea" />
          <Text style={styles.centerText}>Загрузка...</Text>
        </View>
      ) : items.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="checkmark-circle-outline" size={80} color="#dee2e6" />
          <Text style={styles.emptyTitle}>Пусто</Text>
          <Text style={styles.emptyText}>Заявок на рассмотрение сейчас нет</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          renderItem={renderCard}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#667eea" />
          }
          onEndReached={() => {
            if (hasMore && !isLoadingMore) load(false);
          }}
          onEndReachedThreshold={0.3}
          ListFooterComponent={
            isLoadingMore ? (
              <View style={{ padding: 16, alignItems: 'center' }}>
                <ActivityIndicator size="small" color="#667eea" />
              </View>
            ) : null
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 16, backgroundColor: 'white',
  },
  backBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 20, fontWeight: 'bold', color: '#1a1a1a' },
  list: { padding: 16, paddingBottom: 24 },
  card: {
    backgroundColor: 'white', borderRadius: 16, marginBottom: 16,
    overflow: 'hidden', position: 'relative',
  },
  image: { width: '100%', height: 200, backgroundColor: '#f8f9fa' },
  noImage: { alignItems: 'center', justifyContent: 'center' },
  photoCount: {
    position: 'absolute', top: 12, right: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12,
  },
  photoCountText: { color: 'white', fontSize: 12, fontWeight: '600' },
  info: { padding: 16 },
  name: { fontSize: 18, fontWeight: 'bold', color: '#1a1a1a', marginBottom: 4 },
  meta: { fontSize: 14, color: '#6c757d', marginTop: 2 },
  actionRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: 12,
  },
  reviewLabel: {
    fontSize: 12, fontWeight: '600', color: '#fa709a',
    backgroundColor: '#ffe4e6', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8,
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  centerText: { marginTop: 16, fontSize: 16, color: '#6c757d' },
  emptyTitle: { fontSize: 24, fontWeight: 'bold', color: '#1a1a1a', marginTop: 16 },
  emptyText: { fontSize: 16, color: '#6c757d', marginTop: 8, textAlign: 'center' },
});
