import * as grpc from "@grpc/grpc-js";

import CommandServer from "../CommandServer";
import { ServiceContainer } from "../../services";
import {
    IVaultNetworkServer,
    IVaultNetworkService,
    IVaultServer,
    IVaultService,
    VaultNetworkService,
    VaultService,
} from "@munkey/munkey-rpc";
import createVaultServer, {
    createVaultNetworkServer
} from "./rpc";

interface RpcContainer {
    vaultService: IVaultService;
    vaultNetworkService: IVaultNetworkService;
}


export default class PipeCommandServer extends CommandServer {
    private readonly rpc: RpcContainer;

    public constructor(services: ServiceContainer, rpc?: RpcContainer) {
        super(services);
        this.rpc = rpc ?? {
            vaultService: VaultService,
            vaultNetworkService: VaultNetworkService,
        };
    }

    private static bindService(server: grpc.Server, credentials: grpc.ServerCredentials, address: string): Promise<grpc.Server> {
        return new Promise<grpc.Server>((resolve, reject) => {
            server.bindAsync(address, credentials, err => {
                if (err)
                    reject(err);
                server.start();
                resolve(server);
            })
        });
    }

    /**
     * @name addServices
     * @private
     * @method
     * Attach known gRPC services to the given server.
     * If any new gRPC services are creates, they should be configured here.
     * 
     * @param server gRPC server to attach known services to.
     */
    private addServices(server: grpc.Server): void {
        server.addService(this.rpc.vaultService, this.vaultServer);
        server.addService(this.rpc.vaultNetworkService, this.vaultNetworkServer);
    }

    private get vaultServer(): IVaultServer {
        // The command server itself cannot implement the service methods itself.
        // This is because the `CommandServer` class has its own properties/methods,
        // which might accidentally get called by RPC (thus the UntypedHandleCall indexer).
        return createVaultServer(this);
    }
    
    private get vaultNetworkServer(): IVaultNetworkServer {
        return createVaultNetworkServer(this);
    }

    public async useGrpc(server: grpc.Server, address: string = "127.0.0.1:5050"): Promise<grpc.Server> {
        this.addServices(server);
        await PipeCommandServer.bindService(server, grpc.ServerCredentials.createInsecure(), address);
        return server;
    }
};
