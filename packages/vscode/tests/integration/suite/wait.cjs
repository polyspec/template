// The waits of the integration checks (T20.1-7, T28.146). A wait polls its condition every 50 ms and has no time limit: a
// language server on a loaded machine applied an on-type format after the 5 s that a wait had, and the check failed with
// `false`. A wait that does not see its condition at once logs what it waits for, with the expected and the actual
// value, so a check that waits on prints what it waits for.

/** Polls `condition` until it returns a truthy value and returns that value; `describe` names what it waits for. */
async function eventually(condition, describe = () => 'a condition of the check', log = console.log) {
  let value = await condition();
  if (!value) log(`[suite] waiting for ${describe()}`);
  while (!value) {
    await new Promise(resolve => setTimeout(resolve, 50));
    value = await condition();
  }
  return value;
}

/** Waits until the text of `document` is `expected`, as an edit that the extension applies asynchronously. */
function textBecomes(document, expected, log = console.log) {
  return eventually(() => document.getText() === expected, () => `the text ${JSON.stringify(expected)}; the document has ${JSON.stringify(document.getText())}`, log);
}

module.exports = { eventually, textBecomes };
