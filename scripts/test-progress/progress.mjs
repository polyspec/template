// Test progress: one line when a test starts, a line while it keeps running, and one line when it
// passes, fails, is skipped or runs out of time, each stamped with the run's elapsed time. Every
// test runner of the project prints through this module, so all suites read the same way.

const seconds = milliseconds => `${(milliseconds / 1000).toFixed(1)}s`;

/**
 * @param {object} options
 * @param {(text: string) => void} options.write receives complete lines
 * @param {number} [options.heartbeatMs] interval of the still-running lines
 * @param {number} [options.timeoutMs] a test running longer is reported to `onTimeout`
 * @param {(id: string) => void} [options.onTimeout] stops the test that ran out of time
 * @param {() => number} [options.now]
 */
export function createProgress({ write, heartbeatMs = 5000, timeoutMs, onTimeout, now = () => Date.now() }) {
  const started = now();
  const running = new Map();
  const counts = { passed: 0, failed: 0, skipped: 0, timedOut: 0 };
  const groupCounts = { passed: 0, failed: 0 };
  const line = text => write(`[${seconds(now() - started).padStart(8)}] ${text}\n`);
  const timer = setInterval(() => {
    for (const [id, test] of running) {
      const elapsed = now() - test.started;
      if (timeoutMs !== undefined && elapsed > timeoutMs && !test.expired) {
        test.expired = true;
        counts.timedOut++;
        line(`⏱ ${id} exceeded its ${seconds(timeoutMs)} timeout`);
        onTimeout?.(id);
      } else if (!test.expired) {
        line(`… ${id} still running (${seconds(elapsed)}${timeoutMs === undefined ? '' : ` of ${seconds(timeoutMs)}`})`);
      }
    }
  }, heartbeatMs);
  timer.unref?.();
  // A group (a test file or a package) prints its lines but is not counted as a test.
  const groups = new Map();
  const groupTime = (id, durationMs) => {
    const time = durationMs || now() - groups.get(id);
    groups.delete(id);
    return seconds(time);
  };
  const finish = (id, durationMs) => {
    const test = running.get(id);
    running.delete(id);
    return durationMs ?? (test ? now() - test.started : 0);
  };
  return {
    line,
    start(id, { group = false } = {}) {
      if (group) groups.set(id, now());
      else running.set(id, { started: now(), expired: false });
      line(`▶ ${id}`);
    },
    pass(id, durationMs) {
      if (groups.has(id)) { groupCounts.passed++; return line(`✔ ${id} (${groupTime(id, durationMs)})`); }
      counts.passed++;
      line(`✔ ${id} (${seconds(finish(id, durationMs))})`);
    },
    fail(id, durationMs, message) {
      if (groups.has(id)) { groupCounts.failed++; line(`✖ ${id} (${groupTime(id, durationMs)})`); }
      else {
        counts.failed++;
        line(`✖ ${id} (${seconds(finish(id, durationMs))})`);
      }
      for (const detail of String(message ?? '').split('\n').filter(Boolean)) write(`           ${detail}\n`);
    },
    skip(id) {
      if (groups.has(id)) { groups.delete(id); return line(`○ ${id} skipped`); }
      counts.skipped++;
      finish(id);
      line(`○ ${id} skipped`);
    },
    /**
     * End the run. Tests still running are failures; a failed group or a nonzero `exitCode` of
     * the tool fails the run even when no test failed, and the summary names the failed groups.
     * When no test failed, the summary of a nonzero `exitCode` names the last `errors`, the error
     * lines of the tool, so that it says why the tool exited (T18.7-1). The summary also names the `build` errors, the
     * compiler errors of a package that did not build (T19.3).
     */
    close(label, { exitCode = 0, errors = [], build = [] } = {}) {
      clearInterval(timer);
      for (const id of [...running.keys()]) this.fail(id, undefined, 'the test did not finish');
      const failed = counts.failed + counts.timedOut + groupCounts.failed + (exitCode === 0 ? 0 : 1);
      const tests = counts.passed + counts.failed + counts.timedOut + counts.skipped;
      // A group can fail while every test in it passed, for example on a failed hook of a file.
      const groupsFailed = groupCounts.failed === 1 ? ', 1 group failed' : `, ${groupCounts.failed} groups failed`;
      const summary = tests || !(groupCounts.passed + groupCounts.failed)
        ? `${counts.passed} passed, ${counts.failed} failed, ${counts.timedOut} timed out, ${counts.skipped} skipped${groupCounts.failed ? groupsFailed : ''}`
        : `${groupCounts.passed} passed, ${groupCounts.failed} failed`;
      const unexplained = counts.failed + counts.timedOut + groupCounts.failed === 0;
      const why = !unexplained ? '' : errors.length ? `: ${errors.slice(-3).join('; ')}` : ' and printed no error line';
      const exit = exitCode === 0 ? '' : `, the tool exited with ${exitCode}${why}`;
      const built = build.length ? `; build errors: ${build.slice(0, 10).join('; ')}${build.length > 10 ? `; and ${build.length - 10} more` : ''}` : '';
      line(`${failed ? '✖' : '✔'} ${label}: ${summary}${exit}${built} (${seconds(now() - started)})`);
      return { ...counts, ok: failed === 0 };
    },
    counts,
  };
}
