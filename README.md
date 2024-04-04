# `ironfish-wallet-server`
![wallet-server](https://github.com/iron-fish/wallet-server/assets/26990067/a00752a4-35e3-4d74-b9a5-5596abf321a1)

The wallet server makes it possible to build/run a fully private light wallet (on nearly any device) without having to run a ironfish node locally. The implementation is a HTTP REST caching server that interacts with an [ironfish](https://github.com/iron-fish/ironfish) node to provide a cached interface for light wallet clients. The REST server exposes OpenAPI defined endpoints for simple client generation (see [example](example). The "light blocks" are minimal representations of Iron Fish blocks that assume trust in the host of the blocks, as the client device will not prove the blocks are valid. The light blocks are encoded via [protobuf](protos) to allow simple serialization/deserialized for network transfer. We have included an [example light wallet client](example/README.md) implementation in this repo.

## Quick start local setup

### Terminal Session 1: Setting Up the Ironfish Node

- Install and run Ironfish node:
  - `npm install -g ironfish`
  - `ironfish start --rpc.tcp`
- This node must be synced before starting terminal 2

### Terminal Session 2: Running the Wallet Server

- Make sure you have a `.env` in root dir (or env vars), see [.env.example](./.env.example) for example
  - `NODE_HOST` set to `localhost`
  - `NODE_AUTH_TOKEN` set to `cat ~/.ironfish/internal.json | jq -r '.rpcAuthToken'`
- Run wallet server: from this repo root, run:
  - `yarn`
  - `yarn build`
  - `yarn start`
- Wait for wallet to sync before starting terminal session 3

### Terminal Session 3: Example Wallet Client

- change directory to `example/`
- If running wallet-server
- make sure `.env` exists,  see [example/.env.example](./example/.env.example) for example
- Install dependencies
  - `yarn`
- To see account balance
  - `yarn dev`
- To send a transaction
  - `yarn dev send assetId=51f33a2f14f92735e562dc658a5639279ddca3d5079a6d1242b2a588a9cbf44c toPublicAddress=c016b357465f41fcfd896eb6b878bcd865726779096d208f64e54347df9b46c7 amount=1 memo=test fee=1`
- wait for syncing of wallet to occur, this may take some time

## Light Block Bucket Storage
- The [uploader](./src/uploader/) can upload chunked backups of light blocks for simiplified download by clients.

### S3 Storage
- In the `manifest.json` there is a representation of where all the blocks are in the bucket. In the corresponding folders is a binary file containing consecutive serialization of `LightBlock`s. The byte position for each block in the `blocks` file is recorded in `blocks.byteRanges.csv.gz`. Using this, a user can download exactly the blocks they need for a client using an HTTP `Range` request.

### File Structure
```
s3_bucket_name/
│
├── finalized/
│   ├── 1712251453372/
│   │   ├── blocks
│   │   └── blocks.byteRanges.csv.gz
│   ├── 1712233333333/
│   │   ├── blocks
│   │   └── blocks.byteRanges.csv.gz
│   └── ... (additional timestamp folders as needed)
│
├── non-finalized/
│   └── 1712299999999/
│       ├── blocks
│       └── blocks.byteRanges.csv.gz
│
└── manifest.json
```


## Account balances for any account

Requesting blocks via the `getBlockRange` endpoint provides all transactions that have occurred on the network. The `output`s provide what notes have been created in a given transaction, the `spend`s (the important piece being the nullifiers) tell you which notes have been spent in a transaction. Given these two pieces of information, you can constructed the balance for any account for which you have the spending key.

## Creating and sending transactions

Creating transactions requires low level cryptography calls for proofs and transaction construction. We have provided nodejs bindings to our rust cryptography code via the [@ironfish/rust-nodejs](https://www.npmjs.com/package/@ironfish/rust-nodejs) package and used them in our [example client](example/README.md). We chose to use this library (instead of [@ironfish/sdk](https://www.npmjs.com/package/@ironfish/sdk)) so that it is clear how to use the rust code more directly. Similar bindings could be created for whatever languages your wallet client is written in (i.e. go, swift, java, c, etc.). Once the transaction is created, it can be submitted to network via the `SendTransaction` endpoint.

## Usage

- Install dependencies: `yarn`
- Codegen protobuf models: `yarn build`
- Start server: `yarn start`
- Hot Reloaded dev server: `yarn dev`

## Docker

- `docker pull ghcr.io/iron-fish/wallet-server:mainnet`

## Server <-> Iron Fish Node Connection

The node must be run with the flag `--rpc.tcp` flag (i.e. `ironfish start --rpc.tcp`) in order to enable communication with external clients. The default port for connecting to the node is `8020`. When connecting your wallet server, you will need to have the environment variable `NODE_AUTH_TOKEN` set in the wallet server environment. This value can be retrieved by looking at `internal.json` in the ironfish data directory, default location is `~/.ironfish/internal.json`. The token is stored in `rpcAuthToken` entry.

## Storage required for wallet-server

The server will need storage approximately equal to the chain db size, which can be found on the [ironfish stats page](https://stats.ironfish.network/).

## Generating a new wallet-server gRPC client

All that is needed to generate a compliant gRPC client using your favorite gRPC library is the [lightstreamer.proto](protos/lightstreamer.proto) file.

## Environment variables

See [.env.example](.env.example) for the environment variables that can be used with the server. The repository is compliant with usage of standard environment variables or [dotenv](https://www.npmjs.com/package/dotenv)

## Test fixture database

To create a reusable database, the cache was hardcoded to stop being built at 10 blocks. The database files relating to the cache (`block-cache/`) were copied to test fixture directory (`test/dbfixture/`). A global setup copies those files into a gitignored folder (`test/cache/`) for use when running tests. This prevents tests updating the db and causing changelogs. To update the fixture, just run the cache with a hardcoded stop point (currently 10 blocks), and overwrite files in `test/dbfixture/` directory.
