using System;
using System.Threading.Tasks;
using Google.Protobuf;
using MunkeyRpcClient;
using Grpc.Core;

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
            byte[] initialData = context.Encrypt("{\"hello\":\"world\"}");
            var response = await _client.CreateVaultAsync(new VaultCreationRequest
            {
                Name = vaultName,
                InitialData = ByteString.CopyFrom(initialData),
            });
            Console.WriteLine(response.Message);
        }
    }
}
