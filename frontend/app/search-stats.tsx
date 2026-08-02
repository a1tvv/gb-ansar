import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

interface NotFoundItem {
  query: string;
  count: number;
  last_seen: string;
}

interface FoundItem {
  query: string;
  count: number;
}

interface Stats {
  days: number;
  total_searches: number;
  found_count: number;
  not_found_count: number;
  success_rate: number;
  top_not_found: NotFoundItem[];
  top_found: FoundItem[];
}

const PERIODS = [
  { label: '7 дней', value: 7 },
  { label: '30 дней', value: 30 },
  { label: '90 дней', value: 90 },
];

export default function SearchStatsScreen() {
  const router = useRouter();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [days, setDays] = useState(7);

  const load = useCallback(async (period: number) => {
    try {
      setLoading(true);
      const resp = await fetch(`${API_URL}/api/search-logs/stats?days=${period}`);
      const data = await resp.json();
      setStats(data);
    } catch {
      Alert.alert('Ошибка', 'Не удалось загрузить статистику');
      setStats(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load(days);
    }, [days, load])
  );

  const onRefresh = () => {
    setRefreshing(true);
    load(days);
  };

  const formatDate = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
    } catch {
      return '';
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />

      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Статистика поиска</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#4F46E5" />
        }
      >
        {/* Переключатель периода */}
        <View style={styles.periodRow}>
          {PERIODS.map((p) => (
            <TouchableOpacity
              key={p.value}
              style={[styles.periodBtn, days === p.value && styles.periodBtnActive]}
              onPress={() => setDays(p.value)}
              activeOpacity={0.7}
            >
              <Text style={[styles.periodText, days === p.value && styles.periodTextActive]}>
                {p.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {loading && !refreshing ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color="#4F46E5" />
          </View>
        ) : !stats || stats.total_searches === 0 ? (
          <View style={styles.emptyWrap}>
            <Ionicons name="bar-chart-outline" size={64} color="#D1D5DB" />
            <Text style={styles.emptyTitle}>Пока нет данных</Text>
            <Text style={styles.emptyText}>
              Статистика появится после того, как кассиры начнут искать товары по фото
            </Text>
          </View>
        ) : (
          <>
            {/* Сводка цифрами */}
            <View style={styles.cardsRow}>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>{stats.total_searches}</Text>
                <Text style={styles.statLabel}>всего поисков</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={[styles.statValue, { color: '#059669' }]}>
                  {stats.success_rate}%
                </Text>
                <Text style={styles.statLabel}>нашлось</Text>
              </View>
            </View>

            <View style={styles.cardsRow}>
              <View style={styles.statCard}>
                <Text style={[styles.statValue, { color: '#059669' }]}>
                  {stats.found_count}
                </Text>
                <Text style={styles.statLabel}>найдено</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={[styles.statValue, { color: '#DC2626' }]}>
                  {stats.not_found_count}
                </Text>
                <Text style={styles.statLabel}>не найдено</Text>
              </View>
            </View>

            {/* Чего нет в каталоге */}
            <Text style={styles.sectionLabel}>ЧЕГО НЕТ В КАТАЛОГЕ</Text>
            {stats.top_not_found.length === 0 ? (
              <View style={styles.emptyBlock}>
                <Text style={styles.emptyBlockText}>
                  Все запросы находились — каталог полный
                </Text>
              </View>
            ) : (
              <View style={styles.listBlock}>
                {stats.top_not_found.map((item, idx) => (
                  <TouchableOpacity
                    key={item.query + idx}
                    style={[
                      styles.listRow,
                      idx < stats.top_not_found.length - 1 && styles.listDivider,
                    ]}
                    activeOpacity={0.7}
                    onPress={() =>
                      router.push({ pathname: '/catalog', params: { q: item.query } })
                    }
                  >
                    <View style={[styles.countBadge, styles.countBadgeRed]}>
                      <Text style={styles.countBadgeText}>{item.count}</Text>
                    </View>
                    <View style={styles.rowContent}>
                      <Text style={styles.rowTitle}>{item.query}</Text>
                      <Text style={styles.rowHint}>
                        последний раз {formatDate(item.last_seen)}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color="#9CA3AF" />
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <Text style={styles.hintUnderList}>
              Эти товары кассиры искали, но в каталоге их нет. Добавьте их через бота — и
              поиск начнёт находить.
            </Text>

            {/* Что чаще всего ищут */}
            <Text style={styles.sectionLabel}>ЧАЩЕ ВСЕГО ИЩУТ</Text>
            {stats.top_found.length === 0 ? (
              <View style={styles.emptyBlock}>
                <Text style={styles.emptyBlockText}>Пока нет данных</Text>
              </View>
            ) : (
              <View style={styles.listBlock}>
                {stats.top_found.map((item, idx) => (
                  <View
                    key={item.query + idx}
                    style={[
                      styles.listRow,
                      idx < stats.top_found.length - 1 && styles.listDivider,
                    ]}
                  >
                    <View style={[styles.countBadge, styles.countBadgeGreen]}>
                      <Text style={styles.countBadgeText}>{item.count}</Text>
                    </View>
                    <View style={styles.rowContent}>
                      <Text style={styles.rowTitle}>{item.query}</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14, backgroundColor: 'white',
    borderBottomWidth: 1, borderBottomColor: '#E5E7EB',
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#111827' },

  scrollContent: { padding: 16, paddingBottom: 40 },

  periodRow: {
    flexDirection: 'row', gap: 8, marginBottom: 16,
  },
  periodBtn: {
    flex: 1, paddingVertical: 9, borderRadius: 10,
    backgroundColor: 'white',
    borderWidth: 1, borderColor: '#E5E7EB',
    alignItems: 'center',
  },
  periodBtnActive: { backgroundColor: '#4F46E5', borderColor: '#4F46E5' },
  periodText: { fontSize: 13, fontWeight: '600', color: '#6B7280' },
  periodTextActive: { color: 'white' },

  loadingWrap: { paddingVertical: 60, alignItems: 'center' },

  emptyWrap: {
    paddingVertical: 50, alignItems: 'center', paddingHorizontal: 24,
  },
  emptyTitle: {
    fontSize: 18, fontWeight: '700', color: '#111827', marginTop: 14, marginBottom: 6,
  },
  emptyText: {
    fontSize: 13, color: '#6B7280', textAlign: 'center', lineHeight: 19,
  },

  cardsRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  statCard: {
    flex: 1, backgroundColor: 'white', borderRadius: 12,
    paddingVertical: 16, paddingHorizontal: 14,
    borderWidth: 1, borderColor: '#E5E7EB',
  },
  statValue: { fontSize: 26, fontWeight: '800', color: '#111827' },
  statLabel: { fontSize: 12, color: '#6B7280', marginTop: 2 },

  sectionLabel: {
    fontSize: 11, fontWeight: '700', color: '#6B7280',
    letterSpacing: 0.5, marginTop: 22, marginBottom: 8, paddingHorizontal: 4,
  },

  listBlock: {
    backgroundColor: 'white', borderRadius: 12,
    borderWidth: 1, borderColor: '#E5E7EB', overflow: 'hidden',
  },
  listRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 12, paddingHorizontal: 12, gap: 12,
  },
  listDivider: { borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  countBadge: {
    minWidth: 34, height: 28, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6,
  },
  countBadgeRed: { backgroundColor: '#FEE2E2' },
  countBadgeGreen: { backgroundColor: '#D1FAE5' },
  countBadgeText: { fontSize: 13, fontWeight: '700', color: '#111827' },
  rowContent: { flex: 1 },
  rowTitle: { fontSize: 14, fontWeight: '600', color: '#111827' },
  rowHint: { fontSize: 11, color: '#9CA3AF', marginTop: 2 },

  emptyBlock: {
    backgroundColor: 'white', borderRadius: 12, paddingVertical: 20,
    alignItems: 'center', borderWidth: 1, borderColor: '#E5E7EB',
  },
  emptyBlockText: { fontSize: 13, color: '#9CA3AF' },

  hintUnderList: {
    fontSize: 12, color: '#6B7280', lineHeight: 18,
    marginTop: 10, paddingHorizontal: 4,
  },
});