import {
  getAppActionParamSchemaDoc,
  listAppActionDefinitions,
} from "./app-action-registry.js";

/** Public catalog of supported app actions (GET .../actions). Phase 6 may persist per-project subsets. */
export function listAppActionsCatalog() {
  return {
    actions: listAppActionDefinitions().map((definition) => ({
      name: definition.name,
      description: definition.description,
      protocol: definition.protocol,
      default_chain_id: definition.default_chain_id,
      category: definition.category,
      execute_action: definition.execute_action,
      params: getAppActionParamSchemaDoc(definition.name),
    })),
  };
}
