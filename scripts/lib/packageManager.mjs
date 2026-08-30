/**
 * Which package manager the cloned viewer wants, and how to run it here.
 *
 * OHIF has changed package manager between releases, and the clone declares
 * which one it expects in the `packageManager` field. Reading that rather than
 * hard-coding a name means moving the pinned version does not silently install
 * with the wrong tool, or fail with a message about a version mismatch that
 * says nothing about what to do.
 *
 * Corepack ships with Node and fetches the exact version the field names, so
 * nothing has to be installed globally to build this.
 */
import fs from 'node:fs';
import path from 'node:path';

export function packageManagerFor(ohifDir) {
  const { packageManager } = JSON.parse(
    fs.readFileSync(path.join(ohifDir, 'package.json'), 'utf8')
  );

  if (!packageManager) {
    throw new Error('the viewer does not say which package manager it expects');
  }

  const [name] = packageManager.split('@');

  return {
    name,
    version: packageManager,
    /** A shell command line, because these are scripts rather than executables. */
    command: argv => `corepack ${name} ${argv}`,
  };
}
