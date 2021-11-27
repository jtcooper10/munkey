import {
    createCipheriv,
    createDecipheriv,
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

const storedProcedures = {
    putAttachment: PouchDB.prototype.putAttachment,
    getAttachment: PouchDB.prototype.getAttachment,
};

const encryptionPlugin: DatabasePluginAttachment = {
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
            return new Promise<Buffer>((resolve, reject) => {
                randomFill(Buffer.alloc(16), (err, fill) => {
                    if (err) reject(err)
                    else {
                        resolve(fill);
                    }
                });
            })
                .then(fill => {
                    const cipher = createCipheriv("aes-192-cbc", this.encryptionKey, fill);
                    attachment = Buffer.concat([ fill, cipher.update(attachment), cipher.final() ]);
                    return storedProcedures.putAttachment.call(this,
                        ...outputArgs,
                        attachment,
                        attachmentType,
                        callback,
                        ...remainingArgs);
                });
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
                .then((result: Buffer) => {
                    const fill = result.slice(0, 16);
                    const attachment = result.slice(16);
                    const decipher = createDecipheriv("aes-192-cbc", this.encryptionKey, fill);
                    return Buffer.concat([ decipher.update(attachment), decipher.final() ]);
                });
        }
    },
    useEncryption(encryptionKey: Buffer) {
        this.encryptionKey = encryptionKey;
    },
};

export {
    encryptionPlugin,
};
