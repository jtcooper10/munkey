import { randomBytes } from "crypto";
import PouchDB from "pouchdb";

import { describe, it, before, beforeEach } from "mocha";
import chai, { expect } from "chai";
import chaiAsPromised from "chai-as-promised";
import sinon from "sinon";

import { EncryptionCipher, getEncryptionPlugin } from "../munkey/pouch";

chai.use(chaiAsPromised);

describe("Test Surface Area of EncryptionCipher Class", function() {

    let password: string;
    let incorrectPassword: string;
    let message: Buffer;

    beforeEach(function() {
        password = randomBytes(32).toString("hex");
        do {
            incorrectPassword = randomBytes(32).toString("hex");
        } while (password === incorrectPassword);
    });

    before(function() {
        message = Buffer.from('{"message":"hello"}');
    });

    it("should create an unparsable string on encrypt", async function() {
        const cipher = await EncryptionCipher.fromPassword(password);
        const plainTextParsed = JSON.parse(message.toString());
        const cipherText = (await cipher.encrypt(message)).toString();

        expect(() => JSON.parse(cipherText)).to.throw;
        expect(plainTextParsed.message).to.equal("hello");
    });

    it("should be reversible to encrypt/decrypt", async function() {
        const cipher = await EncryptionCipher.fromPassword(password);
        const originalMessage = JSON.parse(message.toString()).message;
        const cipherText = await cipher.encrypt(message);
        const plainText = await cipher.decrypt(cipherText);
        const plainTextParsed = JSON.parse(plainText.toString());

        expect(originalMessage).to.equal(plainTextParsed.message);
    });

    it("should return a different key for different passwords", async function() {
        const correctCipher = await EncryptionCipher.fromPassword(password);
        const incorrectCipher = await EncryptionCipher.fromPassword(incorrectPassword);

        expect(password).to.not.equal(incorrectPassword);
        expect(correctCipher.getEncryptionKey()).to.not.equal(incorrectCipher.getEncryptionKey());
    });

});

type EncryptMethod = sinon.SinonSpy<[Buffer], Promise<Buffer>>;
type Stub = sinon.SinonStub<any[], Promise<any>>;

describe("Test PouchDB Encryption Plugin", function() {

    const message: string = '{"message":"hello"}';
    const messageDoc = JSON.parse(message);
    let sandbox: sinon.SinonSandbox;
    let password: string, badPassword: string;
    let cipher: EncryptionCipher, badCipher: EncryptionCipher;
    let encrypt: EncryptMethod, decrypt: EncryptMethod;
    let getAttachment: Stub, putAttachment: Stub;
    let encryptedMessage: Buffer;

    beforeEach(async function() {
        sandbox = sinon.createSandbox();
        password = randomBytes(32).toString("hex");
        do {
            badPassword = randomBytes(32).toString("hex");
        } while(badPassword === password);
        cipher = await EncryptionCipher.fromPassword(password);
        badCipher = await EncryptionCipher.fromPassword(badPassword);
        encryptedMessage = await cipher.encrypt(Buffer.from(message));
        getAttachment = sandbox.stub(PouchDB.prototype, "getAttachment").resolves(encryptedMessage);
        putAttachment = sandbox.stub(PouchDB.prototype, "putAttachment").resolves();
        encrypt = sandbox.spy(cipher, "encrypt");
        decrypt = sandbox.spy(cipher, "decrypt");
    });

    afterEach(function() {
        sandbox.restore();
    });

    it("should return the decrypted database contents with the right password", async function() {
        const plugin = getEncryptionPlugin(PouchDB);
        plugin.useEncryption(cipher.getEncryptionKey());
        const decryptedAttachment = await plugin.getEncryptedAttachment("some-doc", "passwords.json");
        const decryptedString = decryptedAttachment.toString();
        const decryptedMessage = JSON.parse(decryptedString).message;

        expect(decryptedMessage).to.equal(messageDoc.message);
        expect(decrypt.called).to.be.true;
    });

    it("should return the encrypted database contents when no password is provided", async function() {
        const plugin = getEncryptionPlugin(PouchDB);
        const encryptedAttachment = await plugin.getEncryptedAttachment("some-doc", "passwords.json");
        const encryptedString = encryptedAttachment.toString();

        expect(getAttachment.called).to.be.true;
        expect(() => JSON.parse(encryptedString)).to.throw(SyntaxError);
        expect(decrypt.called).to.be.false;
    });

    it("should try, but fail, to decrypt when given an invalid or incorrect password", async function() {
        const plugin = getEncryptionPlugin(PouchDB);
        plugin.useEncryption(badCipher.getEncryptionKey());

        await expect(plugin.getEncryptedAttachment("some-doc", "passwords.json")).to.be.rejected;
        expect(decrypt.called).to.be.true;
    });

});
