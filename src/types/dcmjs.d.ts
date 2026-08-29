declare module 'dcmjs' {
  const dcmjs: {
    data: {
      DicomMessage: {
        readFile(buffer: ArrayBuffer): {
          meta: Record<string, unknown>;
          dict: Record<string, unknown>;
        };
      };
    };
  };

  export default dcmjs;
}

