import { createCipheriv, Cipher, createDecipheriv, Decipher, randomFill } from "crypto";


enum VaultAlgorithm {
    AesCbc192 = "aes-192-cbc",
}

interface EncryptionCipherContext {
    options: {
        pbkdf2: { [optionKey: string]: string | number }
    };
}

export interface VaultPayload {
    payloadType: number;
    algorithm: VaultAlgorithm;
    seed: Buffer;
    vault: Buffer;
}

export type EncryptionAlgorithm = (passBuf: Buffer, salt: Buffer) => Promise<Buffer>;


function mapPayloadAlgorithm(algorithmNumber: number): VaultAlgorithm {
    return VaultAlgorithm[
        Object.values(VaultAlgorithm)[algorithmNumber]
    ];
}

class EncryptionCipher {

    private readonly symmetricKey: Buffer;
    private readonly algorithm: string;

    constructor(symmetricKey: Buffer, algorithm: VaultAlgorithm = VaultAlgorithm.AesCbc192) {
        this.symmetricKey = symmetricKey;
        this.algorithm = algorithm;
    }

    public static deriveKey(
        password: string, salt: string,
        algorithm: (pw: Buffer, salt: Buffer) => Promise<Buffer>): Promise<Buffer>
    {
        return algorithm(Buffer.from(password), Buffer.from(salt));
    }

    public static unwrapPayload(wrappedPayload: Buffer): VaultPayload {
        let seedSize = wrappedPayload.readInt32LE(8),
            vaultSize = wrappedPayload.readInt32LE(12);
        let seedStart: Buffer = wrappedPayload.slice(16),
            vaultStart: Buffer = seedStart.slice(seedSize);

        return {
            payloadType: wrappedPayload.readInt32LE(0),
            algorithm: mapPayloadAlgorithm(wrappedPayload.readInt32LE(4)),
            seed: Buffer.from(seedStart.slice(0, seedSize)),
            vault: Buffer.from(vaultStart.slice(0, vaultSize)),
        };
    }

    public static wrapPayload(payload: VaultPayload): Buffer {
        let header = Buffer.alloc(16);
        header.writeInt32LE(payload.payloadType, 0);
        header.writeInt32LE(Object.values(VaultAlgorithm)
            .findIndex(VaultAlgorithm[ payload.algorithm ]), 4);
        header.writeInt32LE(payload.seed.length, 8);
        header.writeInt32LE(payload.vault.length, 12);

        return Buffer.concat([ header, payload.seed, payload.vault ]);
    }

    public createCipher(fill: Buffer): Cipher {
        return createCipheriv(this.algorithm, this.symmetricKey, fill);
    }

    public createDecipher(fill: Buffer): Decipher {
        return createDecipheriv(this.algorithm, this.symmetricKey, fill);
    }

    public static createFill(size: number): Promise<Buffer> {
        return new Promise<Buffer>((resolve, reject) => randomFill(
            Buffer.alloc(size),
            (err, fill) => err ? reject(err) : resolve(fill)
        ));
    }

    public async encrypt(plainText: Buffer): Promise<Buffer> {
        const fill = await EncryptionCipher.createFill(16);
        const cipher = this.createCipher(fill);

        return Buffer.concat([
            fill,
            cipher.update(plainText),
            cipher.final()
        ]);
    }

    public async decrypt(cipherText: Buffer): Promise<Buffer> {
        const fill = cipherText.slice(0, 16);
        const decipher = this.createDecipher(fill);

        cipherText = cipherText.slice(16);
        return Buffer.concat([ decipher.update(cipherText), decipher.final() ]);
    }

    public async _decrypt(payload: VaultPayload): Promise<Buffer> {
        let decipher = this.createDecipher(payload.seed);
        return Buffer.concat([
            decipher.update(payload.vault),
            decipher.final(),
        ]);
    }

    /**
     * @name splitKey
     * A temporary method, used to process in-channel private keys that are attached to the vault payload.
     * This is only necessary if the private key is included as part of the payload itself.
     * 
     * @param payload Decrypted (but unprocessed) vault payload to split.
     * @returns Tuple containing buffers (privateKey, decryptedVault)
     */
    public static splitKey(payload: Buffer): [ Buffer, Buffer ] {
        let keySize = payload.readInt32LE(0);
        let keyStart = payload.slice(4);
        let dataSize = keyStart.readInt32LE(keySize);
        let dataStart = keyStart.slice(4 + keySize);

        return [
            keyStart.slice(0, keySize),
            dataStart.slice(0, dataSize),
        ];
    }
}


export {
    EncryptionCipher,
    EncryptionCipherContext,
};
