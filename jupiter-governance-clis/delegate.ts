#!/usr/bin/env ts-node

import { PublicKey, Connection, Keypair } from '@solana/web3.js';
import * as anchor from "@project-serum/anchor";
import { Buffer } from 'buffer';
import fs from 'fs';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

class DelegationCLI {
  // Update these constants if needed
  static LOCKED_VOTER_PROGRAM_ID = new PublicKey("voTpe3tHQ7AjQHMapgSue2HJFAh2cGsdokqN3XqmVSj");
  static BASE_KEY = new PublicKey("bJ1TRoFo2P6UHVwqdiipp6Qhp2HaaHpLowZ5LHet8Gm");
  static RPC_URL = "https://delicate-side-reel.solana-mainnet.quiknode.pro/b5bdab46540fe358dd8cd93ec94c0a480bd11369/";

  connection: Connection;
  program: anchor.Program;
  wallet: Keypair;
  provider: anchor.AnchorProvider;

  constructor(walletPath: string) {
    this.connection = new Connection(DelegationCLI.RPC_URL, "confirmed");

    // Load the wallet keypair from file
    const keypairData = new Uint8Array(JSON.parse(fs.readFileSync(walletPath, 'utf-8')));
    this.wallet = Keypair.fromSecretKey(keypairData);

    this.provider = new anchor.AnchorProvider(
      this.connection,
      new anchor.Wallet(this.wallet),
      {
        commitment: "confirmed",
        preflightCommitment: "confirmed",
        skipPreflight: false,
      }
    );

    // Load the IDL file (make sure idl.json is in the same folder)
    const idlFile = JSON.parse(fs.readFileSync('idl.json', 'utf-8'));
    this.program = new anchor.Program(idlFile, DelegationCLI.LOCKED_VOTER_PROGRAM_ID, this.provider);
  }

  async findLockerAddress(): Promise<[PublicKey, number]> {
    return PublicKey.findProgramAddress(
      [
        Buffer.from("Locker"),
        DelegationCLI.BASE_KEY.toBuffer()
      ],
      DelegationCLI.LOCKED_VOTER_PROGRAM_ID
    );
  }

  async findEscrowAddress(locker: PublicKey, owner: PublicKey): Promise<[PublicKey, number]> {
    return PublicKey.findProgramAddress(
      [
        Buffer.from("Escrow"),
        locker.toBuffer(),
        owner.toBuffer()
      ],
      DelegationCLI.LOCKED_VOTER_PROGRAM_ID
    );
  }

  async delegateVote(newDelegate: PublicKey): Promise<string> {
    // Derive the locker and escrow addresses using your existing logic
    const [lockerKey] = await this.findLockerAddress();
    const [escrowKey] = await this.findEscrowAddress(lockerKey, this.wallet.publicKey);

    console.log("\nLocker Address:", lockerKey.toString());
    console.log("Escrow Address:", escrowKey.toString());
    console.log("Delegating vote to:", newDelegate.toString());

    // Optionally add compute budget instructions to ensure sufficient compute units
    const modifyComputeUnits = anchor.web3.ComputeBudgetProgram.setComputeUnitLimit({ units: 150000 });
    const addPriorityFee = anchor.web3.ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 333333 });

    // Call the setVoteDelegate instruction
    const txSignature = await this.program.methods
      .setVoteDelegate(newDelegate)
      .accounts({
        escrow: escrowKey,
        escrowOwner: this.wallet.publicKey,
      })
      .preInstructions([modifyComputeUnits, addPriorityFee])
      .rpc();

    console.log("Delegation transaction sent. Signature:", txSignature);
    return txSignature;
  }
}

async function main() {
  const parser = yargs(hideBin(process.argv))
    .command('delegate', 'Delegate your escrow vote to a new wallet', (yargs) => {
      return yargs.option('wallet', {
        alias: 'w',
        type: 'string',
        description: 'Path to your wallet keypair file',
        demandOption: true,
      }).option('delegate', {
        alias: 'd',
        type: 'string',
        description: 'New delegate public key',
        default: 'govAiNGS59yJfvqdmvYb7Lzk7wUHYygqiKR58Z1VCag',
      });
    }, async (argv) => {
      const walletPath = argv.wallet as string;
      const delegateKey = new PublicKey(argv.delegate as string);
      const cli = new DelegationCLI(walletPath);
      console.log("Starting delegation...");
      await cli.delegateVote(delegateKey);
    })
    .demandCommand(1, 'You must specify a command')
    .help()
    .argv;
}

if (require.main === module) {
  main().catch((err) => {
    console.error("Error:", err);
    process.exit(1);
  });
}
