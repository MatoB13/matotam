export type MatotamMessage = {
  unit: string;
  policyId: string;
  assetName: string;
  fingerprint?: string;

  fullText: string;
  textPreview: string;

  createdAt?: string;
  fromAddress?: string;
  toAddress?: string;

  imageDataUri?: string;

  threadId?: string;
  threadIndex?: string;
};
