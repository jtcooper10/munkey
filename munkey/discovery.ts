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

export {
    PeerVaultDecl,
    PeerIdentityDecl,
};
