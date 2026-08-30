import { MeasurementService } from '@ohif/core';
import * as cornerstone from '@cornerstonejs/core';
import Length from './Length';
import Bidirectional from './Bidirectional';
import EllipticalROI from './EllipticalROI';
import CircleROI from './CircleROI';
import ArrowAnnotate from './ArrowAnnotate';
import CobbAngle from './CobbAngle';
import Angle from './Angle';
import PlanarFreehandROI from './PlanarFreehandROI';
import RectangleROI from './RectangleROI';
import SplineROI from './SplineROI';
import LivewireContour from './LivewireContour';
import Probe from './Probe';
import UltrasoundDirectional from './UltrasoundDirectional';
import SegmentBidirectional from './SegmentBidirectional';

const loggedMeasurementUnits = new Set<string>();

function isPixelUnit(value: unknown) {
  return typeof value === 'string' && value.toLowerCase().includes('px');
}

function getStatsSummary(cachedStats) {
  if (!cachedStats || typeof cachedStats !== 'object') {
    return [];
  }

  return Object.entries(cachedStats).map(([targetId, stats]) => {
    const stat = stats || {};

    return {
      targetId,
      unit: stat.unit,
      areaUnit: stat.areaUnit,
      units: stat.units,
      length: stat.length,
      width: stat.width,
      area: stat.area,
      radius: stat.radius,
      perimeter: stat.perimeter,
    };
  });
}

function hasPixelUnits(statsSummary) {
  return statsSummary.some(stat => {
    if (isPixelUnit(stat.unit) || isPixelUnit(stat.areaUnit)) {
      return true;
    }

    return Array.isArray(stat.units) && stat.units.some(isPixelUnit);
  });
}

function getImageMetadataSummary(referencedImageId) {
  if (!referencedImageId) {
    return {};
  }

  const imagePlaneModule = cornerstone.metaData.get('imagePlaneModule', referencedImageId) || {};
  const instance = cornerstone.metaData.get('instance', referencedImageId) || {};
  const calibrationModule = cornerstone.metaData.get('calibrationModule', referencedImageId) || {};

  return {
    imagePlaneModule: {
      pixelSpacing: imagePlaneModule.pixelSpacing,
      rowPixelSpacing: imagePlaneModule.rowPixelSpacing,
      columnPixelSpacing: imagePlaneModule.columnPixelSpacing,
      usingDefaultValues: imagePlaneModule.usingDefaultValues,
    },
    calibrationModule: {
      type: calibrationModule.type,
      sequenceOfUltrasoundRegionsCount: calibrationModule.sequenceOfUltrasoundRegions?.length ?? 0,
    },
    instance: {
      StudyInstanceUID: instance.StudyInstanceUID,
      SeriesInstanceUID: instance.SeriesInstanceUID,
      SOPInstanceUID: instance.SOPInstanceUID,
      PixelSpacing: instance.PixelSpacing,
      ImagerPixelSpacing: instance.ImagerPixelSpacing,
      NominalScannedPixelSpacing: instance.NominalScannedPixelSpacing,
      PixelSpacingCalibrationType: instance.PixelSpacingCalibrationType,
      PixelSpacingCalibrationDescription: instance.PixelSpacingCalibrationDescription,
    },
  };
}

function getDisplaySetInstanceSummary(displaySetService, mappedMeasurement) {
  const sopInstanceUID = mappedMeasurement?.SOPInstanceUID;
  const seriesInstanceUID = mappedMeasurement?.referenceSeriesUID;

  if (!sopInstanceUID || !seriesInstanceUID) {
    return null;
  }

  const displaySet = displaySetService.getDisplaySetForSOPInstanceUID(
    sopInstanceUID,
    seriesInstanceUID
  );
  const instance =
    displaySet?.instances?.find(item => item.SOPInstanceUID === sopInstanceUID) ??
    displaySet?.instances?.[0];

  if (!instance) {
    return null;
  }

  return {
    StudyInstanceUID: instance.StudyInstanceUID,
    SeriesInstanceUID: instance.SeriesInstanceUID,
    SOPInstanceUID: instance.SOPInstanceUID,
    PixelSpacing: instance.PixelSpacing,
    ImagerPixelSpacing: instance.ImagerPixelSpacing,
    NominalScannedPixelSpacing: instance.NominalScannedPixelSpacing,
    PixelSpacingCalibrationType: instance.PixelSpacingCalibrationType,
    PixelSpacingCalibrationDescription: instance.PixelSpacingCalibrationDescription,
  };
}

function debugMeasurementUnits(csToolsAnnotation, mappedMeasurement, displaySetService) {
  const annotation = csToolsAnnotation?.annotation;
  const metadata = annotation?.metadata || {};
  const data = annotation?.data || {};
  const annotationUID = annotation?.annotationUID;

  const statsSummary = getStatsSummary(data.cachedStats);
  const debugWindow =
    typeof window !== 'undefined'
      ? (window as Window & { __OHIF_DEBUG_MEASUREMENT_UNITS__?: boolean })
      : undefined;
  const shouldAlwaysLog = debugWindow?.__OHIF_DEBUG_MEASUREMENT_UNITS__ === true;

  if (!statsSummary.length) {
    return;
  }

  const hasPx = hasPixelUnits(statsSummary);
  if (!shouldAlwaysLog && !hasPx) {
    return;
  }

  const statsSignature = statsSummary
    .map(stat => `${stat.targetId}:${stat.unit ?? ''}:${stat.areaUnit ?? ''}`)
    .join('|');
  const logKey = `${annotationUID || 'unknown'}:${statsSignature}`;

  if (loggedMeasurementUnits.has(logKey)) {
    return;
  }

  loggedMeasurementUnits.add(logKey);

  const referencedImageId = metadata.referencedImageId;
  const imageMetadataSummary = getImageMetadataSummary(referencedImageId);
  const displaySetInstanceSummary = getDisplaySetInstanceSummary(
    displaySetService,
    mappedMeasurement
  );

  console.warn('[OHIF][MeasurementUnitsDebug]', {
    toolName: metadata.toolName,
    annotationUID,
    hasPixelUnits: hasPx,
    referencedImageId,
    referencedSeriesInstanceUID: metadata.referencedSeriesInstanceUID,
    frameOfReferenceUID: metadata.FrameOfReferenceUID,
    mappedMeasurement: {
      SOPInstanceUID: mappedMeasurement?.SOPInstanceUID,
      referenceSeriesUID: mappedMeasurement?.referenceSeriesUID,
      referenceStudyUID: mappedMeasurement?.referenceStudyUID,
      frameNumber: mappedMeasurement?.frameNumber,
      displayText: mappedMeasurement?.displayText,
    },
    cachedStats: statsSummary,
    imageMetadataSummary,
    displaySetInstanceSummary,
  });
}

const measurementServiceMappingsFactory = (
  measurementService: MeasurementService,
  displaySetService,
  cornerstoneViewportService,
  customizationService
) => {
  /**
   * Maps measurement service format object to cornerstone annotation object.
   *
   * @param measurement The measurement instance
   * @param definition The source definition
   * @return Cornerstone annotation data
   */

  const _getValueTypeFromToolType = toolType => {
    const { POLYLINE, ELLIPSE, CIRCLE, RECTANGLE, BIDIRECTIONAL, POINT, ANGLE } =
      MeasurementService.VALUE_TYPES;

    // TODO -> I get why this was attempted, but its not nearly flexible enough.
    // A single measurement may have an ellipse + a bidirectional measurement, for instances.
    // You can't define a bidirectional tool as a single type..
    const TOOL_TYPE_TO_VALUE_TYPE = {
      Length: POLYLINE,
      EllipticalROI: ELLIPSE,
      CircleROI: CIRCLE,
      RectangleROI: RECTANGLE,
      PlanarFreehandROI: POLYLINE,
      Bidirectional: BIDIRECTIONAL,
      ArrowAnnotate: POINT,
      CobbAngle: ANGLE,
      Angle: ANGLE,
      SplineROI: POLYLINE,
      LivewireContour: POLYLINE,
      Probe: POINT,
      UltrasoundDirectional: POLYLINE,
      SegmentBidirectional: BIDIRECTIONAL,
    };

    return TOOL_TYPE_TO_VALUE_TYPE[toolType];
  };

  const factories = {
    Length: {
      toAnnotation: Length.toAnnotation,
      toMeasurement: csToolsAnnotation => {
        const mappedMeasurement = Length.toMeasurement(
          csToolsAnnotation,
          displaySetService,
          cornerstoneViewportService,
          _getValueTypeFromToolType,
          customizationService
        );

        debugMeasurementUnits(csToolsAnnotation, mappedMeasurement, displaySetService);

        return mappedMeasurement;
      },
      matchingCriteria: [
        {
          valueType: MeasurementService.VALUE_TYPES.POLYLINE,
          points: 2,
        },
      ],
    },
    Bidirectional: {
      toAnnotation: Bidirectional.toAnnotation,
      toMeasurement: csToolsAnnotation => {
        const mappedMeasurement = Bidirectional.toMeasurement(
          csToolsAnnotation,
          displaySetService,
          cornerstoneViewportService,
          _getValueTypeFromToolType,
          customizationService
        );

        debugMeasurementUnits(csToolsAnnotation, mappedMeasurement, displaySetService);

        return mappedMeasurement;
      },
      matchingCriteria: [
        // TODO -> We should eventually do something like shortAxis + longAxis,
        // But its still a little unclear how these automatic interpretations will work.
        {
          valueType: MeasurementService.VALUE_TYPES.POLYLINE,
          points: 2,
        },
        {
          valueType: MeasurementService.VALUE_TYPES.POLYLINE,
          points: 2,
        },
      ],
    },
    SegmentBidirectional: {
      toAnnotation: SegmentBidirectional.toAnnotation,
      toMeasurement: csToolsAnnotation => {
        const mappedMeasurement = SegmentBidirectional.toMeasurement(
          csToolsAnnotation,
          displaySetService,
          cornerstoneViewportService,
          _getValueTypeFromToolType,
          customizationService
        );

        debugMeasurementUnits(csToolsAnnotation, mappedMeasurement, displaySetService);

        return mappedMeasurement;
      },
      matchingCriteria: [
        {
          valueType: MeasurementService.VALUE_TYPES.POLYLINE,
          points: 2,
        },
        {
          valueType: MeasurementService.VALUE_TYPES.POLYLINE,
          points: 2,
        },
      ],
    },
    EllipticalROI: {
      toAnnotation: EllipticalROI.toAnnotation,
      toMeasurement: csToolsAnnotation => {
        const mappedMeasurement = EllipticalROI.toMeasurement(
          csToolsAnnotation,
          displaySetService,
          cornerstoneViewportService,
          _getValueTypeFromToolType,
          customizationService
        );

        debugMeasurementUnits(csToolsAnnotation, mappedMeasurement, displaySetService);

        return mappedMeasurement;
      },
      matchingCriteria: [
        {
          valueType: MeasurementService.VALUE_TYPES.ELLIPSE,
        },
      ],
    },
    CircleROI: {
      toAnnotation: CircleROI.toAnnotation,
      toMeasurement: csToolsAnnotation => {
        const mappedMeasurement = CircleROI.toMeasurement(
          csToolsAnnotation,
          displaySetService,
          cornerstoneViewportService,
          _getValueTypeFromToolType,
          customizationService
        );

        debugMeasurementUnits(csToolsAnnotation, mappedMeasurement, displaySetService);

        return mappedMeasurement;
      },
      matchingCriteria: [
        {
          valueType: MeasurementService.VALUE_TYPES.CIRCLE,
        },
      ],
    },
    RectangleROI: {
      toAnnotation: RectangleROI.toAnnotation,
      toMeasurement: csToolsAnnotation => {
        const mappedMeasurement = RectangleROI.toMeasurement(
          csToolsAnnotation,
          displaySetService,
          cornerstoneViewportService,
          _getValueTypeFromToolType,
          customizationService
        );

        debugMeasurementUnits(csToolsAnnotation, mappedMeasurement, displaySetService);

        return mappedMeasurement;
      },
      matchingCriteria: [
        {
          valueType: MeasurementService.VALUE_TYPES.POLYLINE,
        },
      ],
    },
    PlanarFreehandROI: {
      toAnnotation: PlanarFreehandROI.toAnnotation,
      toMeasurement: csToolsAnnotation => {
        const mappedMeasurement = PlanarFreehandROI.toMeasurement(
          csToolsAnnotation,
          displaySetService,
          cornerstoneViewportService,
          _getValueTypeFromToolType,
          customizationService
        );

        debugMeasurementUnits(csToolsAnnotation, mappedMeasurement, displaySetService);

        return mappedMeasurement;
      },
      matchingCriteria: [
        {
          valueType: MeasurementService.VALUE_TYPES.POLYLINE,
        },
      ],
    },
    SplineROI: {
      toAnnotation: SplineROI.toAnnotation,
      toMeasurement: csToolsAnnotation => {
        const mappedMeasurement = SplineROI.toMeasurement(
          csToolsAnnotation,
          displaySetService,
          cornerstoneViewportService,
          _getValueTypeFromToolType,
          customizationService
        );

        debugMeasurementUnits(csToolsAnnotation, mappedMeasurement, displaySetService);

        return mappedMeasurement;
      },
      matchingCriteria: [
        {
          valueType: MeasurementService.VALUE_TYPES.POLYLINE,
        },
      ],
    },
    LivewireContour: {
      toAnnotation: LivewireContour.toAnnotation,
      toMeasurement: csToolsAnnotation => {
        const mappedMeasurement = LivewireContour.toMeasurement(
          csToolsAnnotation,
          displaySetService,
          cornerstoneViewportService,
          _getValueTypeFromToolType,
          customizationService
        );

        debugMeasurementUnits(csToolsAnnotation, mappedMeasurement, displaySetService);

        return mappedMeasurement;
      },
      matchingCriteria: [
        {
          valueType: MeasurementService.VALUE_TYPES.POLYLINE,
        },
      ],
    },
    ArrowAnnotate: {
      toAnnotation: ArrowAnnotate.toAnnotation,
      toMeasurement: csToolsAnnotation => {
        const mappedMeasurement = ArrowAnnotate.toMeasurement(
          csToolsAnnotation,
          displaySetService,
          cornerstoneViewportService,
          _getValueTypeFromToolType,
          customizationService
        );

        debugMeasurementUnits(csToolsAnnotation, mappedMeasurement, displaySetService);

        return mappedMeasurement;
      },
      matchingCriteria: [
        {
          valueType: MeasurementService.VALUE_TYPES.POINT,
          points: 1,
        },
      ],
    },
    Probe: {
      toAnnotation: Probe.toAnnotation,
      toMeasurement: csToolsAnnotation => {
        const mappedMeasurement = Probe.toMeasurement(
          csToolsAnnotation,
          displaySetService,
          cornerstoneViewportService,
          _getValueTypeFromToolType,
          customizationService
        );

        debugMeasurementUnits(csToolsAnnotation, mappedMeasurement, displaySetService);

        return mappedMeasurement;
      },
      matchingCriteria: [
        {
          valueType: MeasurementService.VALUE_TYPES.POINT,
          points: 1,
        },
      ],
    },
    CobbAngle: {
      toAnnotation: CobbAngle.toAnnotation,
      toMeasurement: csToolsAnnotation => {
        const mappedMeasurement = CobbAngle.toMeasurement(
          csToolsAnnotation,
          displaySetService,
          cornerstoneViewportService,
          _getValueTypeFromToolType,
          customizationService
        );

        debugMeasurementUnits(csToolsAnnotation, mappedMeasurement, displaySetService);

        return mappedMeasurement;
      },
      matchingCriteria: [
        {
          valueType: MeasurementService.VALUE_TYPES.ANGLE,
        },
      ],
    },
    Angle: {
      toAnnotation: Angle.toAnnotation,
      toMeasurement: csToolsAnnotation => {
        const mappedMeasurement = Angle.toMeasurement(
          csToolsAnnotation,
          displaySetService,
          cornerstoneViewportService,
          _getValueTypeFromToolType,
          customizationService
        );

        debugMeasurementUnits(csToolsAnnotation, mappedMeasurement, displaySetService);

        return mappedMeasurement;
      },
      matchingCriteria: [
        {
          valueType: MeasurementService.VALUE_TYPES.ANGLE,
        },
      ],
    },
    UltrasoundDirectional: {
      toAnnotation: UltrasoundDirectional.toAnnotation,
      toMeasurement: csToolsAnnotation => {
        const mappedMeasurement = UltrasoundDirectional.toMeasurement(
          csToolsAnnotation,
          displaySetService,
          cornerstoneViewportService,
          _getValueTypeFromToolType,
          customizationService
        );

        debugMeasurementUnits(csToolsAnnotation, mappedMeasurement, displaySetService);

        return mappedMeasurement;
      },
      matchingCriteria: [
        {
          valueType: MeasurementService.VALUE_TYPES.POLYLINE,
          points: 2,
        },
      ],
    },
  };

  return factories;
};

export default measurementServiceMappingsFactory;
