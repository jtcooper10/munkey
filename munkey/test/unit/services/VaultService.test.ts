import PouchDB from "pouchdb";
import { DatabaseContext, DatabaseDocument, VaultDatabase, VaultDB, VaultService } from "../../../services";
import { DatabasePluginAttachment } from "../../../pouch";

import { describe, it, beforeEach } from "mocha";
import sinon from "sinon";
import ChaiAsPromised from "chai-as-promised";
import chai, { expect } from "chai";
chai.use(ChaiAsPromised);


describe("Test vault database wrapper", function() {

    let sandbox: sinon.SinonSandbox;

    it("should retrieve the password database if it exists", async function() {
        let buffer: Buffer = Buffer.from('{"hello":"world"}');
        let getAttachment: sinon.SinonStub<any> = sandbox.stub().resolves(buffer);
        let db = sandbox.createStubInstance<VaultDB>(PouchDB, { getAttachment });

        const vault = new VaultDatabase(db);
        const result = await vault.getContent();

        expect(result).to.be.instanceof(Buffer, "Result was expected to be a Buffer instance");
        expect(result.compare(buffer)).to.equal(0, "Result Buffer contains unexpected contents");
    });

    it("should return null if the password database does not exist", async function() {
        let getAttachment: sinon.SinonStub<any> = sandbox.stub().rejects("Error");
        let db = sandbox.createStubInstance<VaultDB>(PouchDB, { getAttachment });

        const vault = new VaultDatabase(db);
        const result = await vault.getContent();

        expect(result).to.be.null;
    });

    it("successfully overwrites the attachment when the vault database already exists", async function() {
        let buffer: Buffer = Buffer.from('{"hello":"world"}');
        let revId = "_rev-123-abc";
        let get: sinon.SinonStub<any> = sandbox.stub().resolves({ _rev: revId });
        let putAttachment: sinon.SinonStub<any> = sandbox.stub().resolves({ ok: { valueOf: () => true, }});
        let db = sandbox.createStubInstance<VaultDB>(PouchDB, { get, putAttachment });

        const vault = new VaultDatabase(db);
        const result = await vault.setContent(buffer);

        expect(result, "setContent() returned false, indicating failure").to.be.true;
        expect(putAttachment.getCall(0).args).to.include(revId, "putAttachment() called with incorrect revision ID");
        expect(putAttachment.getCall(0).args).to.include(buffer, "putAttachment() called with incorrect attachment");
    });

    it("initializes the vault database when it does not already exist", async function() {
        let buffer: Buffer = Buffer.from('{"hello":"world"}');
        let get: sinon.SinonStub<any> = sandbox.stub().rejects({ status: 404 });
        let putAttachment: sinon.SinonStub<any> = sandbox.stub().resolves({ ok: { valueOf: () => true, }});
        let db = sandbox.createStubInstance<VaultDB>(PouchDB, { get, putAttachment });

        const vault = new VaultDatabase(db);
        const result = await vault.setContent(buffer);

        expect(result, "setContent() returned false, indicating failure").to.be.true;
        expect(putAttachment.getCall(0).args).to.include(buffer, "setContent() did not send attachment to database");
    });

    it("does not upload the attachment if an unknown error had occurred during get()", async function() {
        let buffer: Buffer = Buffer.from('{"hello":"world"}');
        let get: sinon.SinonStub<any> = sandbox.stub().rejects(new Error("Something bad happened"));
        let putAttachment: sinon.SinonStub<any> = sandbox.stub().resolves({ ok: { valueOf: () => true, }});
        let db = sandbox.createStubInstance<VaultDB>(PouchDB, { get, putAttachment });

        const vault = new VaultDatabase(db);
        const result = await vault.setContent(buffer);

        expect(result, "setContent() returned true, indicating success when expected failure").to.be.false;
        expect(putAttachment.called, "setContent() uploaded attachment despite failure on get()").to.be.false;
    });

    before(function() {
        sandbox = sinon.createSandbox();
    });

    afterEach(function() {
        sandbox.restore();
    });

});


describe("Test vault creation on Vault service container", function() {

    let context: DatabaseContext<DatabaseDocument, DatabasePluginAttachment>;
    let sandbox: sinon.SinonSandbox;
    let database: sinon.SinonStubbedInstance<VaultDB>;
    let service: VaultService;

    it("should create a new, valid vault successfully", async function() {
        const create = sandbox.stub().returns(database);
        service = new VaultService({ create, load: () => database, });

        let vaultName = "test-vault-name";
        let vaultId = "test-vault-id";
        let vaultData = Buffer.alloc(0);
        let result = await service.createVault(vaultName, vaultId, vaultData);

        expect(result.success, "createVault() indicated failure on return").to.be.true;
        expect(create.calledWith(vaultName), "Database context create() called with incorrect vault name").to.be.true;
    });

    it("should fail gracefully if attempting to create the exact same vault twice", async function() {
        service = new VaultService({ create: sandbox.stub().returns(database), load: () => database });

        // Create the same vault twice; same name, same id, same call signature.
        let vaultName = "test-vault";
        let vaultId = "123-abc";
        let createVault = () => service.createVault(vaultName, vaultId, Buffer.alloc(0));

        const result1 = await createVault();
        const result2 = await createVault();
        expect(result1.success, "Initial vault creation failed").to.be.true;
        expect(result2.success, "Vault double-creation was not rejected").to.be.false;
    });

    it("does not create a new vault on link() if it already exists", async function() {
        let create: sinon.SinonStub<any> = sandbox.stub().resolves(database);
        let vault = new VaultService({ create, load: () => database });
        let outVault: VaultDatabase;

        let vaultName1 = "test-vault1";
        let vaultName2 = "test-vault2";
        let vaultId = "123-abc";

        const result1 = vault.linkVault(vaultName1, vaultId);
        outVault = vault.getVaultByName(vaultName1);
        expect(result1.success, `First vault link indicated failure: ${result1.message}`).to.be.true;
        expect(outVault, "Vault not accessible after first vault link").to.not.be.null;
        expect(create.called, "Vault creation not called on first vault link").to.be.true;
        create.resetHistory();

        const result2 = vault.linkVault(vaultName2, vaultId);
        outVault = vault.getVaultByName(vaultName2);
        expect(result2.success, `Second vault link indicated failure: ${result2.message}`).to.be.true;
        expect(outVault, "Vault not accessible after second vault link").to.not.be.null;
        expect(create.called, "Vault creation called unexpectedly on second vault link").to.be.false;
        expect(vault.getVaultByName(vaultName1)).to.equal(outVault, "Mapped vault names did not return the same vault");
    });

    it("indicates a conflict on link() if the given nickname is already in use", async function() {
        let create: sinon.SinonStub<any> = sandbox.stub().returns(database);
        let vault = new VaultService({ create, load: () => database });

        let vaultName = "test-vault";
        let vaultId = "123-abc";

        const result1 = vault.linkVault(vaultName, vaultId);
        expect(result1.success).to.be.true;
        expect(vault.getVaultByName(vaultName)).to.not.be.null;

        create.resetHistory();
        const result2 = vault.linkVault(vaultName, vaultId);
        expect(result2.success, "Second vault link unexpectedly indicated success").to.be.false;
        expect(create.called, "Vault creation called unexpectedly on second vault link").to.be.false;
    });

    it("loads the database from disk on load()", async function() {
        let load: sinon.SinonStub<any> = sandbox.stub().returns(database);
        let create: sinon.SinonStub<any> = sandbox.stub().returns(database);
        let vault = new VaultService({ create, load });

        let vaultName = "test-vault";
        let vaultId = "123-abc";

        expect(vault.getVaultByName(vaultName)).to.be.null;
        const result = vault.loadVault(vaultName, vaultId);
        expect(result.success, `loadVault() indicated failure: ${result.message}`).to.be.true;
        expect(vault.getVaultByName(vaultName)).to.not.be.null;
        expect(create.called).to.be.false;
        expect(load.callCount).to.equal(1);
    });

    it("indicates failure if the given nickname is already in use on load()", async function() {
        let load: sinon.SinonStub<any> = sandbox.stub().returns(database);
        let vault = new VaultService({ create: load, load });

        let vaultName = "test-vault";
        let vaultId = "123-abc";

        expect(vault.loadVault(vaultName, vaultId).success).to.be.true;
        load.resetHistory();
        expect(vault.loadVault(vaultName, vaultId).success).to.be.false;
        expect(load.called).to.be.false;
    });

    before(function() {
        sandbox = sinon.createSandbox();
    });

    beforeEach(function() {
        context = null;
        database = sandbox.createStubInstance<VaultDB>(PouchDB);
    });

    afterEach(function() {
        sandbox.restore();
    });

});
