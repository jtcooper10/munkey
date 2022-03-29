using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using Google.Protobuf;
using MunkeyRpcClient;
using System.Text.Json.Nodes;
using System.Security.Cryptography;

namespace MunkeyClient.Contexts
{
    public class AuthenticatedClientContext
    {
        private readonly Vault.VaultClient _client;
        private readonly AuthenticationContext _authentication;

        public AuthenticatedClientContext(
            Vault.VaultClient client,
            AuthenticationContext authentication)
        {
            this._client = client;
            this._authentication = authentication;
        }

        public async Task CreateVault(string vaultName, byte[] initialData, byte[] publicKey)
        { 
            var response = await _client.CreateVaultAsync(new VaultCreationRequest
            {
                Name = vaultName,
                InitialData = ByteString.CopyFrom(initialData),
                PublicKey = ByteString.CopyFrom(publicKey),
            });

            if (response.Status != VaultStatus.Ok)
            {
                throw new Exception(response.Message);
            }
        }

        public async Task<string> GetVaultEntry(string vaultName, string entryKey)
        {
            var (result, _) = await FetchVaultContent(vaultName);
            if (result == null)
            {
                throw new InvalidOperationException("Invalid JSON");
            }
            if (result[entryKey] == null)
            {
                throw new InvalidOperationException("Entry not found");
            }

            return result[entryKey];
        }

        public async Task SetVaultEntry(string vaultName, (string, string) entry)
        {
            var (result, privateKey) = await FetchVaultContent(vaultName);
            if (result == null)
            {
                throw new InvalidOperationException("Invalid JSON; aborting");
            }

            // Validate the contents of the vault
            result[entry.Item1] = entry.Item2;
            await PushVaultContent(vaultName, result.Export(), privateKey);
        }

        public async Task PushVaultContent(string vaultName, byte[] serializedData, byte[] privateKey)
        {
            serializedData = _authentication.Encrypt(serializedData, privateKey);
            using (var validation = ValidationContext.FromKey(privateKey))
            {
                serializedData = validation.Wrap(serializedData);
            }

            var response = await _client.SetContentAsync(new VaultCreationRequest
            {
                Name = vaultName,
                InitialData = ByteString.CopyFrom(serializedData),
            });

            if (response.Status != VaultStatus.Ok)
            {
                throw new InvalidOperationException(response.Message);
            }
        }

        public async Task<(VaultContent, byte[])> FetchVaultContent(string vaultName)
        {
            return await FetchVaultContent(_authentication, vaultName);
        }

        private async Task<(VaultContent, byte[])> FetchVaultContent(AuthenticationContext context, string vaultName)
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

            var dataset = VaultDataset.Deserialize(response.Data.ToByteArray());
            using (var validation = ValidationContext.FromPublicKey(response.Entry.PublicKey.ToByteArray()))
            {
                if (!validation.Validate(dataset.Payload, dataset.Signature))
                    throw new CryptographicException("Database certificate is invalid");
            }

            string decrypted = context.Decrypt(dataset.Payload, out var privateKey);
            return (VaultContent.Parse(decrypted), privateKey);
        }
    }
}
