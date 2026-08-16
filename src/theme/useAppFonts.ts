// Loads the three type families the design system depends on. Called once in
// App.tsx; nothing renders until these resolve so we never flash system fonts.

import {
  useFonts,
  SpaceGrotesk_400Regular,
  SpaceGrotesk_500Medium,
  SpaceGrotesk_700Bold,
} from '@expo-google-fonts/space-grotesk';
import { SpaceMono_400Regular, SpaceMono_700Bold } from '@expo-google-fonts/space-mono';
import {
  Newsreader_400Regular,
  Newsreader_500Medium,
  Newsreader_400Regular_Italic,
} from '@expo-google-fonts/newsreader';

export function useAppFonts(): boolean {
  const [loaded, error] = useFonts({
    SpaceGrotesk_400Regular,
    SpaceGrotesk_500Medium,
    SpaceGrotesk_700Bold,
    SpaceMono_400Regular,
    SpaceMono_700Bold,
    Newsreader_400Regular,
    Newsreader_500Medium,
    Newsreader_400Regular_Italic,
  });
  // Never block the app forever on fonts: if loading errors, proceed with system
  // fonts rather than getting stuck on a blank loading screen. (RN gracefully
  // falls back to the default font for any unresolved fontFamily.)
  if (error) {
    console.warn('[BOOT] Font loading failed, continuing with system fonts:', error);
    return true;
  }
  return loaded;
}
