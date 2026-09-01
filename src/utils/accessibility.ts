import { Platform } from 'react-native';

/**
 * React Native Web forwards the two native-only accessibility props to the DOM,
 * where React reports them as invalid. Conditional spreads preserve native
 * screen-reader behavior without polluting the web runtime.
 */
export const decorativeAccessibilityProps =
  Platform.OS === 'web'
    ? {}
    : {
        accessibilityElementsHidden: true,
        importantForAccessibility: 'no-hide-descendants' as const,
      };

export const nativeImportantAccessibilityProps =
  Platform.OS === 'web' ? {} : { importantForAccessibility: 'yes' as const };
