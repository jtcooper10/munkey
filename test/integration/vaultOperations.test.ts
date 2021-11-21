import * as services from "../../munkey/services";

import { describe, it, beforeEach } from "mocha";
import { expect } from "chai";
import * as sinon from "sinon";

describe("Local Vault Operations", function() {

    let service: services.VaultContainer;

    beforeEach(function() {
        service = new services.VaultContainer();
    });

    it("should create a new vault the first time", async function() {
        const vaultName: string = "integration1";
        const vaultId: string = await service.createVault(vaultName);
        const vaultByName = await service.getVaultByName(vaultName);
        const vaultById = await service.getVaultById(vaultId);

        expect(vaultId).to.not.be.null;
        expect(vaultByName).to.not.be.null;
        expect(vaultById).to.not.be.null;
    });

    it("should not recreate/overwrite a local vault that already exists", async function() {
        const vaultName: string = "integration2";
        const vaultId: string = await service.createVault(vaultName);
        const vault1 = await service.getVaultById(vaultId);
        await service.createVault(vaultName);
        const vault2 = await service.getVaultById(vaultId);

        expect(vault1).to.not.be.null;
        expect(vault2).to.not.be.null;
        expect(vault1).to.equal(vault2, "Returned a different vault after second call to vault creation");
    });

    it("should not overwrite a local vault when created by ID, regardless of name", async function() {
        const vaultName1: string = "integration2.1", vaultName2: string = "integration2.2";
        const vaultId: string = await service.createVault(vaultName1);
        const vault1 = service.getVaultById(vaultId);
        await service.createVault(vaultName2, vaultId);
        const vault2 = service.getVaultById(vaultId);
        const vault3 = service.getVaultByName(vaultName2);

        expect(vault1).to.equal(vault2);
        expect(vault3).to.not.exist;
    });

    it("should return the same vault when selecting by name or ID", async function() {
        const vaultName = "integration3";
        const vaultId: string = await service.createVault(vaultName);
        const vaultByName = service.getVaultByName(vaultName);
        const vaultById = service.getVaultById(vaultId);

        expect(vaultByName).to.exist;
        expect(vaultById).to.exist;
        expect(vaultByName).to.equal(vaultById, "Vault returned by name is different than vault returned by ID");
    });

    it("should set the first vault as the active vault when created", async function() {
        const vaultName: string = "integration4";
        const vaultId: string = await service.createVault(vaultName);
        const activeVaultId: string = service.getActiveVaultId();

        expect(vaultId).to.not.be.null;
        expect(activeVaultId).to.not.be.null;
        expect(vaultId).to.equal(activeVaultId, "Active vault ID returned was different than expected");
    });

});

describe("Interactions With Connection Service", function() {

    let vaultService: services.VaultContainer;
    let connectionService: services.ConnectionService;

    beforeEach(function() {
        vaultService = new services.VaultContainer();
        connectionService = new services.ConnectionService();
    });

    it("should propagate changes to single subscriber on update", async function() {
        const vaultName: string = "integration1";
        const vaultId: string = await vaultService.createVault(vaultName);
        const callback = sinon.fake();
        vaultService.subscribeVaultById(vaultId, callback);
        const vault: PouchDB.Database<services.DatabaseDocument> = vaultService.getVaultByName(vaultName);
        const dict = await vault.get<services.DatabaseDocument>("dict");
        await vault.put<services.DatabaseDocument>({
            _id: dict._id,
            _rev: dict._rev,
            entries: { "Testing": "ValueDoesNotMatter" },
        });

        expect(callback.called).to.be.true;
    });

    it("should propagate changes to multiple subscribers on update", async function() {
        const vaultName: string = "integration2";
        const vaultId: string = await vaultService.createVault(vaultName);
        const callbacks = [sinon.fake(), sinon.fake()];
        callbacks.forEach(cb => vaultService.subscribeVaultById(vaultId, cb));
        const vault: PouchDB.Database<services.DatabaseDocument> = vaultService.getVaultByName(vaultName);
        const dict = await vault.get<services.DatabaseDocument>("dict");
        await vault.put<services.DatabaseDocument>({
            _id: dict._id,
            _rev: dict._rev,
            entries: { "Testing": "ValueDoesNotMatter" },
        });

        callbacks.forEach(cb => {
            expect(cb.called).to.be.true;
        });
    });
});
