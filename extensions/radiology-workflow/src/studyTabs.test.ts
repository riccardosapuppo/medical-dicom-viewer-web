import { syntheticStudies } from './syntheticStudies';
import { initialStudyTabsState, studyTabsReducer } from './studyTabs';

describe('multi-study tabs', () => {
  it('deduplicates studies by Study Instance UID', () => {
    const opened = studyTabsReducer(initialStudyTabsState, { type: 'open', study: syntheticStudies[0] });
    const openedAgain = studyTabsReducer(opened, { type: 'open', study: syntheticStudies[0] });

    expect(openedAgain.openStudies).toHaveLength(1);
    expect(openedAgain.activeStudyUID).toBe(syntheticStudies[0].studyInstanceUID);
  });

  it('activates the nearest tab after closing the current study', () => {
    const first = studyTabsReducer(initialStudyTabsState, { type: 'open', study: syntheticStudies[0] });
    const second = studyTabsReducer(first, { type: 'open', study: syntheticStudies[1] });
    const closed = studyTabsReducer(second, { type: 'close', studyInstanceUID: syntheticStudies[1].studyInstanceUID });

    expect(closed.activeStudyUID).toBe(syntheticStudies[0].studyInstanceUID);
  });
});
