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
