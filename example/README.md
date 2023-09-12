# Example Client

The example client, located in the /example folder, serves as a guide for developers implementing the wallet server project. It demonstrates key functionalities such as requesting blocks, caching blocks, building the merkle tree, managing accounts, and handling block reorgs.

The goal of the example client is to provide a simple, easy-to-understand implementation of the wallet server project. It is not intended to be used in production.

The goal of this document is to explain the key components of the example client, so developers can use it as a reference when building their own clients that consume the wallet server project.

## Overview

In order to build a client that consumes the wallet server, and provides the key functionalities of a cryptocurrency wallet, the client must implement the following:

- Requesting blocks from the wallet server
- Building a merkle tree from the notes in the blocks
- Allowing the user to add accounts
- Using those accounts to parse notes and spends in the blocks
- Handling block reorgs

In addition to this, we recommend that the client caches blocks to lessen the load on the server, and also because historical blocks are needed when a new account is added.

## Contents

- Example client project overview
- Requesting blocks, and adding notes to the merkle tree
- Caching blocks
- Merkle tree
- Managing accounts
  - Adding accounts
  - Processing notes
  - Processing spends
  - Getting account balances
  - Sending transactions
- Handling block reorgs

## Example client project overview

The entrypoint into the example client is at `/src/Client/index.ts`. This imports the `Client` class, creates a new Client instance, and starts the client.

It also adds an account to the client, that is provided by the `process.env.SPENDING_KEY` environment variable. This is the account that the client will use to process notes and spends.

The `Client` class itself is a wrapper over three separate classes:

- `BlockProcessor`: This class is responsible for requesting blocks from the wallet server. It uses the `LightStreamerClient` class to request blocks. It also detects reorgs and instructs the relevant classes to handle them.
- `BlockCache`: This class is responsible for caching blocks. It uses LevelDB to store blocks locally. This ensures that the client does not need to request the same block multiple times from the server.
- `AccountsManager`: This class is responsible for managing accounts. It allows adding accounts, processing notes and spends, and getting account balances.

The final piece of the system is `merkle.ts` which instantiates a new `MerkleTree` and allows us to add notes to build the merkle tree.

The `BlockCache`, `AccountsManager` and merkle tree all also have a way to handle block reorgs.

## Requesting blocks, and adding notes to the merkle tree

When the client is started, it first has the `BlockProcessor` request blocks from the server in batches. As blocks are streamed from the wallet-server, it processes them in turn, adding each block to the block cache, and then adding the block's notes to the merkle tree.

This is done as follows:

- First, [`_pollForNewBlocks()`](./src/Client/utils/BlockProcessor.ts#L64) figures out what blocks (if any) we need to request. If we're starting the client for the first time, we must process the entire chain. If we have processed blocks before, we only need to request the blocks that have been added since the last time we processed blocks.
- If we have blocks that must be requested, we call [`_processBlockRange()`](./src/Client/utils/BlockProcessor.ts#L113) with the start and end heights of the blocks we need to request. This function requests the blocks from the server, and calls [`_processBlock()`](./src/Client/utils/BlockProcessor.ts#L154) on each block as they come in.
- [`_processBlock()`](./src/Client/utils/BlockProcessor.ts#L154) first adds the block to the block cache, and then calls it iterates through all notes in the block and adds them to the merkle tree.

Once all blocks are processed, we can move on to accounts. But first, let's take a look at the block cache.

## Caching blocks

It's not strictly necessary for a client to cache blocks, but in our opinion is is highly recommended. This is because historical blocks are needed when a new account is added. If the client does not have the blocks cached, it will need to re-request them from the server.

We've implemented a simple block cache using LevelDB. This is done in the [`BlockCache`](./src/Client/utils/BlockCache.ts) class. As blocks come in, they are added to the block cache. When a new account is added, the block cache is used to get the blocks needed to determine the notes and spends that are relevant to the account, rather than requesting them from the server again.

## Building the merkle tree

The merkle tree code is instantiated in [`merkle.ts`](./src/Client/utils/merkle.ts). Currently, the example client uses imports from the `@ironfish/sdk` package to build the merkle tree. Note that this currently only works for nodejs clients, which means it won't work in certain environments such as the browser. The merkle tree itself does not need to be tied to nodejs or `@ironfish/sdk`, but we have not split the implementation into a separate package. Moreover, it entirely possible to write a completely separate merkle tree implementation in any language.

## Managing accounts

Once blocks have been processed and the merkle tree is populated, the client is ready to add accounts. In order to provide the functionality a user would expect of a cryptocurrency wallet, the client must be able to:

- Add multiple accounts
- View the balance of each account
- Send transactions from each account

In order to do this, the client must figure out which notes and spends are relevant to each account. This is done by iterating through each block, getting the transactions from the block, getting the notes and spends from the transactions, and figuring out which notes and spends are relevant to each account.

The iterating of blocks and iterating down to notes and spends is done by the [`_processBlockForTransactions()`](./src/Client/utils/AccountsManager.ts#L157) function in accounts manager. It then defers to `_processNotes()` and `_processSpends()` to implement the relevant logic.

Before we can process notes and spends, we need to add accounts, so let's look at how that's done.

### Adding accounts

The AccountsManager class has an `addAccount()` function that lets a consumer add an account by its private key. When this is called, we use `generateKeyFromPrivateKey` from `@ironfish/rust-nodejs` to create a `Key` object which will provide us with necessary values like `incomingViewKey` (used to decrypt notes), `viewKey` (used to compute nullifiers), and `publicAddress` (used to identify the account).

You'll need to have access to these values in order to process notes and spends, as well as to send transactions.

### Processing notes

[`_processNote()`](./src/Client/utils/AccountsManager.ts#L190) takes a note, iterates through each account, and attempts to decrypt the note given that account's `incomingViewKey`. If the note can be decrypted, it means that the note belongs to that account, so it is added to the account's list of notes.

As part of this process, we also store additional metadata about the note, such as its `nullifier` and `index`. These two fields are necessary when sending a transaction.

### Proecssing spends

[`_processSpend()`](./src/Client/utils/AccountsManager.ts#L269) takes a spend, iterates through each account, and checks if the spend's nullifier matches any of the nullifiers of the notes in the account. If it does, it means that the corresponding note has been spend, and we mark the note as spent.

### Getting account balances

Once notes and spends have been processed, we can get the balance of each account. An example of this can be seen in the [`getAssetValuesForAccount()`](./src/Client/utils/AccountsManager.ts#114) function. Because Iron Fish supports custom assets, this function returns an object where keys are the asset IDs, and values are the balance of that asset for the account.

In order to build the object we:

- Initialize an empty object
- Iterate through each note in the account
- If the note has not been marked as spent, we add the note's value to the entry in the object corresponding to the note's asset ID
- Finally, we return the object.

To say this in a simpler manner, an account's balance for a given asset is the sum of the values of all unspent notes for that asset.

### Sending transactions

To send a transaction we need to do a few things:
- Create a transaction
- Fund the transaction
  - Take notes that are unspent from the account and use them to fund the transaction
  - Calculate the witness for the spent notes
- Add outputs (notes) for who will receive the funds
- Post the transaction

All of these steps are outlined in a [working example of a send](./src/Client/utils/send.ts)

## Handling block reorgs

A reorg happens when the blockchain has been forked, and the client is on the wrong fork. This means we've processed blocks which are no longer on the 'main chain', and we therefore need to roll back to the last block that is on the main chain, and then process blocks from there. I.e. we must undo some of the work we've done. The pieces of the system that must handle the reorg are:

- The block cache
  - We must delete the blocks that are no longer on the main chain
- The merkle tree
  - We must roll the merkle tree back to the last block that is on the main chain
- The accounts manager
  - We must undo the work we've done in processing notes and spends for the blocks that are no longer on the main chain

The example client checks for reorgs as blocks are processed by the `BlockProcessor`. As new blocks come in, the [`_checkForReorg()`](./src/Client/utils/BlockProcessor.ts#174) function compares the incoming block's `previousBlockHash` to the hash of the last block we've processed. If they don't match, it means we're on a fork, and we must handle the reorg.

To handle a reorg, we must first determine which is the last block that we've processed that is on the main chain. To do this, we request blocks from the server one by one in reverse order, starting from the last block we've processed.

As we get blocks back from the server, we compare its block hash with the block hash of the corresponding cached block. If the hashes match, it means we've found the last block that is on the main chain.

Once we have the most recent block that is on the main chain, we can roll back the block cache, merkle tree, and accounts manager. This is done by the following functions:

- `AccountsManager.handleReorg()`
- `BlockCache.handleReorg()`
- Merkle tree: `revertToNoteSize`
