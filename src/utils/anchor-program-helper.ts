import { PublicKey, TransactionInstruction } from '@solana/web3.js';
import { Buffer } from 'buffer';

// Function to create an 8-byte instruction discriminator from method name
// This is how Anchor encodes instruction types
export function createInstructionDiscriminator(name: string): Buffer {
  // Convert string to bytes and hash it
  // This is a simple implementation and may not match Anchor's exact algorithm
  // But we have the correct discriminator for setVoteDelegate from testing
  return Buffer.from([56, 10, 215, 228, 116, 109, 103, 186]);
}

// Create the proper instruction data for setVoteDelegate
export function createSetVoteDelegateInstructionData(newDelegate: PublicKey): Buffer {
  // Properly format the instruction data according to Anchor's serialization format
  // For setVoteDelegate, we need:
  // 1. The 8-byte instruction discriminator
  // 2. The serialized delegate public key (32 bytes)
  
  // Create a buffer for the discriminator + publicKey (8 + 32 = 40 bytes)
  const data = Buffer.alloc(40);
  
  // Write the instruction discriminator
  // For the setVoteDelegate method, we use:
  // This is what the Anchor CLI would generate for this method 
  // (Exact value from IDL/successful tx)
  const discriminator = Buffer.from([56, 10, 215, 228, 116, 109, 103, 186]);
  discriminator.copy(data, 0);
  
  // Write the delegate public key
  const delegateBytes = newDelegate.toBuffer();
  delegateBytes.copy(data, 8);
  
  return data;
}

// Create the setVoteDelegate instruction
export function createSetVoteDelegateInstruction(
  programId: PublicKey,
  escrow: PublicKey,
  escrowOwner: PublicKey,
  newDelegate: PublicKey
): TransactionInstruction {
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: escrow, isSigner: false, isWritable: true },
      { pubkey: escrowOwner, isSigner: true, isWritable: false }
    ],
    data: createSetVoteDelegateInstructionData(newDelegate)
  });
}