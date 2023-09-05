import { NoteHasher } from "@ironfish/sdk/build/src/merkletree/hasher";
import { MerkleTree } from "@ironfish/sdk/build/src/merkletree/merkletree";
import { BUFFER_ENCODING } from "@ironfish/sdk/build/src/storage";
import { createDB } from "@ironfish/sdk/build/src/storage/utils";
import { LeafEncoding } from "@ironfish/sdk/build/src/merkletree/database/leaves";
import { NodeEncoding } from "@ironfish/sdk/build/src/merkletree/database/nodes";
import { NoteEncrypted } from "@ironfish/sdk/build/src/primitives/noteEncrypted";

const db = createDB({ location: "./testdb" });
db.open();

const notesTree = new MerkleTree({
  hasher: new NoteHasher(),
  leafIndexKeyEncoding: BUFFER_ENCODING,
  leafEncoding: new LeafEncoding(),
  nodeEncoding: new NodeEncoding(),
  db,
  name: "n",
  depth: 32,
  defaultValue: Buffer.alloc(32),
});

export const addNotesToMerkleTree = async (notes: Buffer[]) => {
  const encryptedNotes = notes.map((note) => new NoteEncrypted(note));
  return notesTree.addBatch(encryptedNotes);
};

export const revertToNoteSize = async (noteSize: number) => {
  await notesTree.truncate(noteSize);
};
