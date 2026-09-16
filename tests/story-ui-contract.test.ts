import { describe, expect, it } from 'vitest';
import { createStoryState, projectStoryView } from '../src/features/story-rooms/engine';
import { getStoryRoom } from '../src/features/story-rooms/catalog';
import { evidenceMarker, matchesEvidenceMarker } from '../src/features/story-rooms/evidence-marker';
import { storyGuideContext } from '../src/features/story-rooms/guide-context';
import { guideContextSchema } from '../src/features/director/guide-domain';
import { STORY_ROOM_IDS } from '../src/features/story-rooms/types';
import { isActivityKind } from '../src/features/story-rooms/activities/contracts';
import { createActivityState } from '../src/features/story-rooms/activities/registry';
import { initialStoryDraft } from '../src/features/story-rooms/interaction-rules';

describe('Story-room UI boundaries', () => {
  it('camera evidence accepts only the correct station in the same run', () => {
    const raw = evidenceMarker('run-a', 'partner');
    expect(matchesEvidenceMarker(raw, 'run-a', 'partner')).toBe(true);
    expect(matchesEvidenceMarker(raw, 'run-b', 'partner')).toBe(false);
    expect(matchesEvidenceMarker(raw, 'run-a', 'host')).toBe(false);
    expect(matchesEvidenceMarker('not JSON', 'run-a', 'partner')).toBe(false);
    expect(matchesEvidenceMarker('x'.repeat(800), 'run-a', 'partner')).toBe(false);
  });
  for (const roomId of STORY_ROOM_IDS) {
    it(`${roomId}: guide sees only this role's unlocked evidence`, () => {
      const room = getStoryRoom(roomId);
      const base = createStoryState(roomId, [{ id: 'private-host-id', name: 'PRIVATE-NAME-CANARY' }, { id: 'private-guest-id', name: 'Guest' }], 12345, 'operation-canary', 1000);
      room.stages.forEach((stage, stageIndex) => {
        const state = { ...base, stageIndex, draft: initialStoryDraft(stage), activity: isActivityKind(stage.interaction?.kind) ? createActivityState(stage.interaction.kind) : undefined };
        const view = projectStoryView(state, 'private-host-id');
        const context = storyGuideContext(state, view, [], room.stages.length);
        expect(guideContextSchema.safeParse(context).success).toBe(true);
        const encoded = JSON.stringify(context);
        expect(encoded).not.toContain('PRIVATE-NAME-CANARY');
        expect(encoded).not.toContain('operation-canary');
        expect(encoded).not.toContain('private-host-id');
        expect(encoded).not.toContain(stage.explanation);
        expect(encoded).not.toContain(stage.revelation);
        for (const clue of view.stage.clues.filter(clue => clue.medium === 'lens')) {
          expect(context.clues).not.toContain(clue.title);
          const unlocked = storyGuideContext(state, view, [clue.id], room.stages.length);
          expect(unlocked.clues).toContain(clue.title);
        }
        for (const clue of stage.clues.filter(clue => clue.seat % 2 === 1)) expect(context.clues).not.toContain(clue.title);
      });
    });
  }
});
