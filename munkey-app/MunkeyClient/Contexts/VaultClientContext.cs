using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using MunkeyRpcClient;
using Grpc.Core;

namespace MunkeyClient.Contexts
{
    public class VaultClientContext
    {
        private readonly Vault.VaultClient _client;
        private readonly VaultNetwork.VaultNetworkClient _network;

        public VaultClientContext(
            Vault.VaultClient client,
            VaultNetwork.VaultNetworkClient networkClient)
        {
            this._client = client;
            this._network = networkClient;
        }

        public static VaultClientContext Create(ChannelBase channel)
        {
            return new VaultClientContext(
                new Vault.VaultClient(channel),
                new VaultNetwork.VaultNetworkClient(channel));
        }

        public AuthenticatedClientContext Authenticate(string password)
        {
            byte[] key = AuthenticationContext.GenerateKey(password);
            return Authenticate(new AuthenticationContext(key));
        }

        public AuthenticatedClientContext Authenticate(AuthenticationContext context)
        {
            return new AuthenticatedClientContext(_client, context);
        }

        public async IAsyncEnumerable<(string, string)> VaultList()
        {
            var vaultCollection = await _client.ListVaultsAsync(new VaultCollectionRequest
            {
                MaxSize = 1,
            });
            if (vaultCollection.Size <= 0) {
                yield break;
            }

            foreach (var vault in vaultCollection.List) {
                yield return (vault.Name, vault.Id);
            }
        }

        public async Task VaultLink(string vaultName, string hostname, int portNum)
        {
            var result = await _network.LinkVaultAsync(new RemoteVaultLinkRequest
            {
                Location = new()
                {
                    Host = hostname,
                    Port = portNum.ToString(),
                },
                VaultName = vaultName,
            });

            if (result.Status != VaultStatus.Ok) {
                throw new Exception(result.Message);
            }
        }
        
        public async IAsyncEnumerable<(string, string, int)> ResolveVaults(string vaultName)
        {
            using var networkStream = _network.ResolveVault(new VaultRequest
            {
                Name = vaultName,
            });

            await foreach (var resolvedVault in networkStream.ResponseStream.ReadAllAsync())
            {
                if (!int.TryParse(resolvedVault.Location.Port, out var portNum))
                {
                    continue;
                }

                yield return (resolvedVault.VaultName, resolvedVault.Location.Host, portNum);
            }
        }
    }
}
