# Munkey
## A peer-to-peer cryptographic password manager

**Munkey** is a cryptographic password manager which allows local devices to sync automatically, no internet connection required!

It is essentially a desktop password manager (like [KeePass](https://keepass.info/)) with the built-in reconciliation mechanisms of cloud-based password managers (like [BitWarden](https://bitwarden.com/)).
With a locally-distributed password vault, you'll never have to worry about trusting a cloud-based provider to keep your vault information safe.

_This is a senior capstone project by Josh C._

## Munkey Shell

As of Munkey v0.0.1 (MVP), the Munkey Shell is the only interface implemented.
This is subject to change as additional interfaces and services are added.

After following the instructions found in [Building from Source](#Building from Source), execute the `munkey.js` file found in `bin`:

```shell
$ node bin/munkey.js
```

### Getting Started

To get started quickly, simply run:

```shell
$ npm install
$ npm start
```

### Vaults

A `Vault` is an individual database containing your encrypted passwords.
You can create an arbitrary number of vaults, each given a locally unique name and a globally unique ID.

On startup, you'll be greeted with the Munkey Shell interface.
The name in parentheses is the name of the currently selected vault. At first, it will simply say "mkey,"
indicating that we have no vaults available. We can use `vault list` at any time to see what vaults are available.

Here's how to create a `Vault` named "Henry":

```shell
(mkey) % vault new Henry
Enter a password:
Creating new vault (Henry)
(Henry) % vault list
:: :: Active  Vaults :: ::
 * "Henry" = Vault[cfe4a83b-e333-4bae-8776-92954902abd4]
```

The Munkey Shell will prompt you for a password. The contents of the database are encrypted using this password,
which must be supplied each time the program is run.

If, while logging into an existing database, you mistype your password, you may use the `vault login` command to fix it.
Note that this does not reset the password of the database itself; if you forget your password, you're out of luck!

### Vault Entries

Next, we can insert new values into the database with `vault set`, and retrieve them with `vault get`.

```shell
(Henry) % vault set password hunter2
Adding new vault entry to cfe4a83b-e333-4bae-8776-92954902abd4
(Henry) % vault get password
[password] = hunter2
```

As of v0.0.1 (MVP), the database (while encrypted, both at rest and in transit) is only designed to store basic key-value pairs.
In later versions, fully featured password profiles will be made available.

### Vault Linking

To manually connect your local vault to a remote one, use the `vault link` command.
Supply the vault name (the nickname of the vault on the remote host), hostname, and port number.

```shell
(Henry) % vault link Steve@192.168.1.5:8000
Enter a password:
Connecting with vault Steve@192.168.1.5:8000

# Optionally, give it a locally unique nickname with the `as` command!
(Henry) % vault link Steve@192.168.1.5:8000 as NotSteve
```

Note that both devices must be publicly available on your local area network in order to link successfully.

### Peer Discovery

To automatically find other devices on your network, you can enable peer discovery by specifying a port
using the `--discovery <port>` argument on startup.
Once enabled, your device becomes discoverable by peers on the network and listens for other peers, as well.

To see a list of known peers, use the `peer list` command.

```shell
(Henry) % peer list
 Peer[f1e9b0cb-acc2-445b-89ca-eadf8fffc4eb]@192.168.1.5:8000
        * "Steve": Vault[eaeec732-9620-45cc-b9b6-3eec5a166efd]
```

Any discovered peers will be listed here, along with a list of vaults that are available from that peer.
When a peer is known, you can actually link against their vaults by name:

```shell
(Henry) % vault link Steve
  * RemoteVault[eaeec732-9620-45cc-b9b6-3eec5a166efd]@192.168.1.5:8000
Enter a password:
Connecting with vault Steve@192.168.1.5:8000
```

Notice that we don't need to specify a hostname and port, since our device has already discovered their location.

While running, you may disable/enable peer networking at any time using the `link up`/`link down` commands.

### Command-Line Arguments:

Argument | Description | Default
-------  | ----------- | -------
-h/--help | View command-line arguments | N/A
-p/--port \<port\> | Port Number to run web services on | 8000
-d/--discovery \<port\> | Port Number to run discovery services on (if not specified, discovery is off) | Off
--in-memory | Use a temporary, in-memory database rather than on-disk | False

## Building From Source

As of v0.0.1 (MVP), only one interface exists (the Munkey shell),
and no worker services have been implemented.
Until that changes, all source files can be found under the `munkey` directory. At that point,
each interface, service, etc. will be given its own subproject under the `munkey` directory.

### Dependencies

To build/run the Munkey shell from source, you will need the following dependencies on your machine:

* Node.js 15+ LTS
* NPM v7+

### Build 

To build and run the application:

```shell
# Install Node.js dependencies
$ npm install

# Build + run
$ npm start
```

The output files and executables can be found under `munkey/bin`.

Alternatively, to build and run the application in separate steps, after installing dependencies:

```shell
$ npm run build
$ node munkey/bin/munkey.js
```
