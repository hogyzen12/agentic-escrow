#!/usr/bin/env ts-node

import { PublicKey, Connection, Keypair } from '@solana/web3.js';
import * as anchor from "@project-serum/anchor";
import { Buffer } from 'buffer';
import fs from 'fs';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

// Define the EscrowAccount interface based on the expected structure
interface EscrowAccount {
  locker: PublicKey;
  owner: PublicKey;
  bump: number;
  tokens: PublicKey;
  amount: anchor.BN;
  escrowStartedAt: anchor.BN;
  escrowEndsAt: anchor.BN;
  voteDelegate: PublicKey;
  isMaxLock: boolean;
  partialUnstakingAmount: anchor.BN;
  padding: anchor.BN;
  buffers: anchor.BN[];
}

class DelegatedVotingCLI {
  // Program IDs and constants
  static LOCKED_VOTER_PROGRAM_ID = new PublicKey("voTpe3tHQ7AjQHMapgSue2HJFAh2cGsdokqN3XqmVSj");
  static GOVERNANCE_PROGRAM_ID = new PublicKey("GovaE4iu227srtG2s3tZzB4RmWBzw8sTwrCLZz7kN7rY");
  static BASE_KEY = new PublicKey("bJ1TRoFo2P6UHVwqdiipp6Qhp2HaaHpLowZ5LHet8Gm");
  static GOVERNOR = new PublicKey("EZjEbaSd1KrTUKHNGhyHj42PxnoK742aGaNNqb9Rcpgu");
  static RPC_URL = "https://delicate-side-reel.solana-mainnet.quiknode.pro/b5bdab46540fe358dd8cd93ec94c0a480bd11369/";

  connection: Connection;
  program: anchor.Program;
  governanceProgram: anchor.Program;
  wallet: Keypair;
  provider: anchor.AnchorProvider;

  constructor(walletPath: string) {
    this.connection = new Connection(DelegatedVotingCLI.RPC_URL, "confirmed");

    // Load the delegate's wallet keypair
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

    // Load IDL files (ensure these paths match your project)
    const voterIdl = JSON.parse(fs.readFileSync('idl.json', 'utf-8'));
    const governanceIdl = JSON.parse(fs.readFileSync('idl_gov.json', 'utf-8'));

    this.program = new anchor.Program(voterIdl, DelegatedVotingCLI.LOCKED_VOTER_PROGRAM_ID, this.provider);
    this.governanceProgram = new anchor.Program(governanceIdl, DelegatedVotingCLI.GOVERNANCE_PROGRAM_ID, this.provider);
  }

  async findLockerAddress(): Promise<[PublicKey, number]> {
    return PublicKey.findProgramAddress(
      [
        Buffer.from("Locker"),
        DelegatedVotingCLI.BASE_KEY.toBuffer()
      ],
      DelegatedVotingCLI.LOCKED_VOTER_PROGRAM_ID
    );
  }

  async findEscrowAddress(locker: PublicKey, owner: PublicKey): Promise<[PublicKey, number]> {
    return PublicKey.findProgramAddress(
      [
        Buffer.from("Escrow"),
        locker.toBuffer(),
        owner.toBuffer()
      ],
      DelegatedVotingCLI.LOCKED_VOTER_PROGRAM_ID
    );
  }

  async findVoteAddress(proposal: PublicKey, voter: PublicKey): Promise<[PublicKey, number]> {
    return PublicKey.findProgramAddress(
      [
        Buffer.from("Vote"),
        proposal.toBuffer(),
        voter.toBuffer()
      ],
      DelegatedVotingCLI.GOVERNANCE_PROGRAM_ID
    );
  }

  async vote(owner: string, proposalAddress: string, side: 'yes' | 'no') {
    try {
      // Parse inputs
      const ownerKey = new PublicKey(owner);
      const proposal = new PublicKey(proposalAddress);
      const [lockerKey] = await this.findLockerAddress();
      const [escrowKey] = await this.findEscrowAddress(lockerKey, ownerKey);
      const [voteKey] = await this.findVoteAddress(proposal, ownerKey);

      // Fetch escrow with type assertion to fix TS2352
      const escrow = await this.program.account.escrow.fetch(escrowKey) as any as EscrowAccount;

      // Verify that this wallet is the vote delegate
      if (!escrow.voteDelegate.equals(this.wallet.publicKey)) {
        throw new Error(`Wallet ${this.wallet.publicKey.toString()} is not the vote delegate for escrow owned by ${owner}`);
      }

      // Add compute budget instructions for transaction reliability
      const modifyComputeUnits = anchor.web3.ComputeBudgetProgram.setComputeUnitLimit({ units: 150000 });
      const addPriorityFee = anchor.web3.ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 333333 });

      console.log("\nCreating vote account...");

      // Step 1: Create the vote account via the governance program
      const newVoteTx = await this.governanceProgram.methods
        .newVote(ownerKey)
        .accounts({
          proposal: proposal,
          vote: voteKey,
          payer: this.wallet.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .preInstructions([modifyComputeUnits, addPriorityFee])
        .rpc();

      console.log("Vote account created:", newVoteTx);
      console.log("Vote Account:", voteKey.toString());

      // Step 2: Cast the vote as the delegate
      console.log("\nCasting delegated vote...");
      // Jupiter Governance: 1 = "no" (against), 2 = "yes" (for)
      const voteSide = side === 'yes' ? 2 : 1;

      const castVoteTx = await this.program.methods
        .castVote(voteSide)
        .accounts({
          locker: lockerKey,
          escrow: escrowKey,
          voteDelegate: this.wallet.publicKey,
          proposal: proposal,
          vote: voteKey,
          governor: DelegatedVotingCLI.GOVERNOR,
          governProgram: DelegatedVotingCLI.GOVERNANCE_PROGRAM_ID,
        })
        .preInstructions([modifyComputeUnits, addPriorityFee])
        .rpc();

      console.log("Delegated vote cast successfully!");
      console.log("Transaction signature:", castVoteTx);

      return {
        voteAccount: voteKey.toString(),
        createVoteTx: newVoteTx,
        castVoteTx,
      };
    } catch (error) {
      console.error("Error casting delegated vote:", error);
      throw error;
    }
  }
}

async function main() {
  const parser = yargs(hideBin(process.argv))
    .command('vote-delegated', 'Cast a vote on behalf of an escrow owner as their delegate', (yargs) => {
      return yargs
        .option('wallet', {
          alias: 'w',
          type: 'string',
          description: 'Path to the delegate wallet keypair file',
          demandOption: true,
        })
        .option('owner', {
          alias: 'o',
          type: 'string',
          description: 'Public key of the escrow owner',
          demandOption: true,
        })
        .option('proposal', {
          alias: 'p',
          type: 'string',
          description: 'Proposal address to vote on',
          demandOption: true,
        })
        .option('side', {
          alias: 's',
          type: 'string',
          choices: ['yes', 'no'],
          description: 'Vote yes or no on the proposal',
          demandOption: true,
        });
    })
    .demandCommand(1, 'You must specify the command: vote-delegated')
    .help();

  // Fix TS2339 by using parser.parse() instead of parser.argv
  const argv = await parser.parse();
  const walletPath = argv.wallet as string;
  const owner = argv.owner as string;
  const proposal = argv.proposal as string;
  const side = argv.side as 'yes' | 'no';

  const cli = new DelegatedVotingCLI(walletPath);

  console.log(`\nVoting ${side} on proposal ${proposal} as delegate for owner ${owner}`);
  await cli.vote(owner, proposal, side);
}

if (require.main === module) {
  main().catch((err) => {
    console.error("Error:", err);
    process.exit(1);
  });
}