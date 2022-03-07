import { createPublicKey, createVerify, createPrivateKey, createSign, KeyObject } from "crypto";
import { EncryptionCipher, VaultPayload } from "./EncryptionCipher";

enum VaultSignatureAlgorithm {
    SHA512 = 0,
}

interface IVaultDataset {
    protocolVersion: number;
    signatureAlgorithm: VaultSignatureAlgorithm;
    signature: Buffer;
    payload: Buffer;

    validate(vaultId: string): boolean;
    serialize(): Buffer;
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

    public static derivePublicKey(vaultId: string): KeyObject {
        vaultId = Buffer.from(vaultId, "base64url").toString("base64");
        let publicKey =
            `-----BEGIN PUBLIC KEY-----\n${vaultId}\n-----END PUBLIC KEY-----\n`;
        return createPublicKey({
            key: Buffer.from(publicKey, "utf-8"),
            type: "spki",
        });
    }

    public static sign(payload: Buffer, privateKey: Buffer): VaultDatasetV0 {
        let key = createPrivateKey({
            key: privateKey,
            format: "der",
            type: "sec1",
        });
        let sign = createSign("SHA512");
        sign.write(payload);
        sign.end();

        return new VaultDatasetV0(Buffer.from(sign.sign(key)), payload);
    }

    public validate(vaultId: string): boolean {
        try {
            const key = VaultDatasetV0.derivePublicKey(vaultId);
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

    public serialize(): Buffer {
        let header = Buffer.alloc(16);
        header.writeInt32LE(0, 0);
        header.writeInt32LE(this.signatureAlgorithm, 4);
        header.writeInt32LE(this.signature.length, 8);
        header.writeInt32LE(this.payload.length, 12);

        return Buffer.concat([ header, this.signature, this.payload ]);
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

function createDataset(payload: Buffer, privateKey: Buffer): IVaultDataset {
    return VaultDatasetV0.sign(payload, privateKey);
}

function mapSignatureAlgo(algoNum: number): VaultSignatureAlgorithm {
    return VaultSignatureAlgorithm[VaultSignatureAlgorithm[algoNum]];
}

export {
    deserialize,
    createDataset,
};
