import {
    Cipher,
    createCipheriv,
    createDecipheriv, Decipher, pbkdf2,
    randomFill
} from "crypto";
import PouchDB from "pouchdb";

export interface DatabasePluginAttachment {
    putEncryptedAttachment: (
        docId: string,
        attachmentId: string,
        revId: string | Buffer, // Either revId or attachment
        attachment: Buffer | string, // Either attachment or type
        attachmentType?: string | ((err: Error | null, result: PouchDB.Core.Response | null) => void),
        callback?: (err: Error | null, result: PouchDB.Core.Response | null) => void  ) => any;
    getEncryptedAttachment: (docId: string, attachmentId: string,
                             options?: {rev?: PouchDB.Core.RevisionId | undefined},
                             callback?: (error: Error | null, result: Blob | Buffer | null) => void) => any;
    useEncryption: (encryptionKey: Buffer) => any;

    encryptionKey?: Buffer;
}

class EncryptionCipher {
    private readonly encryptionKey: Buffer;
    private readonly algorithm: string;

    constructor(encryptionKey: Buffer, algorithm: string = "aes-192-cbc") {
        this.encryptionKey = encryptionKey;
        this.algorithm = algorithm;
    }

    public static deriveKey(password: string, salt: string): Promise<Buffer> {
        return new Promise<Buffer>(function(resolve, reject) {
            pbkdf2(Buffer.from(password), Buffer.from(salt), 64000, 24, "sha256", (err, derivedKey) => {
                if (err) reject(err);
                else {
                    resolve(derivedKey);
                }
            });
        });
    }

    public static async fromPassword(
        password: string,
        salt: string = "munkey-salt",
        algorithm?: string): Promise<EncryptionCipher>
    {
        const derivedKey = await EncryptionCipher.deriveKey(password, salt);
        return new EncryptionCipher(derivedKey, algorithm);
    }

    public getEncryptionKey(): Buffer {
        return Buffer.from(this.encryptionKey);
    }

    public createCipher(fill: Buffer): Cipher {
        return createCipheriv(this.algorithm, this.encryptionKey, fill);
    }

    public createDecipher(fill: Buffer): Decipher {
        return createDecipheriv(this.algorithm, this.encryptionKey, fill);
    }

    public static createFill(size: number): Promise<Buffer> {
        return new Promise<Buffer>((resolve, reject) => {
            randomFill(Buffer.alloc(size), (err, fill) => {
                if (err) reject(err)
                else {
                    resolve(fill);
                }
            });
        });
    }

    public async encrypt(plainText: Buffer): Promise<Buffer> {
        const fill = await EncryptionCipher.createFill(16);
        const cipher = this.createCipher(fill);

        return Buffer.concat([
            fill,
            cipher.update(plainText),
            cipher.final(),
        ]);
    }

    public async decrypt(cipherText: Buffer): Promise<Buffer> {
        const fill = cipherText.slice(0, 16);
        const decipher = this.createDecipher(fill);

        cipherText = cipherText.slice(16);
        return Buffer.concat([ decipher.update(cipherText), decipher.final() ]);
    }
}

function getEncryptionPlugin(pouchRoot: PouchDB.Static): DatabasePluginAttachment {
    const storedProcedures = {
        putAttachment: pouchRoot.prototype.putAttachment,
        getAttachment: pouchRoot.prototype.getAttachment,
    };

    return {
        putEncryptedAttachment(...args) {
            if (!this.hasOwnProperty("encryptionKey")) {
                return storedProcedures.putAttachment.call(this, ...args);
            }

            // PouchDB's function signatures are strange...
            // The "optional" argument is revId, which is right in the MIDDLE of the call signature...
            // So, depending on if this "optional" arg is provided, the attachment is either
            // `attachment` (if provided) or `revId` (if not provided).
            let [
                docId,
                attachmentId,
                revId,          // revId | attachment
                attachment,     // attachment | attachmentType
                attachmentType, // attachmentType | callback | none
                callback,       // callback | none
                ...remainingArgs
            ]: any[] = args;
            let outputArgs: any[] = [ docId, attachmentId ];

            // 3 cases:
            // Case 1: Caller provided no revId. `revId` is actually an attachment.
            //   1a: `attachmentType` is a function, and `callback` is undefined.
            //   1b: `attachmentType` is also undefined (promise-based).
            // Case 2: Caller provided a revId, `attachmentType` is a string: `attachment` is an attachment.
            if (["function", "undefined"].includes(typeof (attachmentType ?? undefined))) {
                callback = attachmentType;
                attachmentType = attachment;
                attachment = revId;
            }
            else if (typeof attachmentType === "string") {
                outputArgs.push(revId);
            }

            // Determine if it's a promise-based or callback-based call.
            if (typeof callback === "function") {
                // It's callback-based.
                throw new Error("Callback-based .putAttachment() proxy not implemented, please use Promise API");
            }
            else {
                // It's promise-based.
                return new EncryptionCipher(this.encryptionKey)
                    .encrypt(attachment)
                    .then((encryptedAttachment) => storedProcedures.putAttachment.call(this,
                        ...outputArgs,
                        encryptedAttachment,
                        attachmentType,
                        callback,
                        ...remainingArgs));
            }
        },
        getEncryptedAttachment(...args) {
            if (!this.hasOwnProperty("encryptionKey")) {
                return storedProcedures.getAttachment.call(this, ...args);
            }

            let callback = args[3];
            if (typeof callback === "function") {
                // It's callback-based.
                throw new Error("Callback-based encryption intercept not implemented; please use Promise API");
            }
            else {
                // It's promise-based.
                return storedProcedures.getAttachment
                    .call(this, ...args)
                    .then((result: Buffer) => new EncryptionCipher(this.encryptionKey).decrypt(result));
            }
        },
        useEncryption(encryptionKey: Buffer) {
            this.encryptionKey = encryptionKey;
        },
    };
}

export {
    getEncryptionPlugin,
    EncryptionCipher,
};
