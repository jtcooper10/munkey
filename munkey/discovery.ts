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

export {
    PeerVaultDecl,
    PeerIdentityDecl,
    DeviceDiscoveryDecl,

    /* Validation Functions */
    isPeerIdentityDecl,
};
