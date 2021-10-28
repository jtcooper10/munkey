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

function isPeerIdentityDecl(decl: Object): decl is PeerIdentityDecl {
    return decl &&
        (decl.hasOwnProperty("uniqueId")) &&
        (decl.hasOwnProperty("vaults")) &&
        (Array.isArray((decl as PeerIdentityDecl).vaults)) &&
        ((decl as PeerIdentityDecl).vaults.every(vault => (
                vault.hasOwnProperty("vaultId") && vault.hasOwnProperty("nickname")
            )
        ));
}

export {
    PeerVaultDecl,
    PeerIdentityDecl,

    /* Validation Functions */
    isPeerIdentityDecl,
};
