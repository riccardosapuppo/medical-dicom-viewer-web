/**
 * @param {*} cornerstone
 * @param {*} imageId
 */
function getImageSrcFromImageId(cornerstone, imageId) {
  return new Promise((resolve, reject) => {
    (async () => {
      const { metaData, imageLoader, Enums } = cornerstone;
      const debug =
        typeof window !== 'undefined' &&
        window?.localStorage?.getItem('ohifThumbDebug') === '1';
      const log = (...args) => {
        if (debug) {
          // eslint-disable-next-line no-console
          console.log('[thumb]', ...args);
        }
      };

      const imagePixelModule = metaData?.get?.('imagePixelModule', imageId) || {};
      const generalImageModule = metaData?.get?.('generalImageModule', imageId) || {};
      const generalSeriesModule = metaData?.get?.('generalSeriesModule', imageId) || {};
      const sopCommonModule = metaData?.get?.('sopCommonModule', imageId) || {};
      const transferSyntaxModule =
        metaData?.get?.('transferSyntax', imageId) ||
        metaData?.get?.('transferSyntaxModule', imageId) ||
        {};

      const photometricInterpretation =
        imagePixelModule.photometricInterpretation?.toUpperCase?.() || '';
      const isColorImage =
        imagePixelModule.samplesPerPixel > 1 ||
        photometricInterpretation.includes('RGB') ||
        photometricInterpretation.includes('YBR') ||
        photometricInterpretation.includes('PALETTE');
      const hasPhotometric = Boolean(photometricInterpretation);

      log('meta', {
        imageId,
        photometricInterpretation,
        samplesPerPixel: imagePixelModule.samplesPerPixel,
        planarConfiguration: imagePixelModule.planarConfiguration,
        bitsAllocated: imagePixelModule.bitsAllocated,
        bitsStored: imagePixelModule.bitsStored,
        rows: imagePixelModule.rows,
        columns: imagePixelModule.columns,
        transferSyntaxUID:
          transferSyntaxModule.transferSyntaxUID ||
          transferSyntaxModule.transferSyntax ||
          transferSyntaxModule.transferSyntaxUid,
        modality: generalSeriesModule.modality,
        sopClassUID: sopCommonModule.sopClassUID,
        instanceNumber: generalImageModule.instanceNumber,
      });

      if (isColorImage && imageLoader?.loadImage) {
        const image = await imageLoader.loadImage(imageId, {
          requestType: Enums?.RequestType?.Thumbnail,
          priority: -5,
          useRGBA: false,
        });
        log('loaded', {
          color: image?.color,
          rgba: image?.rgba,
          rows: image?.rows,
          columns: image?.columns,
          windowCenter: image?.windowCenter,
          windowWidth: image?.windowWidth,
          minPixelValue: image?.minPixelValue,
          maxPixelValue: image?.maxPixelValue,
          pixelDataLength: image?.getPixelData?.()?.length,
        });

        if (debug) {
          try {
            const pixelData = image?.getPixelData?.();
            if (pixelData?.length) {
              log('pixelSample', Array.from(pixelData.slice(0, 12)));
            }
          } catch (e) {
            log('pixelSampleError', e?.message || e);
          }
        }

        if (image?.getCanvas) {
          const imageCanvas = image.getCanvas();
          if (debug) {
            try {
              const ctx = imageCanvas?.getContext?.('2d');
              const data = ctx?.getImageData?.(0, 0, 1, 1)?.data;
              log('canvasPixel', data ? Array.from(data) : null);
            } catch (e) {
              log('canvasPixelError', e?.message || e);
            }
          }
          resolve(imageCanvas.toDataURL());
          return;
        }
        log('noGetCanvas');
      }

      const canvas = document.createElement('canvas');
      const useCPURendering = isColorImage || !hasPhotometric;
      log('fallbackLoadImageToCanvas', { useCPURendering });
      await cornerstone.utilities.loadImageToCanvas({
        canvas,
        imageId,
        thumbnail: true,
        useCPURendering,
      });
      if (debug) {
        try {
          const ctx = canvas?.getContext?.('2d');
          const data = ctx?.getImageData?.(0, 0, 1, 1)?.data;
          log('fallbackCanvasPixel', data ? Array.from(data) : null);
        } catch (e) {
          log('fallbackCanvasPixelError', e?.message || e);
        }
      }
      resolve(canvas.toDataURL());
    })().catch(reject);
  });
}
export default getImageSrcFromImageId;
