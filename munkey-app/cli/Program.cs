using System.CommandLine;
using Grpc.Core;
using Grpc.Net.Client;

namespace MunkeyCli
{
    public static class Program
    {
        public static void Main(string[] args)
        {
            RootCommand rootCommand = new()
            {
                GetVaultCommand(),
            };
            rootCommand.Invoke(args);
        }

        private static Command GetVaultCommand()
        {
            Command vaultCommand = new("vault");
            
            // $ vault new
            Command vaultNewCommand = new("new");
            Argument<string> vaultNameArg = new("vault_name");
            vaultNewCommand.AddArgument(vaultNameArg);
            vaultNewCommand.SetHandler(async (string vaultName) => 
                await GetVaultContext().CreateVault(vaultName), vaultNameArg);
            vaultCommand.AddCommand(vaultNewCommand);

            return vaultCommand;
        }

        private static VaultClientContext GetVaultContext(string port = "8000")
        {
            GrpcChannel channel = GrpcChannel.ForAddress($"http://localhost:{port}", new GrpcChannelOptions
            {
                Credentials = ChannelCredentials.Insecure,
            });
            return new VaultClientContext(channel);
        }
    }
}
