declare module 'dcmjs' {
  const dcmjs: {
    data: {
      DicomMessage: {
        readFile(buffer: ArrayBuffer): {
          meta: Record<string, unknown>;
          dict: Record<string, unknown>;
        };
      };
      DicomMetaDictionary: {
        naturalizeDataset(dataset: Record<string, unknown>): Record<string, any>;
      };
    };
  };

  export default dcmjs;
}
