using System;
using System.Threading.Tasks;
using Google.Protobuf;
using MunkeyRpcClient;
using Grpc.Core;
using System.Text.Json.Nodes;

namespace MunkeyCli
{
    public class VaultClientContext
    {
        private readonly Vault.VaultClient _client;
        
        public VaultClientContext(ChannelBase channelBase)
        {
            this._client = new Vault.VaultClient(channelBase);
        }

        public async Task CreateVault(string vaultName)
        {
            var context = AuthenticationContext.PromptPassword();
            byte[] initialData = context.Encrypt("{}");
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
            if (result == null) {
                Console.WriteLine("Invalid JSON; aborting");
                return;
            }
            if (result[entryKey] == null) {
                Console.WriteLine("Entry not found");
                return;
            }

            Console.WriteLine($"[{entryKey}] = {result[entryKey]}");
        }

        public async Task SetVaultEntry(string vaultName, (string, string) entry)
        {
            var context = AuthenticationContext.PromptPassword();
            JsonNode? result = await FetchVaultContent(context, vaultName);
            if (result == null) {
                Console.WriteLine("Invalid JSON; aborting");
                return;
            }

            result[entry.Item1] = entry.Item2;
            byte[] serializedData = context.Encrypt(result.ToJsonString());
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
            var context = AuthenticationContext.PromptPassword();
            return await FetchVaultContent(context, vaultName);
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
