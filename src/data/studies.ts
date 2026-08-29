import catalog from '../../public/data/studies.json';
import type { Study } from '../domain/study';

export const syntheticStudies = catalog as Study[];

