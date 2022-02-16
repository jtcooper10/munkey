using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using Google.Protobuf;
using MunkeyRpcClient;
using System.Text.Json.Nodes;

namespace MunkeyCli.Contexts
{
    public class AuthenticatedClientContext
    {
        private readonly Vault.VaultClient _client;
        private readonly VaultNetwork.VaultNetworkClient _network;
        private readonly AuthenticationContext _authentication;

        public AuthenticatedClientContext(
            Vault.VaultClient client,
            VaultNetwork.VaultNetworkClient networkClient,
            AuthenticationContext authentication)
        {
            this._client = client;
            this._network = networkClient;
            this._authentication = authentication;
        }

        public async Task CreateVault(string vaultName, byte[] initialData)
        {
            var response = await _client.CreateVaultAsync(new VaultCreationRequest
            {
                Name = vaultName,
                InitialData = ByteString.CopyFrom(initialData),
            });
            Console.WriteLine(response.Message);
        }
        public async Task GetVaultEntry(string vaultName, string entryKey)
        {
            JsonNode? result = await FetchVaultContent(vaultName);
            if (result == null)
            {
                Console.WriteLine("Invalid JSON; aborting");
                return;
            }
            if (result[entryKey] == null)
            {
                Console.WriteLine("Entry not found");
                return;
            }

            Console.WriteLine($"[{entryKey}] = {result[entryKey]}");
        }

        public async Task SetVaultEntry(string vaultName, (string, string) entry)
        {
            JsonNode? result = await FetchVaultContent(_authentication, vaultName);
            if (result == null)
            {
                Console.WriteLine("Invalid JSON; aborting");
                return;
            }

            result[entry.Item1] = entry.Item2;
            byte[] serializedData = _authentication.Encrypt(result.ToJsonString());
            var response = await _client.SetContentAsync(new VaultCreationRequest
            {
                Name = vaultName,
                InitialData = ByteString.CopyFrom(serializedData),
            });

            Console.WriteLine(response.Status == VaultStatus.Ok
                ? $"[{entry.Item1}] = {entry.Item2}"
                : $"Update unsuccessful: {response.Message}");
        }

        private async Task<JsonNode?> FetchVaultContent(string vaultName)
        {
            return await FetchVaultContent(_authentication, vaultName);
        }

        private async Task<JsonNode?> FetchVaultContent(AuthenticationContext context, string vaultName)
        {
            var response = await _client.GetContentAsync(new VaultRequest
            {
                Name = vaultName,
            });
            string decrypted = context.Decrypt(response.Data.ToByteArray());
            return JsonNode.Parse(decrypted);
        }
    }
}
