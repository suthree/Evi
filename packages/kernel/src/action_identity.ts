import { createHash } from "node:crypto";
import type { ActionEffectClass, JsonObject } from "./action_types.js";
import { stableJson } from "./canonical_json.js";

export interface ActionIdentityContract {
  name: string;
  version: string;
  effect_class: ActionEffectClass;
}

export function materializeActionDigest(
  contract: ActionIdentityContract,
  arguments_: JsonObject
): string {
  return createHash("sha256").update(stableJson({
    name: contract.name,
    version: contract.version,
    effect_class: contract.effect_class,
    arguments: arguments_
  })).digest("hex");
}
