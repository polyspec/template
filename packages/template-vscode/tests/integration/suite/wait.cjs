// The waits of the integration checks (T20.1-7). A wait polls its condition every 50 ms and has no time limit of its
// own: a language server on a loaded machine applied an on-type format after the 5 s that a wait had, and the check
// failed with `false`. Only the time limit of the check ends a wait; the error of that limit names what the check
// waited for, with the expected and the actual value, and the wait stops polling.

// The time limit of one check.
const CHECK_TIMEOUT_MS = 20000;

// The wait of the running check: what it waits for, and whether its check has ended.
let current = null;

/** Polls `condition` until it returns a truthy value and returns that value; `describe` names what it waits for. */
async function eventually(condition, describe = () => 'a condition of the check') {
  const wait = { describe, stopped: false };
  current = wait;
  try {
    let value = await condition();
    while (!value) {
      if (wait.stopped) throw new Error(`stopped waiting for ${describe()}`);
      await new Promise(resolve => setTimeout(resolve, 50));
      value = await condition();
    }
    return value;
  } finally {
    if (current === wait) current = null;
  }
}

/** Waits until the text of `document` is `expected`, as an edit that the extension applies asynchronously. */
function textBecomes(document, expected) {
  return eventually(() => document.getText() === expected, () => `the text ${JSON.stringify(expected)}; the document has ${JSON.stringify(document.getText())}`);
}

/** Runs one check and rejects when it does not end within its time limit, naming what it waited for. */
function bounded(name, check, timeoutMs = CHECK_TIMEOUT_MS) {
  let timer;
  const timeout = new Promise((resolve, reject) => {
    timer = setTimeout(() => {
      const wait = current;
      if (wait) wait.stopped = true;
      reject(new Error(`${name} exceeded its ${timeoutMs / 1000} s timeout${wait ? ` while it waited for ${wait.describe()}` : ''}`));
    }, timeoutMs);
  });
  return Promise.race([Promise.resolve().then(check), timeout]).finally(() => clearTimeout(timer));
}

module.exports = { CHECK_TIMEOUT_MS, bounded, eventually, textBecomes };
