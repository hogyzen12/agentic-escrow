// src/utils/escrow.ts
import { PublicKey, Connection } from '@solana/web3.js';
import * as BufferLayout from '@solana/buffer-layout';
import BN from 'bn.js';
import { ESCROW_PROGRAM_ID } from './constants';

// Layout for a public key
const publicKey = (property = "publicKey") => {
  return BufferLayout.blob(32, property);
};

// Layout for a 64bit unsigned value
const uint64 = (property = "uint64") => {
  return BufferLayout.blob(8, property);
};

export const ESCROW_ACCOUNT_DATA_LAYOUT = BufferLayout.struct<any>([
  BufferLayout.u8("isInitialized"),
  publicKey("initializerPubkey"),
  publicKey("initializerTempTokenAccountPubkey"),
  publicKey("initializerReceivingTokenAccountPubkey"),
  uint64("expectedAmount"),
]);


export interface EscrowLayout {
  isInitialized: number;
  initializerPubkey: Uint8Array;
  initializerTempTokenAccountPubkey: Uint8Array;
  initializerReceivingTokenAccountPubkey: Uint8Array;
  expectedAmount: Uint8Array;
}

export interface Escrow {
  pubkey: string;
  isInitialized: boolean;
  initializer: string;
  tempTokenAccount: string;
  receivingTokenAccount: string;
  expectedAmount: number;
  bobExpectedAmount: number;
}

// Get the escrow account from the saved public key
export async function getEscrowAccount(connection: Connection): Promise<Escrow | null> {
  try {
    // Get the escrow public key from the json file
    const escrowPubkey = new PublicKey("4u91rieF77UwVnQjP7WK3K8ZpDP7kvMnXscC7KYvHnw5");
    
    const account = await connection.getAccountInfo(escrowPubkey);
    if (!account) {
      console.log('No escrow account found');
      return null;
    }

    console.log('Found escrow account:', escrowPubkey.toString());

    const decoded = ESCROW_ACCOUNT_DATA_LAYOUT.decode(account.data) as EscrowLayout;

    // This matches bob.ts expectations
    const expectedAmount = new BN(decoded.expectedAmount, 'le').toNumber();
    const bobExpectedAmount = 5; // From terms.json

    return {
      pubkey: escrowPubkey.toString(),
      isInitialized: !!decoded.isInitialized,
      initializer: new PublicKey(decoded.initializerPubkey).toString(),
      tempTokenAccount: new PublicKey(decoded.initializerTempTokenAccountPubkey).toString(),
      receivingTokenAccount: new PublicKey(decoded.initializerReceivingTokenAccountPubkey).toString(),
      expectedAmount: expectedAmount,
      bobExpectedAmount: bobExpectedAmount
    };
  } catch (error) {
    console.error('Error fetching escrow account:', error);
    return null;
  }
}