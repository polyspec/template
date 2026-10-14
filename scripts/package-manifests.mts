// The package manifests and locks that the scripts read, described once: the package.json of an npm package of
// packages/, the composer.json of the PHP package and the composer.lock of the development root.
import { jsonDocument } from './json-document.mts';

/** The package.json of an npm package: its name and version and, when it has any, its dependencies. */
export interface NpmManifest {
  name: string;
  version: string;
  dependencies?: Record<string, string>;
}

/** The composer.json of a Composer package: its name and version. */
export interface ComposerManifest {
  name: string;
  version: string;
}

/** A package of a composer.lock: its name and version; the other entries are kept as the lock holds them. */
export interface ComposerLockPackage {
  name: string;
  version: string;
}

/** A composer.lock: its packages. */
export interface ComposerLock {
  packages: ComposerLockPackage[];
}

const nameAndVersion = { name: { type: 'string' }, version: { type: 'string' } };

export const npmManifestDocument = jsonDocument<NpmManifest>('npm package manifest', {
  type: 'object',
  required: ['name', 'version'],
  properties: { ...nameAndVersion, dependencies: { type: 'object', additionalProperties: { type: 'string' } } },
});

export const composerManifestDocument = jsonDocument<ComposerManifest>('Composer manifest', {
  type: 'object',
  required: ['name', 'version'],
  properties: nameAndVersion,
});

export const composerLockDocument = jsonDocument<ComposerLock>('Composer lock', {
  type: 'object',
  required: ['packages'],
  properties: { packages: { type: 'array', items: { type: 'object', required: ['name', 'version'], properties: nameAndVersion } } },
});
