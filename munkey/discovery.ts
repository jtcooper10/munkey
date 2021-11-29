/**
 * discovery.ts: Peer Discovery Utilities
 * Tooling for manually or automatically connecting with peers
 * over a local area network.
 * 
 * @author  : Joshua Cooper
 * @created : 10/23/2021
 */

interface PeerVaultDecl {
    nickname: string;
    vaultId: string;
}

interface PeerIdentityDecl {
    uniqueId: string;
    vaults: PeerVaultDecl[];
}

interface DeviceDiscoveryDecl {
    hostname: string;
    portNum: number;
}

interface PeerLinkResponse extends PeerIdentityDecl {
    activePeerList: DeviceDiscoveryDecl[];
}

function isPeerIdentityDecl(decl: Object): decl is PeerIdentityDecl {
    return decl &&
        ("uniqueId" in decl) &&
        ("vaults" in decl) &&
        (Array.isArray((decl as PeerIdentityDecl).vaults)) &&
        ((decl as PeerIdentityDecl).vaults.every(vault => (
                "vaultId" in vault && "nickname" in vault
            )
        ));
}

function isDeviceDiscoveryDecl(decl: Object): decl is DeviceDiscoveryDecl {
    return decl &&
        ("hostname" in decl) &&
        ("portNum" in decl);
}

function isPeerLinkResponse(decl: Object): decl is PeerLinkResponse {
    return isPeerIdentityDecl(decl) &&
        ("activePeerList" in decl) &&
        (Array.isArray((decl as PeerLinkResponse).activePeerList)) &&
        ((decl as PeerLinkResponse).activePeerList.every(peer => isDeviceDiscoveryDecl(peer)));
}

export {
    PeerVaultDecl,
    PeerIdentityDecl,
    DeviceDiscoveryDecl,
    PeerLinkResponse,

    /* Validation Functions */
    isPeerIdentityDecl,
    isDeviceDiscoveryDecl,
    isPeerLinkResponse,
};
