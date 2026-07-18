import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  ScrollView,
  TextInput,
  Image,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

interface PendingProduct {
  id: string;
  name?: string;
  images: string[];
  barcode?: string;
  article_number?: string;
  note?: string;
  created_at: string;
}

async function compressBase64(base64: string, maxWidth = 800, quality = 0.6): Promise<string> {
  if (Platform.OS !== 'web' || typeof document === 'undefined') {
    return base64;
  }
  return new Promise((resolve) => {
    try {
      const img = new window.Image();
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width);
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(base64);
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(dataUrl.split(',')[1] || base64);
      };
      img.onerror = () => resolve(base64);
      img.src = `data:image/jpeg;base64,${base64}`;
    } catch {
      resolve(base64);
    }
  });
}

export default function PendingDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [pending, setPending] = useState<PendingProduct | null>(null);
  const [loading, setLoading] = useState(true);

  // Форма админа для публикации
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [barcode, setBarcode] = useState('');
  const [articleNumber, setArticleNumber] = useState('');
  const [newImages, setNewImages] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const response = await fetch(`${API_URL}/api/pending-products/${id}`);
        if (!response.ok) throw new Error('bad status');
        const data: PendingProduct = await response.json();
        setPending(data);
        setName(data.name || '');
        setBarcode(data.barcode || '');
        setArticleNumber(data.article_number || '');
      } catch {
        Alert.alert('Ошибка', 'Заявка не найдена');
        router.back();
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const pickImage = async () => {
    if (newImages.length >= 5) {
      Alert.alert('Ограничение', 'Максимум 5 фото');
      return;
    }
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.7,
        base64: true,
      });
      if (!result.canceled && result.assets[0].base64) {
        const compressed = await compressBase64(result.assets[0].base64);
        setNewImages((prev) => [...prev, compressed]);
      }
    } catch {
      Alert.alert('Ошибка', 'Не удалось добавить фото');
    }
  };

  const removeImage = (idx: number) => {
    setNewImages((prev) => prev.filter((_, i) => i !== idx));
  };

  const publish = async () => {
    if (!name.trim()) {
      Alert.alert('Заполните', 'Название обязательно');
      return;
    }
    const priceNum = parseFloat(price.replace(',', '.'));
    if (isNaN(priceNum) || priceNum <= 0) {
      Alert.alert('Заполните', 'Введите корректную цену');
      return;
    }
    if (newImages.length === 0) {
      Alert.alert('Нужны фото', 'Загрузите хотя бы одно фото для каталога');
      return;
    }

    try {
      setSubmitting(true);
      const response = await fetch(`${API_URL}/api/pending-products/${id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          price: priceNum,
          barcode: barcode.trim() || null,
          article_number: articleNumber.trim() || null,
          images: newImages,
        }),
      });
      if (!response.ok) throw new Error('bad status');

      if (Platform.OS === 'web') {
        window.alert('Товар опубликован в каталоге');
      } else {
        Alert.alert('Готово', 'Товар опубликован в каталоге');
      }
      router.back();
    } catch {
      Alert.alert('Ошибка', 'Не удалось опубликовать товар');
    } finally {
      setSubmitting(false);
    }
  };

  const reject = async () => {
    const confirm =
      Platform.OS === 'web'
        ? window.confirm('Отклонить заявку? Фото будут удалены.')
        : await new Promise<boolean>((resolve) => {
            Alert.alert('Отклонить заявку?', 'Фото будут удалены', [
              { text: 'Отмена', style: 'cancel', onPress: () => resolve(false) },
              { text: 'Отклонить', style: 'destructive', onPress: () => resolve(true) },
            ]);
          });
    if (!confirm) return;

    try {
      setSubmitting(true);
      const response = await fetch(`${API_URL}/api/pending-products/${id}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('bad status');
      router.back();
    } catch {
      Alert.alert('Ошибка', 'Не удалось отклонить');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#667eea" />
        </View>
      </SafeAreaView>
    );
  }
  if (!pending) return null;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#1a1a1a" />
        </TouchableOpacity>
        <Text style={styles.title}>Оформить заявку</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Инфа от кассира */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>От кассира</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.origPhotos}>
            {pending.images.map((url, i) => (
              <Image key={i} source={{ uri: url }} style={styles.origPhoto} resizeMode="cover" />
            ))}
          </ScrollView>
          {pending.name && <Text style={styles.origMeta}>Название: {pending.name}</Text>}
          {pending.barcode && <Text style={styles.origMeta}>Штрихкод: {pending.barcode}</Text>}
          {pending.article_number && (
            <Text style={styles.origMeta}>Артикул: {pending.article_number}</Text>
          )}
          {pending.note && <Text style={styles.origMeta}>Комментарий: {pending.note}</Text>}
        </View>

        {/* Форма оформления */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Опубликовать в каталог</Text>

          <Text style={styles.label}>Новые фото товара</Text>
          <Text style={styles.hint}>
            Переснимите товар в нормальных условиях и загрузите сюда
          </Text>
          <View style={styles.photosRow}>
            {newImages.map((img, idx) => (
              <View key={idx} style={styles.photoWrap}>
                <Image source={{ uri: `data:image/jpeg;base64,${img}` }} style={styles.photo} />
                <TouchableOpacity style={styles.photoRemove} onPress={() => removeImage(idx)}>
                  <Ionicons name="close-circle" size={24} color="#f5576c" />
                </TouchableOpacity>
              </View>
            ))}
            {newImages.length < 5 && (
              <TouchableOpacity style={styles.photoAdd} onPress={pickImage}>
                <Ionicons name="camera" size={32} color="#667eea" />
                <Text style={styles.photoAddText}>Добавить</Text>
              </TouchableOpacity>
            )}
          </View>

          <Text style={styles.label}>Название *</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Название товара"
            placeholderTextColor="#adb5bd"
          />

          <Text style={styles.label}>Цена (₸) *</Text>
          <TextInput
            style={styles.input}
            value={price}
            onChangeText={setPrice}
            placeholder="350"
            keyboardType="numeric"
            placeholderTextColor="#adb5bd"
          />

          <Text style={styles.label}>Штрихкод</Text>
          <TextInput
            style={styles.input}
            value={barcode}
            onChangeText={setBarcode}
            placeholder="Числа с упаковки"
            keyboardType="numeric"
            placeholderTextColor="#adb5bd"
          />

          <Text style={styles.label}>Артикул</Text>
          <TextInput
            style={styles.input}
            value={articleNumber}
            onChangeText={setArticleNumber}
            placeholder="Артикул"
            placeholderTextColor="#adb5bd"
          />
        </View>

        <TouchableOpacity
          style={[styles.publishBtn, submitting && { opacity: 0.6 }]}
          onPress={publish}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator color="white" />
          ) : (
            <>
              <Ionicons name="checkmark" size={20} color="white" />
              <Text style={styles.publishBtnText}>Опубликовать в каталог</Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.rejectBtn, submitting && { opacity: 0.6 }]}
          onPress={reject}
          disabled={submitting}
        >
          <Ionicons name="close" size={20} color="#f5576c" />
          <Text style={styles.rejectBtnText}>Отклонить заявку</Text>
        </TouchableOpacity>
      </ScrollView>
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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scrollContent: { padding: 16, paddingBottom: 40 },
  section: {
    backgroundColor: 'white', borderRadius: 16, padding: 16, marginBottom: 16,
  },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', color: '#1a1a1a', marginBottom: 12 },
  origPhotos: { marginBottom: 12 },
  origPhoto: {
    width: 120, height: 120, borderRadius: 12, marginRight: 8, backgroundColor: '#dee2e6',
  },
  origMeta: { fontSize: 14, color: '#495057', marginTop: 4 },
  label: { fontSize: 14, fontWeight: '600', color: '#1a1a1a', marginTop: 12, marginBottom: 8 },
  hint: { fontSize: 12, color: '#6c757d', marginBottom: 8 },
  input: {
    backgroundColor: '#f8f9fa', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: '#1a1a1a',
  },
  photosRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  photoWrap: { position: 'relative' },
  photo: { width: 100, height: 100, borderRadius: 12, backgroundColor: '#dee2e6' },
  photoRemove: { position: 'absolute', top: -8, right: -8, backgroundColor: 'white', borderRadius: 12 },
  photoAdd: {
    width: 100, height: 100, borderRadius: 12, borderWidth: 2, borderColor: '#667eea',
    borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', gap: 4,
  },
  photoAddText: { fontSize: 12, color: '#667eea', fontWeight: '600' },
  publishBtn: {
    backgroundColor: '#667eea', borderRadius: 12, paddingVertical: 16,
    alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8,
    marginBottom: 12,
  },
  publishBtnText: { color: 'white', fontSize: 16, fontWeight: '600' },
  rejectBtn: {
    borderRadius: 12, paddingVertical: 16,
    alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8,
    borderWidth: 2, borderColor: '#f5576c',
  },
  rejectBtnText: { color: '#f5576c', fontSize: 16, fontWeight: '600' },
});
