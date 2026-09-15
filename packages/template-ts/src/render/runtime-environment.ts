// Runtime environment shared by AST and generated programs.
import { builtins, type HostFunction } from '../functions/index.js';
import { DEFAULT_LIMITS, type Limits, type RuntimeServices } from './context.js';

/** Host functions and resource limits shared by AST and generated programs. */
export class RuntimeEnvironment implements RuntimeServices {
  private readonly runtimeLimits: Limits;
  private readonly hostFunctions = new Map<string, HostFunction>();
  private readonly classFunctions = new Map<string, HostFunction>();

  /** Creates an environment from resource limits and validated host functions. */
  constructor(limits: Partial<Limits> = {}, functions: Record<string, HostFunction> = {}) {
    this.runtimeLimits = { ...DEFAULT_LIMITS, ...limits };
    for (const [name, fn] of Object.entries(functions)) this.register(name, fn);
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
