import { createCipheriv, Cipher, createDecipheriv, Decipher, randomFill } from "crypto";


interface EncryptionCipherContext {
    options: {
        pbkdf2: { [optionKey: string]: string | number }
    };
}

export type EncryptionAlgorithm = (passBuf: Buffer, salt: Buffer) => Promise<Buffer>;


class EncryptionCipher {

    private readonly symmetricKey: Buffer;
    private readonly algorithm: string;

    constructor(symmetricKey: Buffer, algorithm: string = "aes-192-cbc") {
        this.symmetricKey = symmetricKey;
        this.algorithm = algorithm;
    }

    public static deriveKey(
        password: string, salt: string,
        algorithm: (pw: Buffer, salt: Buffer) => Promise<Buffer>): Promise<Buffer>
    {
        return algorithm(Buffer.from(password), Buffer.from(salt));
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
}


export {
    EncryptionCipher,
    EncryptionCipherContext,
};
