import { RadiologyWorkflow } from './RadiologyWorkflow';

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
};

export default extension;
