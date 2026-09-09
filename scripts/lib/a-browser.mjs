/**
 * A browser to drive, wherever this is running.
 *
 * `playwright-core` deliberately ships no browsers — that is what the `-core`
 * means, and it is why it costs two megabytes instead of four hundred. So it
 * has to be pointed at one that is already there, and which one that is depends
 * on where you are:
 *
 *   a Windows machine   Edge, which the operating system already has
 *   a GitHub runner     Chrome and Chromium, which the image already has
 *   somebody else's     whatever they have; `--channel` says so
 *
 * The three checks here used to look only in Playwright's own download cache
 * and, finding nothing, fail. That is why this README asked for
 * `npx playwright install chromium`: a hundred and fifty megabytes to get a
 * browser onto a machine that already had two. Measured with these same
 * switches, Edge reports
 *
 *   WebGL 2.0 (OpenGL ES 3.0 Chromium)
 *   ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device), SwiftShader driver)
 *
 * which is exactly what the downloaded Chromium reports, so the download bought
 * nothing. The cache is still tried, last, for anyone who already has one.
 *
 * It says which browser it got. A check whose output does not name what it drove
 * is a check whose green nobody else can reproduce.
 */
import fs from 'node:fs';
import path from 'node:path';

/**
 * Software WebGL.
 *
 * A headless browser has no GPU, and without these the viewer takes its
 * processor fallback: a real path, but not the one nearly anybody sees. The
 * checks are meant to exercise the path a machine with a graphics card takes.
 */
export const WEBGL = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];

/** In the order they are likely to exist, this machine's first. */
const CHANNELS = ['msedge', 'chrome'];

/** A Chromium that `npx playwright install` left behind, if there is one. */
function downloaded() {
  if (process.env.CHROMIUM_PATH) {
    return process.env.CHROMIUM_PATH;
  }
  const cache =
    process.platform === 'win32'
      ? path.join(process.env.LOCALAPPDATA ?? '', 'ms-playwright')
      : path.join(process.env.HOME ?? '', '.cache', 'ms-playwright');

  if (!fs.existsSync(cache)) {
    return undefined;
  }
  for (const entry of fs.readdirSync(cache)) {
    if (!entry.startsWith('chromium-')) {
      continue;
    }
    for (const candidate of [
      path.join(cache, entry, 'chrome-win64', 'chrome.exe'),
      path.join(cache, entry, 'chrome-linux', 'chrome'),
      path.join(cache, entry, 'chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium'),
    ]) {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
  }
  return undefined;
}

/** `--channel <name>` on the command line, for a browser this does not guess. */
function asked(argv = process.argv) {
  const at = argv.indexOf('--channel');
  return at !== -1 && argv[at + 1] ? argv[at + 1] : null;
}

/**
 * @returns {Promise<{browser: import('playwright-core').Browser, driving: string}>}
 *   the browser, and what it turned out to be. Print the second.
 */
export async function aBrowser({ args = WEBGL } = {}) {
  let chromium;
  try {
    ({ chromium } = await import('playwright-core'));
  } catch {
    console.error('This check drives a real browser, and playwright-core is not here.\n');
    console.error('  yarn install');
    console.error('\nIt arrives with @playwright/test, which this repository already depends on.');
    // 2, not 1. A check that could not run is neither a pass nor a failure.
    process.exit(2);
  }

  const only = asked();
  const refused = [];

  for (const channel of only ? [only] : CHANNELS) {
    try {
      return { browser: await chromium.launch({ channel, args }), driving: channel };
    } catch (error) {
      refused.push(`${channel}: ${String(error?.message ?? error).split('\n')[0].slice(0, 110)}`);
    }
  }

  const executablePath = downloaded();
  if (executablePath) {
    try {
      return {
        browser: await chromium.launch({ executablePath, args }),
        driving: `downloaded chromium (${executablePath})`,
      };
    } catch (error) {
      refused.push(`downloaded: ${String(error?.message ?? error).split('\n')[0].slice(0, 110)}`);
    }
  } else {
    refused.push('downloaded: nothing in the ms-playwright cache');
  }

  console.error('No browser could be launched, so this check did not run.\n');
  for (const one of refused) {
    console.error(`  ${one}`);
  }
  console.error('\nInstall Edge or Chrome, or pass --channel <name> for one you have.');
  process.exit(2);
}
