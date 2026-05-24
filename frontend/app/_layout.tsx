import { Stack } from 'expo-router';
import { useEffect } from 'react';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Asset } from 'expo-asset';
import { Image } from 'react-native';

SplashScreen.preventAutoHideAsync();

// Prewarm icon assets for Android Expo Go
function cacheImages(images: any[]) {
  return images.map(image => {
    if (typeof image === 'string') {
      return Image.prefetch(image);
    } else {
      return Asset.fromModule(image).downloadAsync();
    }
  });
}

export default function RootLayout() {
  useEffect(() => {
    async function prepare() {
      try {
        // Prewarm any assets here if needed
        await SplashScreen.hideAsync();
      } catch (e) {
        console.warn(e);
      }
    }
    prepare();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="camera" />
        <Stack.Screen name="catalog" />
        <Stack.Screen name="add-product" />
        <Stack.Screen name="edit-product" />
        <Stack.Screen name="product-detail" />
      </Stack>
    </GestureHandlerRootView>
  );
}
