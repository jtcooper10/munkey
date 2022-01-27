using System;
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
            
            // $ vault get
            Command vaultGetCommand = new("get");
            Argument<string> vaultKeyArg = new("key");
            Option<string> vaultNameOpt = new(new[] { "--vault", "-V" });
            vaultGetCommand.AddArgument(vaultKeyArg);
            vaultGetCommand.AddOption(vaultNameOpt);
            vaultGetCommand.SetHandler(async (string vaultName, string entryKey) =>
                await GetVaultContext().GetVaultEntry(vaultName, entryKey), vaultNameOpt, vaultKeyArg);
            vaultCommand.AddCommand(vaultGetCommand);
            
            // $ vault get
            Command vaultSetCommand = new("set");
            Argument<string> vaultValArg = new("value");
            vaultSetCommand.AddArgument(vaultKeyArg);
            vaultSetCommand.AddArgument(vaultValArg);
            vaultSetCommand.AddOption(vaultNameOpt);
            vaultSetCommand.SetHandler(async (string vaultName, string entryKey, string entryValue) => 
                await GetVaultContext().SetVaultEntry(vaultName, (entryKey, entryValue)),
                vaultNameOpt, vaultKeyArg, vaultValArg);
            vaultCommand.AddCommand(vaultSetCommand);

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
