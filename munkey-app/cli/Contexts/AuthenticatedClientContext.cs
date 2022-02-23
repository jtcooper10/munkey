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
            try
            {
                var result = await FetchVaultContent(vaultName);
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
            catch (InvalidOperationException ex)
            {
                Console.Error.WriteLine("Failed to get vault contents: " + ex.Message);
            }
        }

        public async Task SetVaultEntry(string vaultName, (string, string) entry)
        {
            try
            {
                var result = await FetchVaultContent(_authentication, vaultName);
                if (result == null)
                {
                    Console.WriteLine("Invalid JSON; aborting");
                    return;
                }

                // Validate the contents of the vault
                result[entry.Item1] = entry.Item2;
                byte[] serializedData = _authentication.Encrypt(result.Export(), Array.Empty<byte>());
                var response = await _client.SetContentAsync(new VaultCreationRequest
                {
                    Name = vaultName,
                    InitialData = ByteString.CopyFrom(serializedData),
                });

                Console.WriteLine(response.Status == VaultStatus.Ok
                    ? $"[{entry.Item1}] = {entry.Item2}"
                    : $"Update unsuccessful: {response.Message}");
            }
            catch (InvalidOperationException ex)
            {
                Console.Error.WriteLine("Failed to get vault contents: " + ex.Message);
            }
        }

        private async Task<VaultContent> FetchVaultContent(string vaultName)
        {
            return await FetchVaultContent(_authentication, vaultName);
        }

        private async Task<VaultContent> FetchVaultContent(AuthenticationContext context, string vaultName)
        {
            var response = await _client.GetContentAsync(new VaultRequest
            {
                Name = vaultName
            });
            if (response.Status != VaultStatus.Ok)
            {
                throw response.Status switch
                {
                    VaultStatus.NotFound => new InvalidOperationException($"Vault {vaultName} was not found"),
                    VaultStatus.Conflict => new InvalidOperationException($"Vault {vaultName} encountered a conflict"),
                    _ => new InvalidOperationException($"An unknown error occurred while trying to retrieve the contents of vault {vaultName}"),
                };
            }
            string decrypted = context.Decrypt(response.Data.ToByteArray(), out _);
            return VaultContent.Parse(decrypted);
        }
    }
}
