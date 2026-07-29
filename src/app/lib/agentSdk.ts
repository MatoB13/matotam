import { fetchInboxMessages } from "./inbox";
import {
  sendMatotamMessageOnChain,
  type SendMatotamMessageParams,
  type SendMatotamMessageResult,
} from "./agentMint";
import {
  BLOCKFROST_API as DEFAULT_BLOCKFROST_API,
  BLOCKFROST_KEY as DEFAULT_BLOCKFROST_KEY,
} from "./constants";

export type AgentMessageParams = SendMatotamMessageParams;

export interface AgentInboxQuery {
  walletAddress: string | null;
  stakeAddress: string | null;
  policyId?: string;
  limit?: number;
  /** Override Blockfrost credentials — required when calling from outside
   * a matotam.io request (e.g. a standalone agent script). */
  blockfrostApi?: string;
  blockfrostKey?: string;
}

/**
 * Build, sign, and submit a Matotam message NFT end-to-end. Performs a real
 * on-chain transaction using the caller-supplied private key and Blockfrost
 * project — matotam never sees either.
 */
export async function sendMatotamMessage(
  params: AgentMessageParams
): Promise<SendMatotamMessageResult> {
  return sendMatotamMessageOnChain(params);
}

export async function fetchMatotamAgentInbox(
  query: AgentInboxQuery
) {
  const messages = await fetchInboxMessages({
    walletAddress: query.walletAddress,
    stakeAddress: query.stakeAddress,
    blockfrostApi: query.blockfrostApi ?? DEFAULT_BLOCKFROST_API,
    blockfrostKey: query.blockfrostKey ?? DEFAULT_BLOCKFROST_KEY,
    overridePolicyId: query.policyId,
  });

  return messages
    .slice(0, query.limit || 50)
    .map((msg: any) => ({
      asset: msg.unit,
      sender: msg.fromAddress,
      receiver: msg.toAddress,
      message: msg.fullText,
      timestamp: msg.createdAt,
      threadId: msg.threadId,
      encrypted: msg.isEncrypted,
    }));
}