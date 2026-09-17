// src/app/lib/patchedBlockfrost.ts
//
// lucid-cardano's bundled WASM CostModel has a fixed capacity (166 PlutusV1
// operations) baked in at compile time. Cardano's actual PlutusV1 cost model
// has since grown past that (a network upgrade added an operation), and
// lucid-cardano (last published 0.10.11, effectively unmaintained) was never
// updated to match. The extra entry makes Lucid.new() throw "CostModel
// operation 166 out of bounds. Max is 166" during getProtocolParameters(),
// before a wallet ever gets a chance to show its connect prompt.
//
// Matotam only ever mints through a native (non-Plutus) script, so the cost
// model's actual values are never used to execute or price a real script —
// truncating the extra operations Lucid can't parse is safe for every
// transaction this app builds.
const MAX_COST_MODEL_OPS = 166;

function truncateCostModel(
  model: Record<string, number>
): Record<string, number> {
  const entries = Object.entries(model);
  if (entries.length <= MAX_COST_MODEL_OPS) return model;
  return Object.fromEntries(entries.slice(0, MAX_COST_MODEL_OPS));
}

/**
 * Same as `new Blockfrost(apiUrl, projectId)`, but with cost models
 * truncated to what the bundled WASM can actually parse.
 */
export async function createPatchedBlockfrostProvider(
  apiUrl: string,
  projectId: string
) {
  const { Blockfrost } = await import("lucid-cardano");

  class PatchedBlockfrost extends Blockfrost {
    async getProtocolParameters() {
      const params = await super.getProtocolParameters();
      return {
        ...params,
        costModels: {
          ...params.costModels,
          PlutusV1: truncateCostModel(params.costModels.PlutusV1),
          PlutusV2: truncateCostModel(params.costModels.PlutusV2),
        },
      };
    }
  }

  return new PatchedBlockfrost(apiUrl, projectId);
}
