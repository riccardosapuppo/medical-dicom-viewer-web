export const id = '@portfolio/ohif-mode-radiology-workflow';

const extensionDependencies = {
  '@ohif/extension-default': '^3.11.0',
  '@ohif/extension-cornerstone': '^3.11.0',
  '@portfolio/ohif-extension-radiology-workflow': '^1.0.0',
};

export function modeFactory() {
  return {
    id,
    routeName: 'radiology-workflow',
    displayName: 'Radiology Workflow',
    extensionDependencies,
    isValidMode: ({ modalities }: { modalities: string }) => ({
      valid: modalities.split('\\').some(modality => ['CT', 'MR'].includes(modality)),
      description: 'This demonstration mode accepts synthetic CT and MR studies.',
    }),
  };
}

const mode = {
  id,
  displayName: 'Radiology Workflow',
  extensionDependencies,
  modeFactory,
};

export default mode;

