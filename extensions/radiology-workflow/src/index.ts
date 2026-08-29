import { RadiologyWorkflow } from './RadiologyWorkflow';
import { MontageViewport } from './MontageViewport';
import { SafeStackScroller } from './SafeStackScroller';
import { handleReferenceCursorMove } from './referenceCursors';
import { SmartImageLoadManager } from './smartImageLoadManager';

export const id = '@portfolio/ohif-extension-radiology-workflow';

const extension = {
  id,
  version: '1.0.0',
  preRegistration() {
    return undefined;
  },
  getLayoutTemplateModule() {
    return [
      {
        id: 'radiologyWorkflowLayout',
        component: RadiologyWorkflow,
      },
    ];
  },
  getViewportModule() {
    return [{ id: 'montage', component: MontageViewport }];
  },
  getToolbarModule() {
    return [{ id: 'montage', label: 'Montage', commandName: 'setMontageLayout' }];
  },
  getHangingProtocolModule() {
    return [{ id: 'capturedProtocols', protocols: [] }];
  },
  getUtilityModule() {
    return [
      {
        id: 'workflowUtilities',
        exports: { SmartImageLoadManager, SafeStackScroller, handleReferenceCursorMove },
      },
    ];
  },
};

export default extension;
