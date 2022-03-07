import { createPublicKey, createVerify } from "crypto";
import { EncryptionCipher, VaultPayload } from "./EncryptionCipher";

enum VaultSignatureAlgorithm {
    SHA512 = 0,
}

interface IVaultDataset {
    protocolVersion: number;
    signatureAlgorithm: VaultSignatureAlgorithm;
    signature: Buffer;
    payload: Buffer;

    validate(publicKey: Buffer): boolean;
    unwrap(): VaultPayload;
}

class VaultDatasetV0 implements IVaultDataset {
    public readonly protocolVersion: number = 0;
    public readonly signatureAlgorithm: VaultSignatureAlgorithm;
    public readonly signature: Buffer;
    public readonly payload: Buffer;

    private constructor(
        signature: Buffer,
        payload: Buffer,
        algorithm: VaultSignatureAlgorithm = VaultSignatureAlgorithm.SHA512)
    {
        this.signature = signature;
        this.payload = payload;
        this.signatureAlgorithm = algorithm;
    }

    public static deserialize(content: Buffer): VaultDatasetV0 {
        const signatureAlgorithmId = content.readInt32LE(0);
        const signatureSize = content.readInt32LE(4);
        const payloadSize = content.readInt32LE(8);
        const signatureAlgorithm = mapSignatureAlgo(signatureAlgorithmId);

        const signatureStart = content.slice(12);
        const signature = signatureStart.slice(0, signatureSize);
        const payload = signatureStart.slice(signatureSize, signatureSize + payloadSize);

        return new VaultDatasetV0(Buffer.from(signature), Buffer.from(payload), signatureAlgorithm);
    }

    public validate(publicKey: Buffer): boolean {
        try {
            const key = createPublicKey({
                key: publicKey,
                type: "spki",
            });
            return createVerify(VaultSignatureAlgorithm[this.signatureAlgorithm])
                .update(this.payload)
                .verify(key, this.signature);
        }
        catch (err) {
            console.error(err);
            return false;
        }
    }

    public unwrap(): VaultPayload {
        return EncryptionCipher.unwrapPayload(this.payload);
    }
}

function deserialize(content: Buffer): IVaultDataset {
    const protocolVersion = content.readInt32LE(0);

    return (function(): IVaultDataset {
        // Currently only one protocol version, so no switch statement is needed.
        // Modify this if additional serialization protocol versions must be supported.
        if (protocolVersion !== 0)
            return null;
        return VaultDatasetV0.deserialize(content.slice(4));
    })();
}

function mapSignatureAlgo(algoNum: number): VaultSignatureAlgorithm {
    return VaultSignatureAlgorithm[VaultSignatureAlgorithm[algoNum]];
}

export {
    deserialize,
};
