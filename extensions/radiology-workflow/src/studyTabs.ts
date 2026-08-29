import type { Study } from './study';

export interface StudyTabsState {
  openStudies: Study[];
  activeStudyUID: string | null;
}

export const initialStudyTabsState: StudyTabsState = {
  openStudies: [],
  activeStudyUID: null,
};

export type StudyTabsAction =
  | { type: 'open'; study: Study }
  | { type: 'activate'; studyInstanceUID: string | null }
  | { type: 'close'; studyInstanceUID: string };

export function studyTabsReducer(state: StudyTabsState, action: StudyTabsAction): StudyTabsState {
  if (action.type === 'open') {
    const exists = state.openStudies.some(study => study.studyInstanceUID === action.study.studyInstanceUID);
    return {
      openStudies: exists ? state.openStudies : [...state.openStudies, action.study],
      activeStudyUID: action.study.studyInstanceUID,
    };
  }

  if (action.type === 'activate') return { ...state, activeStudyUID: action.studyInstanceUID };

  const index = state.openStudies.findIndex(study => study.studyInstanceUID === action.studyInstanceUID);
  if (index === -1) return state;
  const openStudies = state.openStudies.filter(study => study.studyInstanceUID !== action.studyInstanceUID);
  const wasActive = state.activeStudyUID === action.studyInstanceUID;
  const fallback = openStudies[Math.min(index, openStudies.length - 1)]?.studyInstanceUID ?? null;
  return { openStudies, activeStudyUID: wasActive ? fallback : state.activeStudyUID };
}
