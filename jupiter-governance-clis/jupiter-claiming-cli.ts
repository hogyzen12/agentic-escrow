import { PublicKey, Connection, Keypair } from '@solana/web3.js';
import * as anchor from "@project-serum/anchor";
import { Buffer } from 'buffer';
import fs from 'fs';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import bs58 from 'bs58';
import { getAssociatedTokenAddress, createAssociatedTokenAccountIdempotentInstruction } from '@solana/spl-token';

interface ClaimProof {
  mint: string;
  merkle_tree: string;
  amount: number;
  locked_amount?: number;
  proof: number[][];
}

interface ClaimResponse {
  claim: ClaimProof[];
  voteCount: string;
  voteCountExtra: string;
}

class JupiterClaimingCLI {
  // Program IDs and constants
  static MERKLE_DISTRIBUTOR_PROGRAM_ID = new PublicKey("DiSLRwcSFvtwvMWSs7ubBMvYRaYNYupa76ZSuYLe6D7j");
  static LOCKED_JUP_DISTRIBUTOR_PROGRAM_ID = new PublicKey("Dis2TfkFnXFkrtvAktEkw37sdb7qwJgY6H7YZJwk51wK");
  static LOCKED_VOTER_PROGRAM_ID = new PublicKey("voTpe3tHQ7AjQHMapgSue2HJFAh2cGsdokqN3XqmVSj");
  static BASE_KEY = new PublicKey("bJ1TRoFo2P6UHVwqdiipp6Qhp2HaaHpLowZ5LHet8Gm");
  
  // Token mints
  static DBR_MINT = new PublicKey("DBRiDgJAMsM95moTzJs7M9LnkGErpbv9v6CUR1DXnUu5");
  static JUP_MINT = new PublicKey("JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN");
  
  // API config
  static RPC_URL = "https://api.mainnet-beta.solana.com";
  static CLAIM_API = "https://worker.jup.ag/asr-claim-proof";
  static TIMELINE = "jan-2025";

  connection: Connection;
  dbrProgram: anchor.Program;
  jupProgram: anchor.Program;
  wallet: Keypair;
  provider: anchor.AnchorProvider;

  constructor(walletPath: string) {
    this.connection = new Connection(JupiterClaimingCLI.RPC_URL, "confirmed");
    
    const keypairString = fs.readFileSync(walletPath, 'utf-8').trim();
    const decodedKey = bs58.decode(keypairString);
    this.wallet = Keypair.fromSecretKey(decodedKey);
    
    this.provider = new anchor.AnchorProvider(
      this.connection,
      new anchor.Wallet(this.wallet),
      { 
        commitment: "confirmed",
        preflightCommitment: "confirmed",
        skipPreflight: false,
      }
    );

    const idlFile = JSON.parse(fs.readFileSync('idl_claim.json', 'utf-8'));
    this.dbrProgram = new anchor.Program(idlFile, JupiterClaimingCLI.MERKLE_DISTRIBUTOR_PROGRAM_ID, this.provider);
    this.jupProgram = new anchor.Program(idlFile, JupiterClaimingCLI.LOCKED_JUP_DISTRIBUTOR_PROGRAM_ID, this.provider);
  }

  async findLockerAddress(): Promise<[PublicKey, number]> {
    return PublicKey.findProgramAddress(
      [
        Buffer.from("Locker"),
        JupiterClaimingCLI.BASE_KEY.toBuffer()
      ],
      JupiterClaimingCLI.LOCKED_VOTER_PROGRAM_ID
    );
  }

  async findEscrowAddress(locker: PublicKey, owner: PublicKey): Promise<[PublicKey, number]> {
    return PublicKey.findProgramAddress(
      [
        Buffer.from("Escrow"),
        locker.toBuffer(),
        owner.toBuffer()
      ],
      JupiterClaimingCLI.LOCKED_VOTER_PROGRAM_ID
    );
  }

  async findClaimStatusAddress(distributor: PublicKey, claimant: PublicKey): Promise<[PublicKey, number]> {
    return PublicKey.findProgramAddress(
      [
        Buffer.from("ClaimStatus"),
        claimant.toBuffer(),
        distributor.toBuffer()
      ],
      JupiterClaimingCLI.MERKLE_DISTRIBUTOR_PROGRAM_ID
    );
  }

  async getClaimData(mint: PublicKey = JupiterClaimingCLI.DBR_MINT): Promise<ClaimProof[]> {
    try {
      const url = `${JupiterClaimingCLI.CLAIM_API}/${this.wallet.publicKey.toString()}?asrTimeline=${JupiterClaimingCLI.TIMELINE}&mints=${mint.toString()}`;
      console.log("Fetching from:", url);
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`API request failed: ${response.statusText}`);
      }
      
      const data = await response.json() as ClaimResponse;
      return data.claim || [];
    } catch (error) {
      console.error("Error fetching claim data:", error);
      throw error;
    }
  }

  async claimDBR() {
    try {
      console.log("\nFetching DBR claim data...");
      const claims = await this.getClaimData();

      if (claims.length === 0) {
        console.log("No DBR claims available.");
        return;
      }

      const claim = claims[0];
      console.log(`Found DBR claim for ${claim.amount / 1e6} tokens`);

      const distributorKey = new PublicKey(claim.merkle_tree);
      const [claimStatusKey] = await this.findClaimStatusAddress(
        distributorKey,
        this.wallet.publicKey
      );

      const userATA = await getAssociatedTokenAddress(
        JupiterClaimingCLI.DBR_MINT,
        this.wallet.publicKey
      );

      const distributorATA = await getAssociatedTokenAddress(
        JupiterClaimingCLI.DBR_MINT,
        distributorKey,
        true
      );

      console.log("\nAccounts:");
      console.log("Distributor:", distributorKey.toString());
      console.log("Distributor ATA:", distributorATA.toString());
      console.log("Claim Status:", claimStatusKey.toString());
      console.log("User ATA:", userATA.toString());

      const ataIx = createAssociatedTokenAccountIdempotentInstruction(
        this.wallet.publicKey,
        userATA,
        this.wallet.publicKey,
        JupiterClaimingCLI.DBR_MINT
      );

      const modifyComputeUnits = anchor.web3.ComputeBudgetProgram.setComputeUnitLimit({
        units: 150000
      });

      const addPriorityFee = anchor.web3.ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: 333333
      });

      const claimIx = await this.dbrProgram.methods
        .newClaim(
          new anchor.BN(claim.amount),
          new anchor.BN(claim.locked_amount || 0),
          claim.proof.map(p => new Uint8Array(p))
        )
        .accounts({
          distributor: distributorKey,
          claimStatus: claimStatusKey,
          from: distributorATA,
          to: userATA,
          claimant: this.wallet.publicKey,
          tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .instruction();

      const tx = new anchor.web3.Transaction()
        .add(modifyComputeUnits)
        .add(addPriorityFee)
        .add(ataIx)
        .add(claimIx);

      const signature = await this.provider.sendAndConfirm(tx);
      console.log("\nDBR Claim successful!");
      console.log("Transaction signature:", signature);

      return signature;

    } catch (error) {
      console.error("Error claiming DBR:", error);
      throw error;
    }
  }

  async claimJUP() {
    try {
      console.log("\nFetching JUP claim data...");
      const claims = await this.getClaimData(JupiterClaimingCLI.JUP_MINT);
  
      if (claims.length === 0) {
        console.log("No JUP claims available.");
        return;
      }
  
      const claim = claims[0];
      console.log(`Found JUP claim for ${claim.amount / 1e6} tokens`);
  
      const distributorKey = new PublicKey(claim.merkle_tree);
      const [lockerKey] = await this.findLockerAddress();
      const [escrowKey] = await this.findEscrowAddress(lockerKey, this.wallet.publicKey);
      const [claimStatusKey] = await PublicKey.findProgramAddress(
        [Buffer.from("ClaimStatus"),this.wallet.publicKey.toBuffer(),
        distributorKey.toBuffer()],
        JupiterClaimingCLI.LOCKED_JUP_DISTRIBUTOR_PROGRAM_ID
      );
  
      // Get all required token accounts
      const escrowATA = await getAssociatedTokenAddress(
        JupiterClaimingCLI.JUP_MINT,
        escrowKey,
        true
      );
  
      const distributorATA = await getAssociatedTokenAddress(
        JupiterClaimingCLI.JUP_MINT,
        distributorKey,
        true
      );
  
      const userATA = await getAssociatedTokenAddress(
        JupiterClaimingCLI.JUP_MINT,
        this.wallet.publicKey
      );
  
      console.log("\nAccounts:");
      console.log("Distributor:", distributorKey.toString());
      console.log("Distributor ATA:", distributorATA.toString());
      console.log("Claim Status:", claimStatusKey.toString());
      console.log("Locker:", lockerKey.toString());
      console.log("Escrow:", escrowKey.toString());
      console.log("Escrow ATA:", escrowATA.toString());
      console.log("User ATA:", userATA.toString());
  
      const createATAIx = createAssociatedTokenAccountIdempotentInstruction(
        this.wallet.publicKey,
        escrowATA,
        escrowKey,
        JupiterClaimingCLI.JUP_MINT
      );
  
      const createUserATAIx = createAssociatedTokenAccountIdempotentInstruction(
        this.wallet.publicKey,
        userATA,
        this.wallet.publicKey,
        JupiterClaimingCLI.JUP_MINT
      );
  
      const modifyComputeUnits = anchor.web3.ComputeBudgetProgram.setComputeUnitLimit({
        units: 150000
      });
  
      const addPriorityFee = anchor.web3.ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: 333333
      });
  
      // Create instruction with all required accounts in the correct order
      // Matching the successful transaction structure
      const remainingAccounts = [
        {
          pubkey: JupiterClaimingCLI.LOCKED_VOTER_PROGRAM_ID,
          isWritable: false,
          isSigner: false
        },
        {
          pubkey: lockerKey,
          isWritable: true,
          isSigner: false
        },
        {
          pubkey: escrowKey,
          isWritable: true,
          isSigner: false
        },
        {
          pubkey: escrowATA,
          isWritable: true,
          isSigner: false
        }
      ];
  
      const claimIx = await this.jupProgram.methods
        .newClaim(
          new anchor.BN(claim.amount),
          new anchor.BN(claim.locked_amount || 0),
          claim.proof.map(p => new Uint8Array(p))
        )
        .accounts({
          distributor: distributorKey,
          claimStatus: claimStatusKey,
          from: distributorATA,
          to: userATA,
          claimant: this.wallet.publicKey,
          tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .remainingAccounts(remainingAccounts)
        .instruction();
  
      const tx = new anchor.web3.Transaction()
        .add(modifyComputeUnits)
        .add(addPriorityFee)
        .add(createATAIx)
        .add(createUserATAIx)
        .add(claimIx);
  
      const signature = await this.provider.sendAndConfirm(tx);
      console.log("\nJUP Claim successful!");
      console.log("Transaction signature:", signature);
  
      return signature;
  
    } catch (error) {
      console.error("Error claiming JUP:", error);
      throw error;
    }
  }
}

async function main() {
  const parser = yargs(hideBin(process.argv))
    .command('claim-dbr', 'Claim available DBR rewards')
    .command('claim-jup', 'Claim available JUP rewards')
    .demandCommand(1, 'You must specify a command: claim-dbr or claim-jup')
    .option('wallet', {
      alias: 'w',
      type: 'string',
      description: 'Path to wallet keypair file',
      required: true
    });

  const argv = await parser.argv;
  const command = argv._[0] as string;
  const walletPath = argv.wallet as string;

  const cli = new JupiterClaimingCLI(walletPath);

  try {
    switch (command) {
      case 'claim-dbr': {
        await cli.claimDBR();
        break;
      }
      case 'claim-jup': {
        await cli.claimJUP();
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