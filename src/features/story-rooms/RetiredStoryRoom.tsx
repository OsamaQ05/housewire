import { useRouter } from 'expo-router';
import { View } from 'react-native';
import { ScreenShell } from '@/src/components';
import { useHousewireStore } from '@/src/store/use-housewire-store';
import { StoryButton, StoryText, ui } from './story-ui';

/** Old saved routes must not resurrect the removed room through legacy screens. */
export function RetiredStoryRoom() {
  const router = useRouter();
  return <ScreenShell style={ui.screen}>
    <View style={{ flex: 1, justifyContent: 'center', gap: 22 }}>
      <StoryText display size={40}>Three fresh stories.</StoryText>
      <StoryText>Dead Air has left the collection. Your saved game history is still here.</StoryText>
      <StoryButton label="Choose a story" onPress={() => {
        useHousewireStore.setState({ selectedMission: 'line-13', missionInProgressId: null, missionStartedAt: null });
        router.replace('/home');
      }} />
    </View>
  </ScreenShell>;
}
