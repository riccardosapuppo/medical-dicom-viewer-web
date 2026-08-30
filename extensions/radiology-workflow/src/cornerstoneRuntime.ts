import { cornerstoneToolNames } from './cornerstoneTools';

let runtimePromise: Promise<CornerstoneRuntime> | undefined;

export async function loadCornerstoneRuntime(): Promise<CornerstoneRuntime> {
  if (runtimePromise) return runtimePromise;

  runtimePromise = Promise.all([
    import('@cornerstonejs/core'),
    import('@cornerstonejs/dicom-image-loader'),
    import('@cornerstonejs/tools'),
  ]).then(([core, dicomLoader, tools]) => {
    core.init();
    dicomLoader.init({ maxWebWorkers: Math.max(1, Math.min(4, navigator.hardwareConcurrency || 1)) });
    tools.init();

    const standardTools = [
      tools.LengthTool,
      tools.MagnifyTool,
      tools.PanTool,
      tools.PlanarFreehandROITool,
      tools.StackScrollTool,
      tools.WindowLevelTool,
      tools.ZoomTool,
      tools.ProbeTool,
      tools.RectangleROITool,
    ];

    for (const ToolClass of standardTools) {
      try {
        tools.addTool(ToolClass);
      } catch (error) {
        if (!(error instanceof Error) || !error.message.toLowerCase().includes('already')) throw error;
      }
    }

    return {
      core,
      tools,
      toolNames: cornerstoneToolNames,
    };
  });

  return runtimePromise;
}

export type CornerstoneRuntime = {
  core: typeof import('@cornerstonejs/core');
  tools: typeof import('@cornerstonejs/tools');
  toolNames: typeof cornerstoneToolNames;
};
