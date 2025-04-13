import { PublicKey, Connection, Keypair } from '@solana/web3.js';
import * as anchor from "@project-serum/anchor";
import { Buffer } from 'buffer';
import fs from 'fs';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { getAssociatedTokenAddress, createAssociatedTokenAccountInstruction } from '@solana/spl-token';

// Define types for our CLI arguments
interface BaseArgs {
wallet: string;
}

interface StakeArgs extends BaseArgs {
amount: number;
}

interface UnstakeArgs extends StakeArgs {
memo?: string;
}

interface WithdrawArgs extends BaseArgs {}

interface UnstakeDetails {
    transactionSignature: string;
    partialUnstakeAccount: string;
    submittedAt: number;
    unlockTime: number;
    amount: string;
    formattedSubmittedAt: string;
    formattedUnlockTime: string;
  }

class JupiterStakingCLI {
  static LOCKED_VOTER_PROGRAM_ID = new PublicKey("voTpe3tHQ7AjQHMapgSue2HJFAh2cGsdokqN3XqmVSj");
  static BASE_KEY = new PublicKey("bJ1TRoFo2P6UHVwqdiipp6Qhp2HaaHpLowZ5LHet8Gm");
  static JUP_MINT = new PublicKey("JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN");
  static RPC_URL = "https://delicate-side-reel.solana-mainnet.quiknode.pro/b5bdab46540fe358dd8cd93ec94c0a480bd11369/";

  connection: Connection;
  program: anchor.Program;
  wallet: Keypair;
  provider: anchor.AnchorProvider;

  constructor(walletPath: string) {
    this.connection = new Connection(JupiterStakingCLI.RPC_URL, "confirmed");
    
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

    // Load IDL
    const idlFile = JSON.parse(fs.readFileSync('idl.json', 'utf-8'));
    this.program = new anchor.Program(idlFile, JupiterStakingCLI.LOCKED_VOTER_PROGRAM_ID, this.provider);
  }

  async findLockerAddress(): Promise<[PublicKey, number]> {
    return PublicKey.findProgramAddress(
      [
        Buffer.from("Locker"),
        JupiterStakingCLI.BASE_KEY.toBuffer()
      ],
      JupiterStakingCLI.LOCKED_VOTER_PROGRAM_ID
    );
  }

  async findEscrowAddress(locker: PublicKey, owner: PublicKey): Promise<[PublicKey, number]> {
    return PublicKey.findProgramAddress(
      [
        Buffer.from("Escrow"),
        locker.toBuffer(),
        owner.toBuffer()
      ],
      JupiterStakingCLI.LOCKED_VOTER_PROGRAM_ID
    );
  }

  async createATA(mint: PublicKey, owner: PublicKey): Promise<string> {
    const ata = await getAssociatedTokenAddress(
      mint,
      owner,
      true // allowOwnerOffCurve
    );

    const ix = createAssociatedTokenAccountInstruction(
      this.wallet.publicKey,
      ata,
      owner,
      mint
    );

    const tx = await this.provider.sendAndConfirm(
      new anchor.web3.Transaction().add(ix),
      []
    );

    return tx;
  }

  async getOrCreateEscrowATA(escrowKey: PublicKey): Promise<PublicKey> {
    const ata = await getAssociatedTokenAddress(
      JupiterStakingCLI.JUP_MINT,
      escrowKey,
      true // allowOwnerOffCurve
    );

    try {
      const account = await this.connection.getAccountInfo(ata);
      if (!account) {
        console.log("Creating escrow ATA...");
        const tx = await this.createATA(JupiterStakingCLI.JUP_MINT, escrowKey);
        console.log("Created escrow ATA:", tx);
      } else {
        console.log("Escrow ATA already exists");
      }
    } catch (e) {
      console.log("Error checking/creating escrow ATA:", e);
    }

    return ata;
  }

  async checkAccountExists(pubkey: PublicKey): Promise<boolean> {
    const account = await this.connection.getAccountInfo(pubkey);
    return account !== null;
  }

  async initializeAndStake(amount: number) {
    try {
      // Get account addresses
      const [lockerKey] = await this.findLockerAddress();
      const [escrowKey] = await this.findEscrowAddress(lockerKey, this.wallet.publicKey);
      
      // Get token accounts
      const sourceATA = await getAssociatedTokenAddress(
        JupiterStakingCLI.JUP_MINT,
        this.wallet.publicKey
      );

      console.log("\nDerived addresses:");
      console.log("Locker:", lockerKey.toString());
      console.log("Escrow:", escrowKey.toString());
      console.log("Source JUP ATA:", sourceATA.toString());

      // Check if escrow exists
      const escrowExists = await this.checkAccountExists(escrowKey);
      console.log("\nEscrow account status:", escrowExists ? "Already exists" : "Needs creation");

      // Add compute budget instructions
      const modifyComputeUnits = anchor.web3.ComputeBudgetProgram.setComputeUnitLimit({
        units: 150000
      });

      const addPriorityFee = anchor.web3.ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: 333333
      });

      let createEscrowTx: string | undefined;
      // Only create escrow if it doesn't exist
      if (!escrowExists) {
        console.log("\nCreating escrow...");
        createEscrowTx = await this.program.methods
          .newEscrow()
          .accounts({
            locker: lockerKey,
            escrow: escrowKey,
            escrowOwner: this.wallet.publicKey,
            payer: this.wallet.publicKey,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .preInstructions([modifyComputeUnits, addPriorityFee])
          .rpc();

        console.log("Escrow created! Tx:", createEscrowTx);
      }

      // Get or create escrow token account
      const escrowATA = await this.getOrCreateEscrowATA(escrowKey);
      console.log("Escrow JUP ATA:", escrowATA.toString());

      // Check max lock status if escrow exists
      let toggleMaxLockTx: string | undefined;
      if (escrowExists) {
        const escrowAccount = await this.program.account.escrow.fetch(escrowKey);
        if (!escrowAccount.isMaxLock) {
          console.log("\nEnabling max lock...");
          toggleMaxLockTx = await this.program.methods
            .toggleMaxLock(true)
            .accounts({
              locker: lockerKey,
              escrow: escrowKey,
              escrowOwner: this.wallet.publicKey,
            })
            .preInstructions([modifyComputeUnits, addPriorityFee])
            .rpc();

          console.log("Max lock enabled! Tx:", toggleMaxLockTx);
        } else {
          console.log("\nMax lock already enabled");
        }
      } else {
        // Always enable max lock for new escrows
        console.log("\nEnabling max lock...");
        toggleMaxLockTx = await this.program.methods
          .toggleMaxLock(true)
          .accounts({
            locker: lockerKey,
            escrow: escrowKey,
            escrowOwner: this.wallet.publicKey,
          })
          .preInstructions([modifyComputeUnits, addPriorityFee])
          .rpc();

        console.log("Max lock enabled! Tx:", toggleMaxLockTx);
      }

      // Now increase the locked amount
      console.log("\nStaking tokens...");
      const amountBN = new anchor.BN(amount);
      const increaseLockTx = await this.program.methods
        .increaseLockedAmount(amountBN)
        .accounts({
          locker: lockerKey,
          escrow: escrowKey,
          escrowTokens: escrowATA,
          payer: this.wallet.publicKey,
          sourceTokens: sourceATA,
          tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
        })
        .preInstructions([modifyComputeUnits, addPriorityFee])
        .rpc();

      console.log("Tokens staked! Tx:", increaseLockTx);
      
      return {
        success: true,
        createEscrowTx,
        toggleMaxLockTx,
        increaseLockTx
      };

    } catch (error) {
      console.error("Error:", error);
      return {
        success: false,
        error
      };
    }
  }

  async verifyTransaction(signature: string, maxRetries = 3): Promise<boolean> {
    for (let i = 0; i < maxRetries; i++) {
      try {
        const status = await this.connection.getSignatureStatus(signature);
        if (status.value?.confirmationStatus === 'confirmed' || status.value?.confirmationStatus === 'finalized') {
          return true;
        }
        // Wait 5 seconds between retries
        await new Promise(resolve => setTimeout(resolve, 5000));
      } catch (error) {
        console.log(`Attempt ${i + 1} failed, retrying...`);
      }
    }
    return false;
  }

  async saveUnstakeDetails(data: UnstakeDetails) {
    // Create unstakes directory if it doesn't exist
    const dir = 'unstakes';
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir);
    }

    // Save to both current and archived location
    const filename = `${dir}/unstake-${data.partialUnstakeAccount}.json`;
    fs.writeFileSync(filename, JSON.stringify(data, null, 2));
    fs.writeFileSync('unstake-details.json', JSON.stringify(data, null, 2));
  }

  async initiateUnstake(amount: number) {
    try {
      const [lockerKey] = await this.findLockerAddress();
      const [escrowKey] = await this.findEscrowAddress(lockerKey, this.wallet.publicKey);
      
      const partialUnstake = Keypair.generate();
      
      const modifyComputeUnits = anchor.web3.ComputeBudgetProgram.setComputeUnitLimit({
        units: 150000
      });

      const addPriorityFee = anchor.web3.ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: 333333
      });

      const currentTime = Math.floor(Date.now() / 1000);
      const unlockTime = currentTime + (30 * 24 * 60 * 60);

      console.log("\nInitiating unstake...");
      console.log(`Amount: ${amount / 1_000_000} JUP`);
      console.log(`Unlock date: ${new Date(unlockTime * 1000).toLocaleString()}`);

      let tx: string;
      try {
        tx = await this.program.methods
          .openPartialUnstaking(
            new anchor.BN(amount),
            `Unstaking ${amount / 1_000_000} JUP`
          )
          .accounts({
            locker: lockerKey,
            escrow: escrowKey,
            partialUnstake: partialUnstake.publicKey,
            owner: this.wallet.publicKey,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .preInstructions([modifyComputeUnits, addPriorityFee])
          .signers([partialUnstake])
          .rpc();
      } catch (error: any) {
        if (error?.message?.includes('Transaction was not confirmed')) {
          console.log("\nTransaction timed out, verifying status...");
          const signature = error.signature;
          const verified = await this.verifyTransaction(signature);
          if (!verified) {
            throw new Error("Transaction failed to confirm after retries");
          }
          tx = signature;
          console.log("Transaction confirmed successfully!");
        } else {
          throw error;
        }
      }

      const outputData: UnstakeDetails = {
        transactionSignature: tx,
        partialUnstakeAccount: partialUnstake.publicKey.toString(),
        submittedAt: currentTime,
        unlockTime: unlockTime,
        amount: `${amount / 1_000_000} JUP`,
        formattedSubmittedAt: new Date(currentTime * 1000).toLocaleString(),
        formattedUnlockTime: new Date(unlockTime * 1000).toLocaleString()
      };

      await this.saveUnstakeDetails(outputData);

      console.log("\nUnstake initiated successfully!");
      console.log("Transaction signature:", tx);
      console.log("Details saved to unstakes directory and unstake-details.json");

      return outputData;
    } catch (error) {
      console.error("Error initiating unstake:", error);
      throw error;
    }
  }

  async listUnstakes(): Promise<UnstakeDetails[]> {
    const dir = 'unstakes';
    if (!fs.existsSync(dir)) {
      return [];
    }

    const unstakes: UnstakeDetails[] = [];
    const files = fs.readdirSync(dir);
    
    for (const file of files) {
      if (file.startsWith('unstake-') && file.endsWith('.json')) {
        const content = fs.readFileSync(`${dir}/${file}`, 'utf8');
        unstakes.push(JSON.parse(content));
      }
    }

    return unstakes;
  }

  async withdrawUnstake(specificUnstake?: string) {
    try {
      let unstakeDetails: UnstakeDetails;
      
      // Try to load the unstake details
      if (specificUnstake) {
        const filename = `unstakes/unstake-${specificUnstake}.json`;
        if (!fs.existsSync(filename)) {
          throw new Error(`Could not find unstake file for ${specificUnstake}`);
        }
        unstakeDetails = JSON.parse(fs.readFileSync(filename, 'utf-8'));
      } else {
        // Find most recent unstake if no specific one provided
        const unstakes = await this.listUnstakes();
        if (unstakes.length === 0) {
          throw new Error("No unstakes found. Please run the unstake command first.");
        }
        
        // Sort by submitted time, most recent first
        unstakes.sort((a, b) => b.submittedAt - a.submittedAt);
        unstakeDetails = unstakes[0];
        
        console.log("\nFound most recent unstake:");
        console.log(`Amount: ${unstakeDetails.amount}`);
        console.log(`Unlock date: ${unstakeDetails.formattedUnlockTime}`);
        console.log(`ID: ${unstakeDetails.partialUnstakeAccount}`);
      }

      // Check if it's time to withdraw
      const currentTime = Math.floor(Date.now() / 1000);
      const timeRemaining = unstakeDetails.unlockTime - currentTime;
      
      if (currentTime < unstakeDetails.unlockTime) {
        const daysRemaining = Math.ceil(timeRemaining / (24 * 60 * 60));
        const hoursRemaining = Math.ceil(timeRemaining / (60 * 60));
        
        if (daysRemaining > 1) {
          throw new Error(`Cannot withdraw yet. ${daysRemaining} days remaining until ${unstakeDetails.formattedUnlockTime}`);
        } else {
          throw new Error(`Cannot withdraw yet. ${hoursRemaining} hours remaining until ${unstakeDetails.formattedUnlockTime}`);
        }
      }

      // Get required accounts
      const [lockerKey] = await this.findLockerAddress();
      const [escrowKey] = await this.findEscrowAddress(lockerKey, this.wallet.publicKey);
      
      // Get token accounts
      const escrowATA = await getAssociatedTokenAddress(
        JupiterStakingCLI.JUP_MINT,
        escrowKey,
        true
      );
      
      const destinationATA = await getAssociatedTokenAddress(
        JupiterStakingCLI.JUP_MINT,
        this.wallet.publicKey
      );

      const partialUnstake = new PublicKey(unstakeDetails.partialUnstakeAccount);

      // Add compute budget instructions
      const modifyComputeUnits = anchor.web3.ComputeBudgetProgram.setComputeUnitLimit({
        units: 150000
      });

      const addPriorityFee = anchor.web3.ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: 333333
      });

      console.log("\nProcessing withdrawal...");
      let tx: string;
      try {
        tx = await this.program.methods
          .withdrawPartialUnstaking()
          .accounts({
            locker: lockerKey,
            escrow: escrowKey,
            partialUnstake: partialUnstake,
            owner: this.wallet.publicKey,
            escrowTokens: escrowATA,
            destinationTokens: destinationATA,
            payer: this.wallet.publicKey,
            tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
          })
          .preInstructions([modifyComputeUnits, addPriorityFee])
          .rpc();
      } catch (error: any) {
        if (error?.message?.includes('Transaction was not confirmed')) {
          console.log("\nTransaction timed out, verifying status...");
          const signature = error.signature;
          const verified = await this.verifyTransaction(signature);
          if (!verified) {
            throw new Error("Transaction failed to confirm after retries");
          }
          tx = signature;
          console.log("Transaction confirmed successfully!");
        } else if (error?.message?.includes("0x177e")) {
          throw new Error("The unstaking period hasn't ended yet. Please wait longer before attempting to withdraw.");
        } else {
          throw error;
        }
      }

      console.log("Withdrawal successful!");
      console.log("Transaction signature:", tx);
      
      // Archive the unstake details
      const archiveData = {
        ...unstakeDetails,
        withdrawalSignature: tx,
        withdrawnAt: currentTime,
        formattedWithdrawnAt: new Date(currentTime * 1000).toLocaleString()
      };

      // Archive the unstake details and remove from active unstakes
      const archiveFilename = `unstakes/completed-unstake-${unstakeDetails.partialUnstakeAccount}.json`;
      fs.writeFileSync(archiveFilename, JSON.stringify(archiveData, null, 2));
      
      // Remove from active unstakes
      const unstakeFilename = `unstakes/unstake-${unstakeDetails.partialUnstakeAccount}.json`;
      if (fs.existsSync(unstakeFilename)) {
        fs.unlinkSync(unstakeFilename);
      }
      
      // Update unstake-details.json if this was the most recent unstake
      if (fs.existsSync('unstake-details.json')) {
        const currentDetails = JSON.parse(fs.readFileSync('unstake-details.json', 'utf-8'));
        if (currentDetails.partialUnstakeAccount === unstakeDetails.partialUnstakeAccount) {
          fs.unlinkSync('unstake-details.json');
        }
      }

      return archiveData;
    } catch (error) {
      if (error instanceof Error) {
        console.error("Error withdrawing unstake:", error.message);
      }
      throw error;
    }
  }
}


async function main() {
    const parser = yargs(hideBin(process.argv))
      .command('stake', 'Stake JUP tokens')
      .command('unstake', 'Initiate unstaking of JUP tokens')
      .command('withdraw', 'Withdraw unstaked JUP tokens')
      .command('list', 'List all pending unstakes')
      .demandCommand(1, 'You must specify a command: stake, unstake, withdraw, or list')
      .option('wallet', {
        alias: 'w',
        type: 'string',
        description: 'Path to wallet keypair file',
        required: true
      })
      .option('amount', {
        alias: 'a',
        type: 'number',
        description: 'Amount of JUP to stake/unstake',
        required: false
      })
      .option('unstake-id', {
        type: 'string',
        description: 'Specific unstake ID to withdraw',
        required: false
      });
  
    const argv = await parser.argv;
    const command = argv._[0] as string;
    const walletPath = argv.wallet as string;
    const amount = argv.amount;
    const unstakeId = argv['unstake-id'] as string | undefined;
  
    if ((command === 'stake' || command === 'unstake') && !amount) {
      console.error(`Error: --amount is required for ${command} command`);
      process.exit(1);
    }
  
    const cli = new JupiterStakingCLI(walletPath);
  
    try {
      switch (command) {
        case 'stake': {
          const stakeAmount = Math.floor(amount! * 1_000_000);
          console.log(`\nInitializing staking for ${amount} JUP...`);
          await cli.initializeAndStake(stakeAmount);
          break;
        }
  
        case 'unstake': {
          const unstakeAmount = Math.floor(amount! * 1_000_000);
          console.log(`\nInitiating unstake for ${amount} JUP...`);
          await cli.initiateUnstake(unstakeAmount);
          break;
        }
  
        case 'withdraw': {
          try {
            console.log('\nWithdrawing unstaked tokens...');
            await cli.withdrawUnstake(unstakeId);
          } catch (error) {
            if (error instanceof Error) {
              // Handle expected error states gracefully
              if (error.message.includes("Cannot withdraw yet")) {
                console.log("\n" + error.message);
                console.log("\nTip: Use 'list' command to check all pending unstakes and their status");
                process.exit(0); // Exit cleanly for expected states
              } else if (error.message.includes("No unstakes found")) {
                console.log("\nNo pending unstakes found to withdraw.");
                console.log("Tip: Use 'unstake' command first to initiate an unstake");
                process.exit(0);
              }
            }
            // Re-throw unexpected errors
            throw error;
          }
          break;
        }
  
        case 'list': {
          const unstakes = await cli.listUnstakes();
          if (unstakes.length === 0) {
            console.log('\nNo pending unstakes found.');
            console.log("Tip: Use 'unstake' command to initiate an unstake");
          } else {
            console.log('\nPending unstakes:');
            unstakes.forEach((u, i) => {
              const currentTime = Math.floor(Date.now() / 1000);
              const timeRemaining = u.unlockTime - currentTime;
              const daysRemaining = Math.ceil(timeRemaining / (24 * 60 * 60));
              const hoursRemaining = Math.ceil(timeRemaining / (60 * 60));
              
              console.log(`\n${i + 1}. Amount: ${u.amount}`);
              console.log(`   Unlock date: ${u.formattedUnlockTime}`);
              if (daysRemaining > 1) {
                console.log(`   Time remaining: ${daysRemaining} days`);
              } else {
                console.log(`   Time remaining: ${hoursRemaining} hours`);
              }
              console.log(`   ID: ${u.partialUnstakeAccount}`);
            });
            console.log("\nTip: Once unlocked, use 'withdraw' command to claim your tokens");
          }
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