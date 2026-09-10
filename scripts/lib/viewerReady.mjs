/**
 * What the three browser checks need running before them, and how to say so.
 *
 * They drive a real browser against a viewer already serving on localhost and
 * an archive already holding the studies. They do not start either one, and
 * that is deliberate: a check that owned the lifetime of a webpack dev server
 * and a container would have to decide, every time, whether the one it found
 * already running is the one it wanted — and get that wrong on the machine of
 * whoever had the viewer open in a tab.
 *
 * What was wrong is that nothing said so. With nothing listening, Playwright
 * spent ninety seconds on a navigation and then reported a timeout, which names
 * neither what is missing nor how to supply it. Two requests, taken before the
 * browser is launched, tell apart the three ways this fails: no viewer, a
 * viewer with no archive behind it, and an archive with nothing loaded into it.
 */
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';

// Named, not indexed. Each message lists the steps still missing, and adding
// `yarn start` to the front of this list silently changed which steps every
// `START.slice(0, 3)` below printed.
const ARCHIVE = 'docker compose up -d          # the archive';
const FETCH = 'yarn data                     # fetch the studies, once';
const LOAD = 'yarn data:load                # load them into the archive';
const SERVE = 'yarn dev                      # the viewer, on http://localhost:3000';
const DEMO = 'yarn start                    # all of the below, skipping what is done';

const START = [DEMO, '', ARCHIVE, FETCH, LOAD, SERVE];

function stop(what, todo) {
  console.error(`\n${what}\n`);
  for (const line of todo) {
    console.error(`  ${line}`);
  }
  console.error('');
  // 2, not 1. Nothing was driven, so this is neither a pass nor a failure,
  // and a caller that treats it as one reads a stopped archive as a broken
  // viewer.
  process.exit(2);
}

/**
 * One request, one socket, closed before this returns.
 *
 * `fetch` would be shorter, but it keeps its connections alive for reuse, and
 * exiting the process with one still open aborts inside libuv on Windows
 * instead of returning the exit code — turning a check that should say what to
 * start into a crash report. `agent: false` leaves nothing behind to close.
 *
 * @returns {Promise<{status: number, body: string}|undefined>} undefined if
 *   nothing answered.
 */
export function get(url) {
  const target = new URL(url);
  const transport = target.protocol === 'https:' ? https : http;

  return new Promise(resolve => {
    const request = transport.get(target, { agent: false }, response => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', chunk => (body += chunk));
      response.on('end', () => resolve({ status: response.statusCode, body }));
    });

    request.setTimeout(5000, () => request.destroy());
    request.on('error', () => resolve(undefined));
  });
}

/**
 * Is anything holding that port, whether or not it is answering yet?
 *
 * @param {string} url - Where the viewer is expected.
 * @returns {Promise<boolean>}
 */
function portIsOpen(url) {
  const target = new URL(url);
  const port = Number(target.port || (target.protocol === 'https:' ? 443 : 80));

  return new Promise(resolve => {
    const socket = net.connect({ host: target.hostname, port });
    const answer = open => {
      socket.destroy();
      resolve(open);
    };
    socket.setTimeout(3000, () => answer(false));
    socket.on('connect', () => answer(true));
    socket.on('error', () => answer(false));
  });
}

/**
 * Returns once the viewer answers and the archive behind it holds studies, and
 * otherwise leaves without launching a browser.
 *
 * @param {string} viewerUrl - Where the viewer is expected, no trailing slash.
 */
export async function requireViewer(viewerUrl) {
  if (!(await get(`${viewerUrl}/`))) {
    // A request that times out and a port with nothing behind it come back the same
    // way from `get`, and they are not the same thing at all. The development server
    // holds every request while it recompiles, and it recompiles once on its own
    // shortly after starting -- so a check run right after `yarn start` met a silent
    // socket and announced that nothing was answering. It was answering. It was busy.
    //
    // So: ask the port itself. Closed means what the message below says. Open means
    // wait, because a build ends.
    if (!(await portIsOpen(viewerUrl))) {
      stop(`Nothing is answering on ${viewerUrl}. This check does not start the viewer.`, START);
    }

    process.stderr.write(`  ${viewerUrl} is busy building. Waiting.
`);
    const deadline = Date.now() + 5 * 60 * 1000;
    let page;
    while (!(page = await get(`${viewerUrl}/`))) {
      if (Date.now() > deadline) {
        stop(
          `${viewerUrl} has been building for five minutes without answering. ` +
            'Look at the window running it.',
          [SERVE]
        );
      }
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  // The development server answers an address it does not know with the
  // application's own page, at status 200. So the archive is reachable only if
  // what comes back parses as JSON: HTML here is what a stopped container looks
  // like, and it is the failure that used to arrive as a navigation timeout.
  const studies = await get(`${viewerUrl}/pacs/dicom-web/studies?limit=1`);
  let payload;
  try {
    payload = studies?.status === 200 ? JSON.parse(studies.body) : undefined;
  } catch {
    payload = undefined;
  }

  if (!Array.isArray(payload)) {
    stop(
      `${viewerUrl} is serving the viewer, but no archive is answering behind it.`,
      [DEMO, '', ARCHIVE, FETCH, LOAD]
    );
  }

  if (payload.length === 0) {
    stop('The archive is running and empty: the studies have not been loaded into it.', [
      DEMO,
      '',
      FETCH,
      LOAD,
    ]);
  }
}
