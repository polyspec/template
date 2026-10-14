// The JSON documents of the example site that the showcase checks read, described once: the scenario.json of a
// scenario of examples/site/scenarios, the scenario list examples/site/data/scenarios.json and the JSON line that a
// language adapter of examples/showcase/adapters prints for a scenario.
import { jsonDocument } from './json-document.mts';

/** The scenario.json of a scenario: its title and description and the template that it renders. */
export interface ScenarioMetadata {
  title: string;
  description: string;
  target: string;
}

/** The scenario list of the site: one entry per scenario. */
export interface ScenarioList {
  scenarios: { id: string }[];
}

/** The JSON line that a language adapter prints for one scenario. */
export interface RuntimePayload {
  language: string;
  type: string;
  operations: string[];
  request: unknown;
  bytes: number;
  firstSha256: string;
  secondSha256: string;
  recoveredSha256: string;
  requestUnchanged: boolean;
  failureObserved: boolean;
}

export const scenarioMetadataDocument = jsonDocument<ScenarioMetadata>('scenario.json', {
  type: 'object',
  required: ['title', 'description', 'target'],
  properties: { title: { type: 'string' }, description: { type: 'string' }, target: { type: 'string' } },
});

export const scenarioListDocument = jsonDocument<ScenarioList>('scenario list', {
  type: 'object',
  required: ['scenarios'],
  properties: { scenarios: { type: 'array', items: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } } } },
});

export const runtimePayloadDocument = jsonDocument<RuntimePayload>('adapter result', {
  type: 'object',
  required: ['language', 'type', 'operations', 'request', 'bytes', 'firstSha256', 'secondSha256', 'recoveredSha256', 'requestUnchanged', 'failureObserved'],
  properties: {
    language: { type: 'string' },
    type: { type: 'string' },
    operations: { type: 'array', items: { type: 'string' } },
    request: {},
    bytes: { type: 'integer' },
    firstSha256: { type: 'string' },
    secondSha256: { type: 'string' },
    recoveredSha256: { type: 'string' },
    requestUnchanged: { type: 'boolean' },
    failureObserved: { type: 'boolean' },
  },
});
