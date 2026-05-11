import { buildMatotamMintData } from "./mint";
import { fetchInboxMessages } from "./inbox";
import {
  BLOCKFROST_API,
  BLOCKFROST_KEY,
} from "./constants";

export interface AgentMessageParams {
  senderAddr: string;
  recipientAddress: string;
  message: string;
  policyId: string;
}

export interface AgentInboxQuery {
  walletAddress: string | null;
  stakeAddress: string | null;
  policyId?: string;
  limit?: number;
}

export async function sendMatotamMessage(
  params: AgentMessageParams
) {
  return buildMatotamMintData({
    senderAddr: params.senderAddr,
    recipientAddress: params.recipientAddress,
    message: params.message,
    policyId: params.policyId,
  });
}

export async function fetchMatotamAgentInbox(
  query: AgentInboxQuery
) {
  const messages = await fetchInboxMessages({
    walletAddress: query.walletAddress,
    stakeAddress: query.stakeAddress,
    blockfrostApi: BLOCKFROST_API,
    blockfrostKey: BLOCKFROST_KEY,
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