// Creates and removes the temporary directory of the package install check.
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

/** Creates a new temporary directory for one install project run. */
export function createWorkspace() {
  return mkdtempSync(join(tmpdir(), 'template-installs-'));
}

/**
 * Returns the Go environment that keeps the module cache inside the workspace. Go creates module
 * cache files read-only; `-modcacherw` creates them writable so that the workspace removal can
 * remove them.
 */
export function goModuleEnvironment(workspace) {
  return { GOMODCACHE: join(workspace, 'go-module-cache'), GOFLAGS: '-modcacherw' };
}

/** Removes the workspace of one install project run and fails with its path when the removal fails. */
export function removeWorkspace(workspace) {
  try {
    rmSync(workspace, { recursive: true });
  } catch (error) {
    throw new Error(`failed to remove the install project workspace ${workspace}: ${error.message}`, { cause: error });
  }
}
