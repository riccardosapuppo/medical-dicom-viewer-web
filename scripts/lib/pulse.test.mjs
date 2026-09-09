import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { since, watching } from './pulse.mjs';

/** A stream that remembers what was written to it, and says what it is. */
function fakeTerminal(isTTY) {
  const written = [];
  return {
    isTTY,
    write(chunk) {
      written.push(String(chunk));
      return true;
    },
    written,
    get text() {
      return written.join('');
    },
  };
}

const after = ms => new Promise(resolve => setTimeout(resolve, ms));

describe('how long it has been', () => {
  it('counts seconds under a minute', () => {
    assert.equal(since(0, 42_000), '42s');
  });

  it('counts minutes and seconds over one', () => {
    assert.equal(since(0, 252_000), '4m 12s');
  });
});

describe('the line that says something is still happening', () => {
  it('appears once the command has been quiet', async () => {
    const out = fakeTerminal(true);
    const pulse = watching('installing', { out, quietMs: 10 });
    await after(300);
    pulse.stop();

    assert.match(out.text, /installing/);
    assert.match(out.text, /[0-9]+s/);
  });

  it('gets out of the way when the command speaks, and lets it through whole', async () => {
    const out = fakeTerminal(true);
    const pulse = watching('installing', { out, quietMs: 10 });
    await after(300);

    out.written.length = 0;
    pulse.heard('[1/5] Resolving packages...\n');
    pulse.stop();

    // The erase comes first, and the command's own bytes arrive unchanged.
    assert.match(out.written[0], /^\r +\r$/);
    assert.equal(out.written[1], '[1/5] Resolving packages...\n');
  });

  it('stays out of the way while the command is talking', async () => {
    const out = fakeTerminal(true);
    const pulse = watching('installing', { out, quietMs: 5000 });
    await after(300);
    pulse.stop();

    assert.equal(out.text, '', 'nothing should be drawn before the silence is long enough');
  });

  it('settles into one line, and stops turning', async () => {
    const out = fakeTerminal(true);
    const pulse = watching('building the viewer', { out, quietMs: 10 });
    await after(300);

    out.written.length = 0;
    pulse.settle('  Serving on http://localhost:3000');
    await after(300);
    pulse.stop();

    const drawn = out.written.filter(one => one.includes('building the viewer'));
    assert.equal(drawn.length, 0, 'it should not draw after settling');
    assert.match(out.text, /Serving on http:\/\/localhost:3000/);
  });

  it('does not redraw over itself when it is writing to a file', async () => {
    const out = fakeTerminal(false);
    const pulse = watching('installing', { out, quietMs: 10 });
    await after(300);
    pulse.stop();

    // A log gets a line a minute, so within a third of a second it gets none,
    // and above all it never gets a carriage return.
    assert.ok(!out.text.includes('\r'), 'a log file must not be redrawn over');
  });
});
