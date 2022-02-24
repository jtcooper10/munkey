using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using MunkeyRpcClient;
using Grpc.Core;

namespace MunkeyCli.Contexts
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

        public AuthenticatedClientContext Authenticate()
        {
            return Authenticate(AuthenticationContext.PromptPassword());
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
            var result = _network.LinkVault(new RemoteVaultLinkRequest
            {
                Location = new()
                {
                    Host = hostname,
                    Port = portNum.ToString(),
                },
                VaultName = vaultName,
            });

            if (result.Status != VaultStatus.Ok) {
                Console.WriteLine($"Vault linking failed: {result.Message}");
                return;
            }
            
            Console.WriteLine("Vault linking was successful");
        }
        
        public async Task ResolveVaults(string vaultName)
        {
            using var networkStream = _network.ResolveVault(new VaultRequest
            {
                Name = vaultName,
            });

            await foreach (var resolvedVault in networkStream.ResponseStream.ReadAllAsync())
            {
                if (!Int32.TryParse(resolvedVault.Location.Port, out var portNum))
                {
                    continue;
                }
                
                Console.Write($"Vault found ({resolvedVault.VaultName} @ {resolvedVault.Location.Host}:{portNum}), " + 
                              "Link? [y/N] ");
                if ((Console.ReadLine()?.ToLower() ?? "n") != "y")
                    continue;
                
                await VaultLink(vaultName, resolvedVault.Location.Host, portNum);
            }
            
            Console.WriteLine("No other vaults found.");
        }
    }
}
