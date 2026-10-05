// Runs the check of each language of a check script to its end (T19.8): a failure of one language prints the language
// with its cause and the next language runs; after the last language the script fails and names every language that
// failed, so one run reports every failure.

/**
 * Runs `checks`, an object of language names and functions, in order. Prints `✔ <label>: <language>` or
 * `✖ <label>: <language>: <cause>` for each and throws after the last one when a language failed.
 */
export function checkLanguages(label, checks) {
  const failed = [];
  for (const [language, check] of Object.entries(checks)) {
    try {
      check();
      process.stdout.write(`✔ ${label}: ${language}\n`);
    } catch (error) {
      failed.push(language);
      process.stderr.write(`✖ ${label}: ${language}: ${error.message}\n`);
    }
  }
  if (failed.length > 0) throw new Error(`${label}: ${failed.length} of ${Object.keys(checks).length} languages failed: ${failed.join(', ')}`);
}
