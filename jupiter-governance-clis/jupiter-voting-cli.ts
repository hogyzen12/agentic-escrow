import { PublicKey, Connection, Keypair } from '@solana/web3.js';
import * as anchor from "@project-serum/anchor";
import { Buffer } from 'buffer';
import fs from 'fs';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

class JupiterVotingCLI {
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
    this.connection = new Connection(JupiterVotingCLI.RPC_URL, "confirmed");
    
    // Load wallet
    const keypairData = new Uint8Array(JSON.parse(fs.readFileSync(walletPath, 'utf-8')));
    this.wallet = Keypair.fromSecretKey(keypairData);
    
    // Setup provider
    this.provider = new anchor.AnchorProvider(
      this.connection,
      new anchor.Wallet(this.wallet),
      { 
        commitment: "confirmed",
        preflightCommitment: "confirmed",
        skipPreflight: false,
      }
    );

    // Load IDLs
    const voterIdl = JSON.parse(fs.readFileSync('idl.json', 'utf-8'));
    const governanceIdl = JSON.parse(fs.readFileSync('idl_gov.json', 'utf-8'));
    
    this.program = new anchor.Program(voterIdl, JupiterVotingCLI.LOCKED_VOTER_PROGRAM_ID, this.provider);
    this.governanceProgram = new anchor.Program(governanceIdl, JupiterVotingCLI.GOVERNANCE_PROGRAM_ID, this.provider);
  }

  async findLockerAddress(): Promise<[PublicKey, number]> {
    return PublicKey.findProgramAddress(
      [
        Buffer.from("Locker"),
        JupiterVotingCLI.BASE_KEY.toBuffer()
      ],
      JupiterVotingCLI.LOCKED_VOTER_PROGRAM_ID
    );
  }

  async findEscrowAddress(locker: PublicKey, owner: PublicKey): Promise<[PublicKey, number]> {
    return PublicKey.findProgramAddress(
      [
        Buffer.from("Escrow"),
        locker.toBuffer(),
        owner.toBuffer()
      ],
      JupiterVotingCLI.LOCKED_VOTER_PROGRAM_ID
    );
  }

  async findVoteAddress(proposal: PublicKey, voter: PublicKey): Promise<[PublicKey, number]> {
    return PublicKey.findProgramAddress(
      [
        Buffer.from("Vote"),
        proposal.toBuffer(),
        voter.toBuffer()
      ],
      JupiterVotingCLI.GOVERNANCE_PROGRAM_ID
    );
  }

  async vote(proposalAddress: string, side: 'yes' | 'no') {
    try {
      const proposal = new PublicKey(proposalAddress);
      const [lockerKey] = await this.findLockerAddress();
      const [escrowKey] = await this.findEscrowAddress(lockerKey, this.wallet.publicKey);
      const [voteKey] = await this.findVoteAddress(proposal, this.wallet.publicKey);
      
      // Add compute budget instructions
      const modifyComputeUnits = anchor.web3.ComputeBudgetProgram.setComputeUnitLimit({
        units: 150000
      });

      const addPriorityFee = anchor.web3.ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: 333333
      });

      console.log("\nCreating vote account...");
      
      // First create the vote account via governance program
      const newVoteTx = await this.governanceProgram.methods
        .newVote(this.wallet.publicKey)
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

      // Now cast the vote
      console.log("\nCasting vote...");
      // Side is 1 for against, 2 for for in the governance program
      const voteSide = side === 'yes' ? 2 : 1;

      const castVoteTx = await this.program.methods
        .castVote(voteSide)
        .accounts({
          locker: lockerKey,
          escrow: escrowKey,
          voteDelegate: this.wallet.publicKey,
          proposal: proposal,
          vote: voteKey,
          governor: JupiterVotingCLI.GOVERNOR,
          governProgram: JupiterVotingCLI.GOVERNANCE_PROGRAM_ID,
        })
        .preInstructions([modifyComputeUnits, addPriorityFee])
        .rpc();

      console.log("Vote cast successfully!");
      console.log("Transaction signature:", castVoteTx);
      
      return {
        voteAccount: voteKey.toString(),
        createVoteTx: newVoteTx,
        castVoteTx
      };

    } catch (error) {
      console.error("Error casting vote:", error);
      throw error;
    }
  }
}

async function main() {
  const parser = yargs(hideBin(process.argv))
    .command('vote', 'Cast a vote on a proposal', (yargs) => {
      return yargs
        .option('proposal', {
          alias: 'p',
          type: 'string',
          description: 'Proposal address to vote on',
          required: true
        })
        .option('side', {
          alias: 's',
          type: 'string',
          choices: ['yes', 'no'],
          description: 'Vote yes or no on the proposal',
          required: true
        });
    })
    .demandCommand(1, 'You must specify a command: vote')
    .option('wallet', {
      alias: 'w',
      type: 'string',
      description: 'Path to wallet keypair file',
      required: true
    });

  const argv = await parser.argv;
  const command = argv._[0] as string;
  const walletPath = argv.wallet as string;

  const cli = new JupiterVotingCLI(walletPath);

  try {
    switch (command) {
      case 'vote': {
        const proposal = argv.proposal as string;
        const side = argv.side as 'yes' | 'no';
        
        console.log(`\nVoting ${side} on proposal: ${proposal}`);
        await cli.vote(proposal, side);
        break;
      }

      default:
        console.error('Unknown command:', command);
        process.exit(1);
    }
  } catch (err) {
    if (err instanceof Error) {
      console.error("\nError:", err.message);
    } else {
      console.error("\nUnexpected error:", err);
    }
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch((err) => {
    if (err instanceof Error) {
      console.error("\nError:", err.message);
    } else {
      console.error("\nUnexpected error:", err);
    }
    process.exit(1);
  });
}