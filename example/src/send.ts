import { Client } from "./Client/Client";
import { generateKeyFromPrivateKey } from "@ironfish/rust-nodejs";

export async function send(
  argMap: { [key: string]: string },
  spendingKey: string,
  client: Client,
) {
  const { assetId, toPublicAddress, amount, memo = "", fee = 1 } = argMap;

  console.log(`Asset ID: ${assetId}`);
  console.log(`To Public Address: ${toPublicAddress}`);
  console.log(`Amount: ${amount}`);
  console.log(`Memo: ${memo}`);
  console.log(`Fee: ${fee}`);

  const key = generateKeyFromPrivateKey(spendingKey);
  const account = await client.getAccount(key.publicAddress);
  if (!account) {
    throw new Error(`Account not found for intput spending key`);
  }
  const transaction = await client.createTransaction(
    account,
    { publicAddress: toPublicAddress },
    BigInt(amount),
    Buffer.from(assetId, "hex"),
    BigInt(fee),
    memo,
  );
  const posted = transaction.post(account.key.publicAddress, BigInt(fee));

  console.log("Posted transaction:");
  console.log(posted.toString("hex"));

  const [error, result] = await client.sendTransaction(posted);
  if (error) {
    console.error(error);
  }
  console.log(`Sent transaction, result: ${JSON.stringify(result)}`);
}
