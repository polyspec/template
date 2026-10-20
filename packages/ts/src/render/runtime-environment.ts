// Runtime environment shared by AST and generated programs.
import { builtins, type HostFunction } from '../functions/index.js';
import { isPlainObject } from '../value/bind.js';
import { DEFAULT_LIMITS, type Limits, type RuntimeServices } from './context.js';

// RT-5, RT-6: a `limits` option that is not a map, a key that RT-33 does not list or a value that is not an integer
// fails the creation of the program with the argument error of ERR-13.
function checkLimits(limits: unknown): void {
  if (limits === undefined || limits === null) return;
  if (typeof limits !== 'object' || !isPlainObject(limits)) throw new Error('limits is not an object');
  for (const [key, value] of Object.entries(limits)) {
    if (!Object.hasOwn(DEFAULT_LIMITS, key)) throw new Error(`limits.${key} is not a limit`);
    if (!Number.isInteger(value)) throw new Error(`limits.${key} is not an integer`);
  }
}

// RT-5, RT-6: a `functions` option that is not a map, or an entry that is not callable, fails the creation of the
// program with the argument error of ERR-13.
function checkFunctions(functions: unknown): void {
  if (functions === undefined || functions === null) return;
  if (typeof functions !== 'object' || !isPlainObject(functions)) throw new Error('functions is not an object');
  for (const [name, fn] of Object.entries(functions)) {
    if (typeof fn !== 'function') throw new Error(`functions.${name} is not a function`);
  }
}

/** Host functions and resource limits shared by AST and generated programs. */
export class RuntimeEnvironment implements RuntimeServices {
  private readonly runtimeLimits: Limits;
  private readonly hostFunctions = new Map<string, HostFunction>();
  private readonly classFunctions = new Map<string, HostFunction>();

  /** Creates an environment from resource limits and validated host functions. */
  constructor(limits: Partial<Limits> = {}, functions: Record<string, HostFunction> = {}) {
    checkLimits(limits);
    checkFunctions(functions);
    this.runtimeLimits = { ...DEFAULT_LIMITS, ...limits };
    for (const [name, fn] of Object.entries(functions ?? {})) this.register(name, fn);
  }

  /** Registers one host function after validating its name. */
  register(name: string, fn: HostFunction): void {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new Error(`${JSON.stringify(name)} is not an identifier`);
    if (builtins.has(name)) throw new Error(`${name} is a built-in function`);
    this.hostFunctions.set(name, fn);
  }

  /** Returns the active resource limits. */
  limits(): Limits {
    return this.runtimeLimits;
  }

  /** Returns one registered host function. */
  hostFunction(name: string): HostFunction | undefined {
    return this.hostFunctions.get(name);
  }

  /** Registers one logical class function used by `Class::method(...)`. */
  registerClass(className: string, method: string, fn: HostFunction): void {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(className) || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(method)) {
      throw new Error('class function names must be identifiers');
    }
    this.classFunctions.set(`${className}::${method}`, fn);
  }

  /** Returns one logical class function. */
  classFunction(className: string, method: string): HostFunction | undefined {
    return this.classFunctions.get(`${className}::${method}`);
  }
}
