import path from "path";
import express from "express";
import PouchDB from "pouchdb";
import usePouchDB from "express-pouchdb";

import { DeviceDiscoveryDecl, PeerIdentityDecl } from "./discovery";
import { DatabaseConstructor, ServiceContainer } from "./services";

export interface ServerOptions {
    portNum: number;
    discoveryPortNum?: number;
    rootPath?: string;
}

/**
 * @name configureRoutes
 * @description Set up default Express.js endpoints based on IoC configurations.
 * Override options will be accepted but may be ignored.
 * @function
 *
 * @param {ServiceContainer} services Service container to attach endpoints to.
 * Any updates issued by the web server will be applied to this service container.
 * @param {ServerOptions} options Configuration options for web services.
 *
 * @returns Promise which resolves to a fully-configured Express.js application object.
 * The resolved application object is the same object as is passed in, but configured.
 */
function configureRoutes(services: ServiceContainer, options?: ServerOptions): Promise<ServiceContainer>
{
    const {
        portNum = 8000,
        rootPath = null,
        discoveryPortNum = null,
    } = options ?? {};
    const app = services.web.getApplication();
    const pouchOptions = !rootPath ? {}
        : { logPath: path.resolve(rootPath) + path.sep + "log.txt" };
    app.use("/link", express.json());

    app.get("/link", async function(
        request,
        response: express.Response<PeerIdentityDecl>)
    {
        const identityResponse: PeerIdentityDecl & { activePeerList: DeviceDiscoveryDecl[] } = {
            uniqueId: services.identity.getId(),
            vaults: await services.vault.getActiveVaultList(),
            activePeerList: services.activity.getDeviceList(),
        };

        response.json(identityResponse).end();
    });

    app.use("/db", usePouchDB(services.vault.getVaultConstructor(), pouchOptions));

    return services
        .admin.initialize()
        .then(adminService => services.vault.useAdminService(adminService))
        .then(() => services.web.listen({ portNum, tlsKeyPair: services.identity.getTlsKeyPair() }))
        .then(async () => {
            if (discoveryPortNum && await services.activity.broadcast(
                services.identity.getId(), discoveryPortNum, portNum))
            {
                services.activity.listen(services);
            }
            return services;
        });
}

function configurePlugins<D, P>(
    options: PouchDB.Configuration.DatabaseConfiguration,
    plugins?: P): DatabaseConstructor<PouchDB.Database<D> & P, D>
{
    // TODO: rigorous type assertions to make this squeaky clean.
    // The main reason this is so ugly right now is because PouchDB's types are pretty wonktacular.
    if (plugins) {
        PouchDB.plugin(<unknown> plugins as PouchDB.Plugin);
    }

    const CustomDatabase = PouchDB.defaults(options);
    return function(name, options) {
        return new CustomDatabase(name, options) as PouchDB.Database<D> & P;
    };
}

export {
    configureRoutes,
    configurePlugins,
};
export { configureLogging } from "./logging";
export * from "./pouch";
