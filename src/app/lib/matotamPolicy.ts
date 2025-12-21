*** /dev/null
--- a/src/app/lib/matotamPolicy.ts
@@
+export function buildMatotamPolicy(lucid: any, senderAddr: string, recipientAddr: string, devAddr: string) {
+  const senderCred = lucid.utils.paymentCredentialOf(senderAddr);
+  const recipientCred = lucid.utils.paymentCredentialOf(recipientAddr);
+  const devCred = lucid.utils.paymentCredentialOf(devAddr);
+
+  // Native script: ANY of (sender, recipient, dev) can authorize mint/burn
+  const policyJson = {
+    type: "any",
+    scripts: [
+      { type: "sig", keyHash: senderCred.hash },
+      { type: "sig", keyHash: recipientCred.hash },
+      { type: "sig", keyHash: devCred.hash },
+    ],
+  };
+
+  const policy = lucid.utils.nativeScriptFromJson(policyJson);
+  const policyId = lucid.utils.mintingPolicyToId(policy);
+  return { policy, policyId };
+}
