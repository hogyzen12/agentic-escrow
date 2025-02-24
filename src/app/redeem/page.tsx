'use client';

import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { useState, useEffect, useMemo } from 'react';
import {
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  Keypair
} from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  AccountLayout,
  createInitializeAccountInstruction,
  createTransferInstruction,
} from '@solana/spl-token';
import BN from 'bn.js';
import { IconInfoCircle } from '@tabler/icons-react';
import { useInterval } from '@/hooks/useInterval';

import { TOKEN_X_MINT, TOKEN_Y_MINT, ESCROW_PROGRAM_ID } from '@/utils/constants';
import { notify } from '../components/ui/notify';
import { useGetTokenAccounts, useTokenBalance } from '@/hooks/use-token-accounts';
import { ESCROW_ACCOUNT_DATA_LAYOUT } from '@/utils/escrow';
import FAQs from '@/components/metrics/FAQs';

// Keep all utility functions unchanged
function parseTokenAmountToBN(amountStr: string, decimals: number): BN {
  const [whole, fraction = ""] = amountStr.split('.');
  const fractionPart = fraction.padEnd(decimals, '0').slice(0, decimals);
  const integerString = whole + fractionPart;
  return new BN(integerString, 10);
}

function getRatioBN(days: number): BN {
  const BASE = new BN('1000000000');
  const EIGHTY_PERCENT = new BN('800000000');
  const TWENTY_PERCENT = new BN('200000000');

  if (days >= 30) return BASE;
  const increment = TWENTY_PERCENT.mul(new BN(days)).div(new BN(30));
  return EIGHTY_PERCENT.add(increment);
}

function bnToDecimalString(amountBN: BN, decimals: number, maxFractionDigits = 4): string {
  const baseStr = amountBN.toString().padStart(decimals+1, '0');
  const whole = baseStr.slice(0, -decimals) || "0";
  const fraction = baseStr.slice(-decimals).replace(/0+$/, '');
  let decimalStr = fraction.length > 0 ? `${whole}.${fraction}` : whole;
  
  if (fraction.length > maxFractionDigits) {
    decimalStr = `${whole}.${fraction.slice(0, maxFractionDigits)}`;
  }
  return decimalStr;
}

export default function RedeemPage() {
  // Keep all state and hooks unchanged
  const { connection } = useConnection();
  const { publicKey, signTransaction } = useWallet();
  const [isLoading, setIsLoading] = useState(false);
  const [unlockDays, setUnlockDays] = useState(30);
  const [govAmount, setGovAmount] = useState<string>("");

  // Token accounts and balances setup (unchanged)
  const { data: tokenAccounts, refetch: refetchTokenAccounts } = useGetTokenAccounts({
    address: publicKey,
  });

  const govTokenAccount = tokenAccounts?.find(
    (account) => account.account.data.parsed.info.mint === TOKEN_X_MINT.toString()
  );
  const jupTokenAccount = tokenAccounts?.find(
    (account) => account.account.data.parsed.info.mint === TOKEN_Y_MINT.toString()
  );

  const { data: balanceGOV, refetch: refetchBalanceGOV } = useTokenBalance({
    tokenAccount: govTokenAccount ? new PublicKey(govTokenAccount.pubkey) : null,
  });
  const { data: balanceJUP, refetch: refetchBalanceJUP } = useTokenBalance({
    tokenAccount: jupTokenAccount ? new PublicKey(jupTokenAccount.pubkey) : null,
  });

  // Keep all utility functions and handlers unchanged
  const refreshBalances = () => {
    refetchTokenAccounts();
    refetchBalanceGOV();
    refetchBalanceJUP();
  };

  useInterval(refreshBalances, 6900);

  const getRatio = (days: number): number => {
    if (days >= 30) return 1;
    return 0.8 + (0.2 * days / 30);
  };

  const estimatedJUPReturn = useMemo(() => {
    if (!govAmount) return "0.0";
    const govBN = parseTokenAmountToBN(govAmount, 6);
    if (govBN.isZero()) return "0.0";
    const ratioBN = getRatioBN(unlockDays);
    const jupBN = govBN.mul(ratioBN).div(new BN('1000000000'));
    return bnToDecimalString(jupBN, 6, 3);
  }, [govAmount, unlockDays]);

  const handleInitializeUnstake = async () => {
    if (!publicKey || !signTransaction || !govTokenAccount) {
      notify({ type: 'error', message: 'Please connect your wallet and ensure you have a GOV token account' });
      return;
    }

    const rawGovAmountBN = parseTokenAmountToBN(govAmount, 6);
    if (rawGovAmountBN.lte(new BN(0))) {
      notify({ type: 'error', message: 'Invalid GOV amount' });
      return;
    }

    try {
      setIsLoading(true);

      // Log number transformations like in test code
      console.log("\n🔍 Number Transformation Analysis:");
      console.log("Original govAmount:", govAmount);
      console.log("\nAs BN:");
      console.log("GOV amount BN:", rawGovAmountBN.toString());

      const ratioBN = getRatioBN(unlockDays);
      const expectedJUPAmountBN = rawGovAmountBN.mul(ratioBN).div(new BN('1000000000'));
      
      console.log("Expected JUP amount BN:", expectedJUPAmountBN.toString());
      
      // Show byte representation
      const govAmountBytes = rawGovAmountBN.toArray("le", 8);
      const jupAmountBytes = expectedJUPAmountBN.toArray("le", 8);
      
      console.log("\nAs LE bytes:");
      console.log("GOV amount bytes:", govAmountBytes);
      console.log("Expected JUP amount bytes:", jupAmountBytes);

      const tempTokenAccountKeypair = new Keypair();
      const escrowAccountKeypair = new Keypair();

      // Get rent exemptions
      const rentExemptionTempToken = await connection.getMinimumBalanceForRentExemption(
        AccountLayout.span
      );
      const rentExemptionEscrow = await connection.getMinimumBalanceForRentExemption(
        ESCROW_ACCOUNT_DATA_LAYOUT.span
      );

      console.log("Creating transaction with instructions:");
      console.log("1. Create temp token account");
      
      // Create temp token account
      const createTempTokenAccountIx = SystemProgram.createAccount({
        programId: TOKEN_PROGRAM_ID,
        space: AccountLayout.span,
        lamports: rentExemptionTempToken,
        fromPubkey: publicKey,
        newAccountPubkey: tempTokenAccountKeypair.publicKey,
      });

      console.log("2. Initialize temp token account");
      // Initialize temp account with modern SPL token instruction
      const initTempAccountIx = createInitializeAccountInstruction(
        tempTokenAccountKeypair.publicKey,  // account
        TOKEN_X_MINT,                       // mint
        publicKey,                          // owner
        TOKEN_PROGRAM_ID                    // programId
      );

      console.log("3. Transfer GOV tokens to temp account");
      console.log(rawGovAmountBN.toNumber())
      // Transfer tokens with modern SPL token instruction
      const transferGovTokensIx = createTransferInstruction(
        new PublicKey(govTokenAccount.pubkey),  // source
        tempTokenAccountKeypair.publicKey,      // destination
        publicKey,                              // owner
        rawGovAmountBN.toNumber(),             // amount
        [],                                     // multiSigners
        TOKEN_PROGRAM_ID                        // programId
      );

      console.log("4. Create escrow state account");
      // Create escrow account
      const createEscrowAccountIx = SystemProgram.createAccount({
        space: ESCROW_ACCOUNT_DATA_LAYOUT.span,
        lamports: rentExemptionEscrow,
        fromPubkey: publicKey,
        newAccountPubkey: escrowAccountKeypair.publicKey,
        programId: ESCROW_PROGRAM_ID,
      });

      console.log("5. Initialize escrow");
      console.log(expectedJUPAmountBN.toNumber())
      // Initialize escrow instruction
      const initEscrowIx = new TransactionInstruction({
        programId: ESCROW_PROGRAM_ID,
        keys: [
          { pubkey: publicKey, isSigner: true, isWritable: false },
          { pubkey: tempTokenAccountKeypair.publicKey, isSigner: false, isWritable: true },
          { pubkey: jupTokenAccount ? new PublicKey(jupTokenAccount.pubkey) : PublicKey.default, isSigner: false, isWritable: false },
          { pubkey: escrowAccountKeypair.publicKey, isSigner: false, isWritable: true },
          { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
          { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        ],
        data: Buffer.from(
          Uint8Array.of(0, ...expectedJUPAmountBN.toArray("le", 8))
        ),
      });

      const transaction = new Transaction()
        .add(createTempTokenAccountIx)
        .add(initTempAccountIx)
        .add(transferGovTokensIx)
        .add(createEscrowAccountIx)
        .add(initEscrowIx);

      transaction.feePayer = publicKey;
      transaction.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
      transaction.partialSign(tempTokenAccountKeypair, escrowAccountKeypair);

      console.log("Sending transaction...");
      const signedTx = await signTransaction(transaction);
      
      const txId = await connection.sendRawTransaction(signedTx.serialize(), {
        skipPreflight: false,
        preflightCommitment: "confirmed"
      });
      
      notify({ type: 'success', message: 'Setting up your escrow...' });
      
      const confirmation = await connection.confirmTransaction(txId, 'confirmed');
      if (confirmation.value.err) {
        throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
      }

      console.log(`✨Escrow successfully initialized. Offering ${govAmount} govJUP for ${estimatedJUPReturn} JUP✨\n`);
      
      notify({ 
        type: 'success', 
        message: `Successfully initialized unstake for ${govAmount} govJUP` 
      });

      setGovAmount("");
      refreshBalances();

    } catch (error: any) {
      console.error('Initialize Escrow error:', error);
      if (error.logs) {
        console.error('Transaction logs:', error.logs);
      }
      notify({ type: 'error', message: `Failed to initialize escrow: ${error.message}` });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0D1117]">
      <div className="container mx-auto px-6 py-12">
        <div className="mb-12">
          <h1 className="text-3xl font-bold mb-4">
            <span className="text-[#3DD2C0]">REDEEM</span>
            <span className="text-white"> YOUR GOVAI TOKENS</span>
          </h1>
          <p className="text-white/70">
            Convert your govJUP tokens back to JUP with flexible unlocking periods.
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-8 mb-12">
          {/* Redemption Interface */}
          <div className="bg-[#1E2C3D] rounded-xl p-8 border border-[#3DD2C0]/10">
            <div className="grid grid-cols-2 gap-4 mb-8">
              <div>
                <div className="text-white/60">govJUP Balance</div>
                <div className="text-2xl text-white">{balanceGOV ?? '0.00'}</div>
              </div>
              <div className="text-right">
                <div className="text-white/60">JUP Balance</div>
                <div className="text-2xl text-white">{balanceJUP ?? '0.00'}</div>
              </div>
            </div>

            <div className="space-y-6">
              {/* Amount Input */}
              <div className="bg-[#2A3B4D] rounded-xl p-4">
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={govAmount}
                  onChange={(e) => setGovAmount(e.target.value)}
                  className="w-full bg-transparent text-white text-lg focus:outline-none"
                  placeholder="0.00"
                />
                <div className="text-white/60 text-sm">govJUP</div>
              </div>

              {/* Unlock Period Slider */}
              <div>
                <div className="flex justify-between mb-2">
                  <span className="text-white/60">Unlock Period</span>
                  <span className="text-white">{unlockDays} days</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="30"
                  value={unlockDays}
                  onChange={(e) => setUnlockDays(parseInt(e.target.value))}
                  className="w-full h-2 bg-[#2A3B4D] rounded-lg appearance-none cursor-pointer accent-[#3DD2C0]"
                />
                <div className="flex justify-between text-sm text-white/60 mt-2">
                  <span>Instant (20% fee)</span>
                  <span>30 days (0% fee)</span>
                </div>
              </div>

              {/* Estimated Return */}
              <div className="bg-[#2A3B4D] rounded-xl p-4">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-white/60">Estimated Return</span>
                  <span className="text-xl text-white">{estimatedJUPReturn} JUP</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-white/60">Rate</span>
                  <span className="text-[#3DD2C0]">
                    1 govJUP = {getRatio(unlockDays).toFixed(3)} JUP
                  </span>
                </div>
              </div>

              {/* Submit Button */}
              <button
                onClick={handleInitializeUnstake}
                disabled={
                  isLoading ||
                  !publicKey ||
                  !balanceGOV ||
                  isNaN(parseFloat(govAmount)) ||
                  parseFloat(govAmount) <= 0 ||
                  parseFloat(govAmount) > (balanceGOV || 0)
                }
                className={`w-full py-4 rounded-xl text-lg font-medium transition-all
                  ${isLoading ? 'bg-[#2A3B4D] text-white/50' : 'bg-[#3DD2C0] text-[#0D1117] hover:bg-[#2FC1AF]'}
                  ${(!publicKey || !balanceGOV || parseFloat(govAmount) > (balanceGOV || 0)) ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {isLoading ? (
                  <div className="flex items-center justify-center space-x-2">
                    <div className="w-5 h-5 border-2 border-white/20 border-t-white/80 rounded-full animate-spin" />
                    <span>Processing...</span>
                  </div>
                ) : !publicKey ? (
                  'Connect Wallet'
                ) : !balanceGOV ? (
                  'No govJUP Balance'
                ) : parseFloat(govAmount) > (balanceGOV || 0) ? (
                  'Insufficient govJUP Balance'
                ) : (
                  'INITIALIZE REDEEM'
                )}
              </button>
            </div>
          </div>

          {/* Info Section */}
          <div className="space-y-6">
            <div className="bg-[#1E2C3D] rounded-xl p-8 border border-[#3DD2C0]/10">
              <div className="space-y-4">
                <div className="flex items-start space-x-4">
                  <div className="w-2 h-2 bg-[#3DD2C0] rounded-full mt-2"></div>
                  <p className="text-white/70">Choose your unlock period: instant with a 20% fee, or wait up to 30 days for no fee.</p>
                </div>
                <div className="flex items-start space-x-4">
                  <div className="w-2 h-2 bg-[#3DD2C0] rounded-full mt-2"></div>
                  <p className="text-white/70">Early withdrawal fees are distributed to remaining stakers as rewards.</p>
                </div>
                <div className="flex items-start space-x-4">
                  <div className="w-2 h-2 bg-[#3DD2C0] rounded-full mt-2"></div>
                  <p className="text-white/70">Your JUP tokens will be available after the chosen unlock period.</p>
                </div>
              </div>
            </div>

            <div className="bg-[#1E2C3D] rounded-xl p-8 border border-[#3DD2C0]/10">
              <div className="flex items-start space-x-4">
                <IconInfoCircle className="text-[#3DD2C0] w-6 h-6 flex-shrink-0" />
                <div>
                  <h3 className="text-white font-medium mb-2">Understanding Unlock Periods</h3>
                  <p className="text-white/70">
                    The unlock period determines your redemption rate. Choosing a longer period
                    reduces the fee, with a 30-day period having zero fee. This mechanism helps
                    maintain protocol stability and rewards long-term stakers.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* FAQ Section */}
        <FAQs />
      </div>
    </div>
  );
}