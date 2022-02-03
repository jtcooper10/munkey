import CommandServer from "../CommandServer";
import {
    IVaultServer,
    IVaultNetworkServer,
    VaultActionResult,
    VaultCollection,
    VaultCollectionRequest,
    VaultCreationRequest,
    VaultData,
    VaultEntry,
    VaultRequest,
    VaultStatus as RpcVaultStatus,
    RemoteVaultLinkRequest,
    VaultNetworkStatusRequest,
} from "@munkey/munkey-rpc";
import {
    sendUnaryData,
    ServerUnaryCall,
    ServerWritableStream,
    UntypedHandleCall,
} from "@grpc/grpc-js";
import {
    VaultOption,
    VaultResult,
    VaultStatus,
} from "../../services";
import { Status } from "../../error";

export default function createVaultServer<T extends CommandServer>(commands: T): IVaultServer {
    function mapVaultResult(result: VaultResult, respond: sendUnaryData<VaultActionResult>) {
        const response = new VaultActionResult()
            .setMessage(result.message)
            .setStatus(RpcVaultStatus.OK);

        if (!result.success) {
            switch (result.status) {
                case VaultStatus.NOT_FOUND:
                    response.setStatus(RpcVaultStatus.NOTFOUND);
                    break;
                default:
                    return respond(new Error(result.message));
            }
        }

        respond(null, response);
    }
    
    function mapVaultData(response: VaultData,
                          content: VaultOption<Buffer>,
                          respond: sendUnaryData<VaultData>)
    {
        response.setStatus(RpcVaultStatus.OK);
        switch (content.status) {
            case VaultStatus.NOT_FOUND:
                response.setStatus(RpcVaultStatus.NOTFOUND);
                break;
            case Status.SUCCESS:
                response.setStatus(RpcVaultStatus.OK).setData(content.data);
                break;
            default:
                return respond(new Error(content.message));
        }
        
        respond(null, response);
    }
    
    class VaultServer implements IVaultServer {
        [name: string]: UntypedHandleCall;

        public createVault(call: ServerUnaryCall<VaultCreationRequest, VaultActionResult>,
                           respond: sendUnaryData<VaultActionResult>): void
        {
            commands
                .onCreateVault(call.request.getName(), Buffer.from(call.request.getInitialdata()))
                .then(opt => {
                    if (!opt.success) {
                        return respond(new Error(opt.message));
                    }
                    
                    respond(null, new VaultActionResult()
                        .setMessage(opt.message)
                        .setStatus(RpcVaultStatus.OK));
                });
        };

        public deleteVault(call: ServerUnaryCall<VaultRequest, VaultActionResult>,
                           respond: sendUnaryData<VaultActionResult>): void
        {
            commands.onDeleteVault(call.request.getName())
                .then(result => mapVaultResult(result, respond));
        }

        public getContent(call: ServerUnaryCall<VaultRequest, VaultData>,
                          respond: sendUnaryData<VaultData>): void {
            const entry = new VaultEntry().setName(call.request.getName());
            commands.onGetContent(call.request.getName())
                .then(content => mapVaultData(new VaultData().setEntry(entry), content, respond));
        }

        public async listVaults(call: ServerUnaryCall<VaultCollectionRequest, VaultCollection>,
                                respond: sendUnaryData<VaultCollection>): Promise<void>
        {
            const response = new VaultCollection().setSize(0);
            for await (const vault of commands.services.vault.getActiveVaults()) {
                response.addList(new VaultEntry()
                    .setName(vault.nickname)
                    .setId(vault.vaultId));
                response.setSize(response.getSize() + 1);
            }
            respond(null, response);
        }

        public setContent(call: ServerUnaryCall<VaultCreationRequest, VaultActionResult>,
                          respond: sendUnaryData<VaultActionResult>): void
        {
            commands.onSetContent(call.request.getName(), Buffer.from(call.request.getInitialdata()))
                .then(result => mapVaultResult(result, respond));
        }

    }

    return new VaultServer();
}

export function createVaultNetworkServer<T extends CommandServer>(commands: T): IVaultNetworkServer {
    function isValidPort(portNum: number | null = null): boolean {
        return (portNum !== null) && (portNum < 65536) && (portNum >= 0);
    }
    
    class VaultNetworkServer implements IVaultNetworkServer {
        [name: string]: UntypedHandleCall;

        linkVault(call: ServerUnaryCall<RemoteVaultLinkRequest, VaultActionResult>,
                  respond: sendUnaryData<VaultActionResult>): void
        {
            const hostname = call.request.getLocation()?.getHost();
            const portStr = call.request.getLocation()?.getPort();
            const portNum = parseInt(portStr);
            const vaultName = call.request.getVaultname();
            
            if (!hostname) {
                respond(null, new VaultActionResult()
                    .setStatus(RpcVaultStatus.NOTFOUND)
                    .setMessage("No hostname was provided"));
                return;
            }
            else if (!portStr) {
                respond(null, new VaultActionResult()
                    .setStatus(RpcVaultStatus.NOTFOUND)
                    .setMessage("No port number was provided"));
            }
            else if (!isValidPort(portNum)) {
                respond(null, new VaultActionResult()
                    .setStatus(RpcVaultStatus.NOTFOUND)
                    .setMessage("Invalid port number"));
            }
            else if (!vaultName) {
                respond(null, new VaultActionResult()
                    .setStatus(RpcVaultStatus.NOTFOUND)
                    .setMessage("No vault name was provided"));
                return;
            }
            
            commands.onVaultLink(hostname, portNum, vaultName)
                .then(connectionResult => {
                    if (!connectionResult.success) {
                        respond(null, new VaultActionResult()
                            .setStatus(RpcVaultStatus.CONFLICT)
                            .setMessage(connectionResult.message));
                        return;
                    }
                    
                    respond(null, new VaultActionResult()
                        .setStatus(RpcVaultStatus.OK)
                        .setMessage(connectionResult.message));
                })
                .catch(err => {
                    respond(err);
                });
        }

        resolveVault(call: ServerWritableStream<VaultRequest, RemoteVaultLinkRequest>): void {
            call.end();
        }

        setNetworkStatus(call: ServerUnaryCall<VaultNetworkStatusRequest, VaultActionResult>,
                         respond: sendUnaryData<VaultActionResult>): void
        {
            respond(null, new VaultActionResult());
        }
    }
    
    return new VaultNetworkServer();
}
