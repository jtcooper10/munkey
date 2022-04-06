# Munkey
## A peer-to-peer cryptographic password manager for Windows

**Munkey** is an experimental cryptographic password manager which allows local devices to sync automatically, no internet connection required! It is a "hybrid" desktop- and network-based password manager (like [KeePass](https://keepass.info/)) with synchronization capabilities over a local area network.

Shared secrets (stored as simple key-values) are stored in an encrypted and write-protected distributed database, where linked devices can add or modify secrets. Any changes to these secrets are automatically synchronized with other devices on the local network, with the database contents being encrypted and digitally signed (both requiring the master password).

With a locally-distributed password vault, you'll never have to worry about trusting a cloud-based provider to keep your vault information safe.

_This is a senior capstone project by Josh C._

---

**IMPORTANT NOTE:** ***Munkey* is a highly experimental and early-stage application, and as such is not recommended for use in production environments.** It is basically a contrived, academic exploration on the feasibility and limitations of peer-to-peer distribution for highly sensitive data. While I intend to continue work on this project in the future, it is likely that it will look very different on release.

## How it Works

*Munkey* consists of two separate programs: the *Munkey Service* and a few options for *Munkey Clients* (specifically, a *shell*, *desktop app*, and *command-line program*). In order to use Munkey, you'll need to run the *Service* in the background, at which point any of the clients can be used. **It is not recommended to run multiple instances of the Munkey Service on the same machine**.

### Munkey Service
The Munkey Service manages a copy of a distributed database, with each instance belonging to a particular device. If you have other devices active, you can "link" these two devices together. While both devices are running, they will share secrets automatically when changes are detected, with the contents being encrypted/validated, requiring a master password to access/modify.

You can have any number of "Vaults," which are specific databases containing a particular list of secrets locked behind a master password. All of the devices which have linked to this Vault collectively form a "Vault Network," where changes to the underlying Vault are automatically replicated to all participants of the Vault Network.

In order for these devices to find each other, multicast DNS packets (called "mDNS") are sent across the local network, allowing each device to "announce" its presence. If your device is interested in a particular vault and receives an mDNS notification that this vault of interest is available, then you will be able to link to this vault to participate in its Vault Network. Participating in a Vault Network requires the master password; without it, the contents of the Vault cannot be decrypted and changes to the database cannot be digitally signed, effectively restricting write access.

### Munkey Client

While the Munkey Service will handle the "magic" of the Vault Network (managing/validating changes, handling peer requests, etc.), you will need to use a local Munkey Client on the same machine in order to interact with it as a user. Currently, there are two options: a *desktop app* and a *command-line program*. Between these two, the *desktop app* is the recommended, primary interface.

From a Munkey Client, you can decrypt, validate, read, and update the contents of a Vault database. When finished, you may "save" the changes made in the client, which submits the new Vault content to the service. The plaintext data stored in the database never leaves the client; even when submitting content to the Munkey Service, the contents are already encrypted and digitally signed.

## How to Install

Visit the [releases page](https://github.com/jtcooper10/munkey/releases) for installation instructions. The background service can be found in `MunkeyService.zip`, with the desktop

# How to Use Clients

There are two primary clients: the *desktop app* and *command-line program*.

## Desktop App

To create/open/link a new vault, use the `File` menu in the upper left. When you're finished with the current vault, use `File > Close`. If you invoked `munkey.exe` on a different port than the default, you may use the options in `Settings > Database` to change its location.

Add or modify an entry using the key/value text boxes at the bottom, and click "Add" to add it to the database. **Until you click `Save`, your changes will not be available to other devices on the Vault Network.** In addition, if changes have been made to the Vault Network, then you'll need to click `Pull` to see those changes.

## Command-Line

The name of the command-line program is `MunkeyCli.exe`, and you can invoke `MunkeyCli.exe -h` to see full use notes. However, the main commands used are:

```shell
$ MunkeyCli.exe vault new <vault_name>
$ MunkeyCli.exe vault set <vault_name> <key> <value>
$ MunkeyCli.exe vault get <vault_name> <key>
$ MunkeyCli.exe vault link <remote_vault_name>
```

These work almost identically to their GUI counterparts, with changes automatically being reflected in the Munkey Service.

## Munkey Shell (simplest, but not recommended)

This interface is primarily for debugging, but can be used if you're not interested in setting up a separate, dedicated client.

To use the Munkey Shell, simply run the `munkey.exe` executable from the command line with the `--shell` flag (run `munkey.exe -h` for full usage options). You'll see a prompt, and can issue basic commands here.

```shell
$ munkey.exe --shell
(mkey) % 
```

 ### Example
 
 First, create a vault:
```shell
(mkey) % vault new MyFirstVault
Enter a password:
Vault created with ID ....
(MyFirstVault) % 
```

Set and get some values:
```shell
(MyFirstVault) % vault set my-school-password hunter2
[my-school-password] = hunter2
(MyFirstVault) % vault get my-school-password
[my-school-password] = hunter2
```

If you have another device somewhere on your local network, you can find and link to one of its vaults:
```shell
(MyFirstVault) % vault link SharedVault
 * RemoteVault[....]@192.168.1.101:8000
Enter a password: 
Vault link successful: SharedVault@192.168.1.101:8000
(SharedVault) % 
```
A linked vault creates a local copy of that vault, and modifying your local copy will automatically replicate with other linked devices. These changes are also transitive; any other active devices will be replicated to, as well.

The primary command is `vault`, which allows you to create/modify vaults. Here are some of the commands you can use (arguments in angle brackets, optional syntax in square brackets):

### List of Commands
```shell
# Create a new vault (name must belocally [not globally] unique)
(mkey) % vault new <vault_name>
# Login to an existing local vault (prompts for a password)
(mkey) % vault login <vault_name>
# Link to a discovered local vault on the network (or give a specific location, if known)
(mkey) % vault link <remote_vault_name[@host:port]> [as <local_name>]
# Show a list of all local and remote vaults
(mkey) % vault list
# Set or get a vault entry's value
(mkey) % vault set <key> <value>
(mkey) % vault get <key>
```

## Building From Source

There are three main directories of interest: `munkey`, `munkey-app`, and `lib`. The `munkey` directory contains the source code for the Munkey Service, while the `munkey-app` contains the CLI and GUI source code.

### Requirements
- Python 3 (build only)
- Protocol Buffer Compiler (`protoc`)
- Node.js v16+
- NPM v7+
- .NET 6

### Building the Munkey RPC Library

Both the background service and clients require the RPC library, which is a shared Protobuf/gRPC library.

1. Enter the `lib/munkey-rpc` directory.
2. Run `npm run build`.

### Building the Munkey Service

1. Enter the `munkey` directory.
2. Install the RPC library with `npm install --save ../lib/munkey-rpc/munkey-munkey-rpc-0.0.1.tgz`
  - This is only required because installing a `.tgz` dependency requires an integrity check against a SHA1 hash, which changes each time the library is compiled.
3. Compile the service with `npm run build`
4. Run the program using `npm run start`, or run `node bin\munkey.js`

The output files and executables can be found under `munkey/bin`.
