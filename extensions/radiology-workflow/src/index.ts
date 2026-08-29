import { RadiologyWorkflow } from './RadiologyWorkflow';
import './styles.css';
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
        name: 'radiologyWorkflowLayout',
        component: RadiologyWorkflow,
      },
    ];
  },
  getViewportModule() {
    return [{ name: 'montage', component: MontageViewport }];
  },
  getToolbarModule() {
    return [{ name: 'montage', label: 'Montage', commandName: 'setMontageLayout' }];
  },
  getHangingProtocolModule() {
    return [{ name: 'capturedProtocols' }];
  },
  getUtilityModule() {
    return [
      {
        name: 'workflowUtilities',
        exports: { SmartImageLoadManager, SafeStackScroller, handleReferenceCursorMove },
      },
    ];
  },
};

export default extension;
