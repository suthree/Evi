import { createHash } from "node:crypto";

export function canonicalDeliveryLineageFileIdentity(
  bytes: Uint8Array,
  executable: boolean
): { mode: "100644" | "100755"; digest: string } {
  const mode = executable ? "100755" : "100644";
  const contentDigest = createHash("sha256").update(bytes).digest("hex");
  return { mode, digest: sha256(`file\u0000${mode}\u0000${contentDigest}`) };
}

export function canonicalDeliveryLineageSymlinkDigest(target: Uint8Array): string {
  return createHash("sha256")
    .update(Buffer.from("symlink\u0000"))
    .update(target)
    .digest("hex");
}

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}
