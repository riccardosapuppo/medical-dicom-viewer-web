import catalog from './data/studies.json';
import type { Study } from './study';

export const syntheticStudies = catalog as unknown as Study[];
