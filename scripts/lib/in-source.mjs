/**
 * Refuses to run a check whose selectors no longer match the source.
 *
 * A browser check presses things by name, and a name is a copy: the source says
 * `Subgrid`, this repository's checks said `Sottogriglia`, and nothing connected
 * the two. Three of six controls, and the button that closes the guided tour in
 * all three checks, were being looked for under names that had been renamed
 * away. The checks did not go red — they reported the controls dead and the
 * tour absent, which reads as a broken application, and reads that way for as
 * long as nobody has an archive and a viewer up to run them against.
 *
 * So each selector carries the string it rests on, and that string is looked
 * for in the source before a browser is launched. A rename now goes red in the
 * same commit that makes it, on any machine, in a second, with nothing running.
 */
import { spawnSync } from 'node:child_process';

/**
 * @param {string} root - The repository, where git is run.
 * @param {Array<{name: string, handle: string}>} needed - What must still exist.
 */
export function requireInSource(root, needed) {
  const missing = needed.filter(one => {
    // Everywhere except `scripts/`, because the handle is written in the check
    // as well. Searching the whole tree, every handle found the file asking the
    // question, and a test that cannot fail gives the same answer as one that
    // looked.
    const found = spawnSync('git', ['grep', '-l', '--fixed-strings', one.handle, '--', ':!scripts'], {
      cwd: root,
      encoding: 'utf8',
    });
    return found.status !== 0 || !found.stdout.trim();
  });

  if (missing.length === 0) {
    return;
  }

  console.error('This check is looking for things no longer in the source:');
  console.error('');
  for (const one of missing) {
    console.error(`  ${one.name.padEnd(20)} ${one.handle}`);
  }
  console.error('');
  console.error('Something was renamed and this check was not. Nothing was driven.');
  // 2, not 1: nothing was pressed, so this is neither a pass nor a failure.
  process.exit(2);
}
