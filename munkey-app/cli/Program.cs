using System;
using System.CommandLine;
using Grpc.Core;
using Grpc.Net.Client;
using MunkeyClient.Contexts;
using MunkeyCli.Commands;

namespace MunkeyCli
{
    public static class Program
    {
        public static void Main(string[] args)
        {
            VaultCommandHandler command = new(GetVaultContext());
            RootCommand rootCommand = new()
            {
                GetVaultCommand(command),
            };
            rootCommand.Invoke(args);
        }

        public static Command GetVaultCommand(VaultCommandHandler command)
        {
            Command vaultCommand = new("vault");
            
            // $ vault new
            Command vaultNewCommand = new("new");
            Argument<string> vaultNameArg = new("vault_name");
            vaultNewCommand.AddArgument(vaultNameArg);
            vaultNewCommand.SetHandler<string>(command.VaultNew, vaultNameArg);
            vaultCommand.AddCommand(vaultNewCommand);
            
            // $ vault get
            Command vaultGetCommand = new("get");
            Argument<string> vaultKeyArg = new("key");
            vaultGetCommand.AddArgument(vaultNameArg);
            vaultGetCommand.AddArgument(vaultKeyArg);
            vaultGetCommand.SetHandler<string, string>(command.VaultGet,
                vaultNameArg, vaultKeyArg);
            vaultCommand.AddCommand(vaultGetCommand);
            
            // $ vault set
            Command vaultSetCommand = new("set");
            Argument<string> vaultValArg = new("value");
            vaultSetCommand.AddArgument(vaultNameArg);
            vaultSetCommand.AddArgument(vaultKeyArg);
            vaultSetCommand.AddArgument(vaultValArg);
            vaultSetCommand.SetHandler<string, string, string>(command.VaultSet,
                vaultNameArg, vaultKeyArg, vaultValArg);
            vaultCommand.AddCommand(vaultSetCommand);

            // $ vault list
            Command vaultListCommand = new("list");
            vaultListCommand.SetHandler(command.VaultList);
            vaultCommand.AddCommand(vaultListCommand);
            
            // $ vault link
            Command vaultLinkCommand = new("link");
            Option<int?> vaultPortOption = new(new[] {"--port", "-p"});
            Option<string?> vaultHostOption = new(new[] {"--host", "-h"});
            vaultLinkCommand.AddOption(vaultPortOption);
            vaultLinkCommand.AddOption(vaultHostOption);
            vaultLinkCommand.AddArgument(vaultNameArg);
            vaultLinkCommand.SetHandler<string, string?, int?>(command.VaultLink,
                vaultNameArg, vaultHostOption, vaultPortOption);
            vaultCommand.AddCommand(vaultLinkCommand);

            return vaultCommand;
        }

        private static VaultClientContext GetVaultContext(string port = "5050")
        {
            GrpcChannel channel = GrpcChannel.ForAddress($"http://localhost:{port}", new GrpcChannelOptions
            {
                Credentials = ChannelCredentials.Insecure,
            });
            return VaultClientContext.Create(channel);
        }
    }
}
