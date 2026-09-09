/**
 * A line that says what is happening while the command underneath says nothing.
 *
 * `yarn install` on a Lerna monorepo sits without printing for minutes at a
 * time, and a terminal that prints nothing looks exactly like a terminal whose
 * command has died. Waiting is not the problem; not knowing whether you are
 * waiting is.
 *
 * The line is drawn only after a couple of seconds of silence and erased as
 * soon as a byte arrives, so it never lands in the middle of what yarn or
 * docker are drawing. Both have progress bars of their own, and both redraw
 * with a carriage return exactly as this does; the chunks themselves are passed
 * through untouched, so whatever a command draws, it draws.
 */

const TURNING = ['|', '/', '-', String.fromCharCode(92)];

/** "4m 12s". Nobody reads milliseconds. */
export function since(started, now = Date.now()) {
  const seconds = Math.round((now - started) / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }
  return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, '0')}s`;
}

/**
 * @param {string} label - What to call this while it is quiet.
 * @param {object} [options]
 * @param {NodeJS.WriteStream} [options.out] - Where the line goes.
 * @param {number} [options.quietMs] - Silence before the line appears.
 */
export function watching(label, { out = process.stdout, quietMs = 2500 } = {}) {
  // Read at the moment of use, not when this file was loaded: a terminal
  // somebody is watching wants one line redrawn over itself, and a log file
  // wants the opposite - thousands of redraws in a file are unreadable.
  const interactive = out.isTTY === true;

  const started = Date.now();
  let frame = 0;
  let spoke = Date.now();
  let shown = false;
  let stopped = false;
  let announced = 0;

  const erase = () => {
    if (shown) {
      out.write('\r' + ' '.repeat(74) + '\r');
      shown = false;
    }
  };

  const draw = () => {
    if (stopped || Date.now() - spoke < quietMs) {
      return;
    }
    if (interactive) {
      out.write(`\r  ${TURNING[frame++ % TURNING.length]}  ${label}, ${since(started)}   `);
      shown = true;
      return;
    }
    // A log file, so once a minute and on a line of its own.
    const minutes = Math.floor((Date.now() - started) / 60000);
    if (minutes > announced) {
      announced = minutes;
      out.write(`  still ${label}, ${since(started)}\n`);
    }
  };

  const timer = setInterval(draw, interactive ? 130 : 5000);
  // The turning cursor must not be the reason a finished process stays alive.
  timer.unref?.();

  return {
    /** Output from the command: the line gets out of the way first. */
    heard(chunk) {
      erase();
      out.write(chunk);
      spoke = Date.now();
    },
    /** Stops turning and leaves one line behind: here, quiet is the good state. */
    settle(text) {
      stopped = true;
      erase();
      out.write(`${text}\n`);
    },
    stop() {
      stopped = true;
      clearInterval(timer);
      erase();
      return since(started);
    },
  };
}
