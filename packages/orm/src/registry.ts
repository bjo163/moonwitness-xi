import type { BaseModel } from './base.model.js';

export class Registry {
  private static models: Map<string, typeof BaseModel> = new Map();

  /**
   * Register a model class into the registry.
   */
  static register<T extends typeof BaseModel>(modelClass: T): T {
    const name = modelClass.modelName;
    if (!name) {
      throw new Error(
        `Model class ${modelClass.name} must define a static modelName (e.g. 'base.user')`
      );
    }
    this.models.set(name, modelClass);
    return modelClass;
  }

  /**
   * Get a model class by its dot-notation modelName (e.g. 'base.user').
   */
  static get<T extends typeof BaseModel = typeof BaseModel>(name: string): T {
    const model = this.models.get(name);
    if (!model) {
      throw new Error(`Model '${name}' not found in registry. Has it been imported/registered?`);
    }
    return model as T;
  }

  /**
   * Check if a model name is registered.
   */
  static has(name: string): boolean {
    return this.models.has(name);
  }

  /**
   * List all registered model names.
   */
  static getNames(): string[] {
    return Array.from(this.models.keys());
  }

  /**
   * Get all registered models map.
   */
  static getAll(): Map<string, typeof BaseModel> {
    return this.models;
  }

  /**
   * Clear registry (useful for tests).
   */
  static clear(): void {
    this.models.clear();
  }
}

/**
 * Class decorator to auto-register a model into the Registry.
 *
 * @example
 * ```ts
 * @RegisterModel()
 * export class BaseUser extends BaseModel {
 *   static override modelName = 'base.user';
 *   static override tableName = 'base_user';
 * }
 * ```
 */
export function RegisterModel() {
  return function <T extends typeof BaseModel>(target: T): void {
    Registry.register(target);
  };
}
