#!/usr/bin/env ts-node

import { Connection, PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddress } from '@solana/spl-token';
import fs from 'fs';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { BorshInstructionCoder, Idl } from '@project-serum/anchor';
import * as bs58 from 'bs58'; // Import bs58 for base58 decoding

// Constants
const RPC_URL = "https://delicate-side-reel.solana-mainnet.quiknode.pro/b5bdab46540fe358dd8cd93ec94c0a480bd11369/";
const MARKER_ADDRESS = new PublicKey("D1GtsVdat3oLR7E9nEWmKKnEwzvBfNah4pUDhDmgQYMw");
const GOV_AI_PUBKEY = new PublicKey("govAiNGS59yJfvqdmvYb7Lzk7wUHYygqiKR58Z1VCag");
const LOCKED_VOTER_PROGRAM_ID = new PublicKey("voTpe3tHQ7AjQHMapgSue2HJFAh2cGsdokqN3XqmVSj");
const JUP_MINT = new PublicKey("JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN");
const BASE_KEY = new PublicKey("bJ1TRoFo2P6UHVwqdiipp6Qhp2HaaHpLowZ5LHet8Gm");
const UNTIL_SIGNATURE = "27objd9nHkNkFAcBmCiGR7b7jJPeMUzxie7miDtE5BoFxFv23QBCLafumHkxGsZwsszDHbMhoSaUMMBwK82woGqR";

// Load IDL
const idl: Idl = JSON.parse(fs.readFileSync('./idl.json', 'utf-8'));
const instructionCoder = new BorshInstructionCoder(idl);

// Define the structure for richer delegator data
interface DelegatorData {
  wallet: string;         // Delegator’s wallet address
  stakedAmount: number;   // Amount staked in JUP
  timestamp: number;      // Unix timestamp of the transaction
  transaction: string;    // Transaction signature
  escrow: string;         // Escrow account address
  ata: string;            // Associated token account address
}

class GetDelegatedStakeCLI {
  connection: Connection;

  constructor() {
    this.connection = new Connection(RPC_URL, "confirmed");
  }

  async fetchTransactionSignatures(): Promise<string[]> {
    console.log("Fetching transaction signatures for marker address:", MARKER_ADDRESS.toString());
    const signatures = await this.connection.getSignaturesForAddress(MARKER_ADDRESS, {
      until: UNTIL_SIGNATURE,
      limit: 1000,
    });
    return signatures.map((sig) => sig.signature);
  }

  async fetchTransactionDetails(signature: string): Promise<any> {
    console.log(`\nProcessing transaction: ${signature}`);
    const tx = await this.connection.getParsedTransaction(signature, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });
    return tx;
  }

  async findEscrowAddress(owner: PublicKey): Promise<PublicKey> {
    const [lockerAddress] = await PublicKey.findProgramAddress(
      [Buffer.from("Locker"), BASE_KEY.toBuffer()],
      LOCKED_VOTER_PROGRAM_ID
    );
    const [escrowAddress] = await PublicKey.findProgramAddress(
      [Buffer.from("Escrow"), lockerAddress.toBuffer(), owner.toBuffer()],
      LOCKED_VOTER_PROGRAM_ID
    );
    console.log(`Derived escrow address for owner ${owner.toString()}: ${escrowAddress.toString()}`);
    return escrowAddress;
  }

  async getStakedAmount(escrowAddress: PublicKey): Promise<number> {
    try {
      const escrowATA = await getAssociatedTokenAddress(JUP_MINT, escrowAddress, true);
      console.log(`Fetching balance for ATA: ${escrowATA.toString()}`);
      const tokenAccountInfo = await this.connection.getTokenAccountBalance(escrowATA);
      const amount = tokenAccountInfo.value.uiAmount || 0;
      console.log(`Staked amount: ${amount} JUP`);
      return amount;
    } catch (error) {
      console.error(`Error fetching ATA balance:`, error);
      return 0;
    }
  }

  async processTransactions(signatures: string[]): Promise<any> {
    const delegatorMap = new Map<string, DelegatorData>(); // Use Map to handle duplicates

    for (const signature of signatures) {
      const tx = await this.fetchTransactionDetails(signature);
      if (!tx || !tx.transaction || !tx.transaction.message || !tx.blockTime) {
        console.log(`Skipping transaction ${signature}: No valid transaction data or timestamp`);
        continue;
      }

      let hasMarkerTransfer = false;
      let delegatorWallet: PublicKey | null = null;
      let escrowAddress: PublicKey | null = null;

      const instructions: any[] = tx.transaction.message.instructions;

      for (const ix of instructions) {
        // Check for marker transfer
        if ('parsed' in ix && ix.parsed && ix.parsed.type === "transfer") {
          const transferInfo = ix.parsed.info;
          if (
            transferInfo.destination === MARKER_ADDRESS.toString() //&&
            //transferInfo.lamports === 42000000
          ) {
            hasMarkerTransfer = true;
            delegatorWallet = new PublicKey(transferInfo.source);
            console.log(`Found marker transfer from: ${delegatorWallet.toString()}`);
          }
        }

        // Decode Locked Voter instructions
        if (ix.programId && ix.programId.equals(LOCKED_VOTER_PROGRAM_ID)) {
          console.log("Found Locked Voter instruction");
          console.log("Instruction data (base58):", ix.data); // Log raw base58 data

          // Decode base58-encoded instruction data
          let data: Buffer;
          try {
            data = Buffer.from(bs58.decode(ix.data));
            console.log("Instruction data (hex):", data.toString('hex')); // Log decoded bytes in hex
          } catch (error) {
            console.error("Error decoding base58 data:", error);
            continue;
          }

          // Attempt to decode the instruction
          try {
            const decodedIx = instructionCoder.decode(data);
            if (decodedIx) {
              console.log(`Decoded instruction: ${decodedIx.name}`);
              if (decodedIx.name === "setVoteDelegate") {
                const newDelegateBytes = (decodedIx.data as { newDelegate: Buffer }).newDelegate;
                if (!newDelegateBytes) {
                  console.log("Missing newDelegate in decoded data");
                  continue;
                }
                const newDelegate = new PublicKey(newDelegateBytes);
                console.log(`Decoded newDelegate: ${newDelegate.toString()}`);
                if (newDelegate.equals(GOV_AI_PUBKEY)) {
                  console.log("Delegation confirmed to GovAI");
                  escrowAddress = new PublicKey(ix.accounts[0]); // Escrow account
                  delegatorWallet = new PublicKey(ix.accounts[1]); // Escrow owner
                  console.log(`Escrow: ${escrowAddress.toString()}, Delegator: ${delegatorWallet.toString()}`);
                }
              }
            } else {
              console.log("Failed to decode instruction: decodedIx is null");
            }
          } catch (error) {
            console.error("Error decoding instruction with BorshInstructionCoder:", error);
          }
        }
      }

      if (hasMarkerTransfer && escrowAddress && delegatorWallet) {
        const stakedAmount = await this.getStakedAmount(escrowAddress);
        const timestamp = tx.blockTime; // Unix timestamp from the transaction
        const ata = await getAssociatedTokenAddress(JUP_MINT, escrowAddress, true);
        const delegatorKey = delegatorWallet.toString();

        // Only add or update if this is the most recent delegation
        const existingDelegator = delegatorMap.get(delegatorKey);
        if (!existingDelegator || existingDelegator.timestamp < timestamp) {
          delegatorMap.set(delegatorKey, {
            wallet: delegatorKey,
            stakedAmount,
            timestamp,
            transaction: signature,
            escrow: escrowAddress.toString(),
            ata: ata.toString(),
          });
          console.log(`Added/Updated delegator: ${delegatorKey} with ${stakedAmount} JUP at timestamp ${timestamp}`);
        } else {
          console.log(`Skipped older delegation for ${delegatorKey} (existing timestamp: ${existingDelegator.timestamp}, new: ${timestamp})`);
        }
      }
    }

    // Convert map to array and calculate total
    const delegators = Array.from(delegatorMap.values());
    const totalStakedAmount = delegators.reduce((sum, d) => sum + d.stakedAmount, 0);

    return {
      delegators,
      totalStakedAmount: Number(totalStakedAmount.toFixed(6)), // Round to 6 decimals
      lastUpdated: new Date().toISOString(),
    };
  }

  async run() {
    try {
      const signatures = await this.fetchTransactionSignatures();
      console.log("Found", signatures.length, "transactions to process.");
      const result = await this.processTransactions(signatures);

      const outputFile = 'delegated_stake.json';
      fs.writeFileSync(outputFile, JSON.stringify(result, null, 2));
      console.log("Results saved to", outputFile);
    } catch (error) {
      console.error("Error running CLI:", error);
      process.exit(1);
    }
  }
}

async function main() {
  const parser = yargs(hideBin(process.argv))
    .command('fetch', 'Fetch delegated stake details', {}, async () => {
      const cli = new GetDelegatedStakeCLI();
      await cli.run();
    })
    .demandCommand(1, 'You must specify the "fetch" command')
    .help()
    .argv;

  await parser;
}

if (require.main === module) {
  main().catch((err) => {
    console.error("Error:", err);
    process.exit(1);
  });
}