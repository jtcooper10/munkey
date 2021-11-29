import PouchDB from "pouchdb";

import chai, { expect } from "chai";
import chaiAsPromised from "chai-as-promised";
import sinon from "sinon";
import { describe, it, before, beforeEach, afterEach } from "mocha";

import { DatabaseDocument, VaultDatabase } from "../munkey/services";
import { DatabasePluginAttachment, getEncryptionPlugin } from "../munkey/pouch";

chai.use(chaiAsPromised);

describe("Vault Object Operations", function() {

    let sandbox: sinon.SinonSandbox;
    let pouch: sinon.SinonStubbedInstance<PouchDB.Database<DatabaseDocument> & DatabasePluginAttachment>;
    let message = Buffer.from('{"message":"hello"}');

    before(function() {
        const plugin = getEncryptionPlugin(PouchDB);
        PouchDB.plugin(<unknown> plugin as PouchDB.Plugin);
    });

    beforeEach(async function() {
        sandbox = sinon.createSandbox();
        pouch = sandbox.createStubInstance(PouchDB);
        pouch.getEncryptedAttachment.resolves(message);
        pouch.putEncryptedAttachment.resolves(null);
    });

    afterEach(function() {
        sandbox.restore();
    });

    it("should not attempt to re-initialize the database if it already exists", async function() {
        await VaultDatabase.create(pouch);
        expect(pouch.putEncryptedAttachment.called).to.be.false;
    });

    it("should initialize an empty -- but encrypted -- database if none exists", async function() {
        pouch.getEncryptedAttachment.rejects({ status: 404 });

        await VaultDatabase.create(pouch);
        const foundArg = pouch.putEncryptedAttachment.args[0].find(arg => arg instanceof Buffer) as Buffer;

        expect(foundArg.toString()).to.equal("{}");
    });

});
