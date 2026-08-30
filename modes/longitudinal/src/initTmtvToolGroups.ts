export const tmtvToolGroupIds = {
  CT: 'ctToolGroup',
  PT: 'ptToolGroup',
  Fusion: 'fusionToolGroup',
  MIP: 'mipToolGroup',
};

function initTmtvToolGroups(toolNames, Enums, toolGroupService, commandsManager) {
  const tools = {
    active: [
      {
        toolName: toolNames.WindowLevel,
        bindings: [{ mouseButton: Enums.MouseBindings.Primary }],
      },
      {
        toolName: toolNames.Pan,
        bindings: [{ mouseButton: Enums.MouseBindings.Auxiliary }],
      },
      {
        toolName: toolNames.Zoom,
        bindings: [{ mouseButton: Enums.MouseBindings.Secondary }],
      },
      {
        toolName: toolNames.StackScroll,
        bindings: [{ mouseButton: Enums.MouseBindings.Wheel }],
      },
    ],
    passive: [
      { toolName: toolNames.Length },
      {
        toolName: toolNames.ArrowAnnotate,
        configuration: {
          getTextCallback: (callback, eventDetails) => {
            commandsManager.runCommand('arrowTextCallback', { callback, eventDetails });
          },
          changeTextCallback: (data, eventDetails, callback) => {
            commandsManager.runCommand('arrowTextCallback', { callback, data, eventDetails });
          },
        },
      },
      { toolName: toolNames.Bidirectional },
      { toolName: toolNames.DragProbe },
      { toolName: toolNames.Probe },
      { toolName: toolNames.EllipticalROI },
      { toolName: toolNames.RectangleROI },
      { toolName: toolNames.StackScroll },
      { toolName: toolNames.Angle },
      { toolName: toolNames.CobbAngle },
      { toolName: toolNames.Magnify },
      { toolName: 'CircularBrush', parentTool: 'Brush', configuration: { activeStrategy: 'FILL_INSIDE_CIRCLE' } },
      { toolName: 'CircularEraser', parentTool: 'Brush', configuration: { activeStrategy: 'ERASE_INSIDE_CIRCLE' } },
      { toolName: 'SphereBrush', parentTool: 'Brush', configuration: { activeStrategy: 'FILL_INSIDE_SPHERE' } },
      { toolName: 'SphereEraser', parentTool: 'Brush', configuration: { activeStrategy: 'ERASE_INSIDE_SPHERE' } },
      { toolName: 'ThresholdCircularBrush', parentTool: 'Brush', configuration: { activeStrategy: 'THRESHOLD_INSIDE_CIRCLE' } },
      { toolName: 'ThresholdSphereBrush', parentTool: 'Brush', configuration: { activeStrategy: 'THRESHOLD_INSIDE_SPHERE' } },
      {
        toolName: 'ThresholdCircularBrushDynamic',
        parentTool: 'Brush',
        configuration: {
          activeStrategy: 'THRESHOLD_INSIDE_CIRCLE',
          threshold: { isDynamic: true, dynamicRadius: 3 },
        },
      },
    ],
    enabled: [],
    disabled: [
      {
        toolName: toolNames.Crosshairs,
        configuration: {
          disableOnPassive: true,
          autoPan: { enabled: false, panSize: 10 },
        },
      },
    ],
  };

  const existing = toolGroupService.getToolGroupIds?.() || [];

  if (!existing.includes(tmtvToolGroupIds.CT)) {
    toolGroupService.createToolGroupAndAddTools(tmtvToolGroupIds.CT, tools);
  }
  if (!existing.includes(tmtvToolGroupIds.PT)) {
    toolGroupService.createToolGroupAndAddTools(tmtvToolGroupIds.PT, {
      active: tools.active,
      passive: [...tools.passive, { toolName: 'RectangleROIStartEndThreshold' }],
      enabled: tools.enabled,
      disabled: tools.disabled,
    });
  }
  if (!existing.includes(tmtvToolGroupIds.Fusion)) {
    toolGroupService.createToolGroupAndAddTools(tmtvToolGroupIds.Fusion, tools);
  }

  if (!existing.includes(tmtvToolGroupIds.MIP)) {
    // MIP viewport of the PT/CT fusion hanging protocol. Rotation is the main
    // interaction here, so bind VolumeRotate to:
    //   - Primary drag  → discoverable drag-to-rotate, like a 3D viewport.
    //   - Wheel         → keeps the previous fast-rotation shortcut.
    // MipJumpToClick is left registered as passive so other code can still
    // reference it, but we do not bind it to the primary button to avoid
    // fighting with the rotate drag.
    const mipTools = {
      active: [
        {
          toolName: toolNames.VolumeRotate,
          bindings: [
            { mouseButton: Enums.MouseBindings.Primary },
            { mouseButton: Enums.MouseBindings.Wheel },
          ],
          configuration: { rotateIncrementDegrees: 5 },
        },
      ],
      passive: [
        {
          toolName: toolNames.MipJumpToClick,
          configuration: { toolGroupId: tmtvToolGroupIds.PT },
        },
      ],
      enabled: [
        {
          toolName: toolNames.OrientationMarker,
          configuration: { orientationWidget: { viewportCorner: 'BOTTOM_LEFT' } },
        },
      ],
    };
    toolGroupService.createToolGroupAndAddTools(tmtvToolGroupIds.MIP, mipTools);
  }
}

export default initTmtvToolGroups;
