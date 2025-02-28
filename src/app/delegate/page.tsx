'use client';

import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { useState, useEffect, useCallback } from 'react';
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
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddress,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAccount
} from '@solana/spl-token';
import BN from 'bn.js';
import { useRouter } from 'next/navigation';
import { useInterval } from '@/hooks/useInterval';
import { IconInfoCircle } from '@tabler/icons-react';

import { TOKEN_X_MINT, TOKEN_Y_MINT, ESCROW_PROGRAM_ID, STAKED_JUP } from '@/utils/constants';
import { notify } from '../components/ui/notify';
import { useGetTokenAccounts, useTokenBalance } from '@/hooks/use-token-accounts';
import { ESCROW_ACCOUNT_DATA_LAYOUT } from '@/utils/escrow';
import FAQs from '@/components/metrics/FAQs';

// Maximum staking amount (41,990 JUP)
const MAX_STAKE_AMOUNT = 41990;

// Staking window end date
const STAKING_END_DATE = new Date('2025-03-08T00:00:00Z');

function CountdownTimer() {
  const [timeLeft, setTimeLeft] = useState('');

  useEffect(() => {
    const calculateTimeLeft = () => {
      const now = new Date();
      const difference = STAKING_END_DATE.getTime() - now.getTime();

      if (difference <= 0) {
        return 'Staking window closed';
      }

      const days = Math.floor(difference / (1000 * 60 * 60 * 24));
      const hours = Math.floor((difference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((difference % (1000 * 60)) / 1000);

      return `${days}d ${hours}h ${minutes}m ${seconds}s`;
    };

    const timer = setInterval(() => {
      setTimeLeft(calculateTimeLeft());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  return (
    <div className="text-center p-3 bg-[#2A3B4D] rounded-xl mb-6">
      <span className="text-[#3DD2C0] font-medium">Staking Window Closes In: </span>
      <span className="text-white">{timeLeft}</span>
    </div>
  );
}

export default function DelegatePage() {
  const router = useRouter();
  const { connection } = useConnection();
  const { publicKey, signTransaction } = useWallet();
  const [stakeAmount, setStakeAmount] = useState<string>("");

  // Token accounts setup
  const { data: tokenAccounts, refetch: refetchTokenAccounts } = useGetTokenAccounts({
    address: publicKey,
  });

  const tokenXAccount = tokenAccounts?.find(
    (account) => account.account.data.parsed.info.mint === TOKEN_X_MINT.toString()
  );
  const tokenYAccount = tokenAccounts?.find(
    (account) => account.account.data.parsed.info.mint === TOKEN_Y_MINT.toString()
  );

  const { data: balanceX, refetch: refetchBalanceX } = useTokenBalance({
    tokenAccount: tokenXAccount ? new PublicKey(tokenXAccount.pubkey) : null,
  });
  const { data: balanceY, refetch: refetchBalanceY } = useTokenBalance({
    tokenAccount: tokenYAccount ? new PublicKey(tokenYAccount.pubkey) : null,
  });

  // Refresh data periodically
  useInterval(() => {
    refetchTokenAccounts();
    refetchBalanceX();
    refetchBalanceY();
  }, 6900);

  const isStakingWindowOpen = () => {
    return new Date() < STAKING_END_DATE;
  };

  const handleStakeInput = (value: string) => {
    const numValue = parseFloat(value);
    if (isNaN(numValue) || numValue <= 0) {
      setStakeAmount(value);
      return;
    }
    // Ensure the input doesn't exceed MAX_STAKE_AMOUNT
    if (numValue > MAX_STAKE_AMOUNT) {
      setStakeAmount(MAX_STAKE_AMOUNT.toString());
      return;
    }
    setStakeAmount(value);
  };

  const handleInitializeEscrow = async () => {
    if (!publicKey || !signTransaction || !tokenYAccount) {
      notify({ 
        type: 'error', 
        message: 'Please connect your wallet and ensure you have a JUP token account' 
      });
      return;
    }

    const DECIMALS = 6;
    const jupAmount = parseFloat(stakeAmount);
    if (isNaN(jupAmount) || jupAmount <= 0 || jupAmount > MAX_STAKE_AMOUNT) {
      notify({ type: 'error', message: 'Invalid delegation amount' });
      return;
    }

    const rawAmount = Math.floor(jupAmount * Math.pow(10, DECIMALS));

    try {
      const tempTokenAccountKeypair = Keypair.generate();
      const escrowAccountKeypair = Keypair.generate();

      // Calculate rent exemptions
      const rentExemptionTempToken = await connection.getMinimumBalanceForRentExemption(
        AccountLayout.span
      );
      const rentExemptionEscrow = await connection.getMinimumBalanceForRentExemption(
        ESCROW_ACCOUNT_DATA_LAYOUT.span
      );

      // Get or create GOV token account
      const associatedTokenAddress = await getAssociatedTokenAddress(
        TOKEN_X_MINT,
        publicKey,
        false,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      );

      // Create instructions array
      const instructions = [];

      // If GOV token account doesn't exist, add creation instruction
      if (!tokenXAccount) {
        instructions.push(
          createAssociatedTokenAccountInstruction(
            publicKey,
            associatedTokenAddress,
            publicKey,
            TOKEN_X_MINT
          )
        );
      }

      instructions.push(
        SystemProgram.createAccount({
          fromPubkey: publicKey,
          newAccountPubkey: tempTokenAccountKeypair.publicKey,
          lamports: rentExemptionTempToken,
          space: AccountLayout.span,
          programId: TOKEN_PROGRAM_ID,
        }),
        createInitializeAccountInstruction(
          tempTokenAccountKeypair.publicKey,
          TOKEN_Y_MINT,
          publicKey,
          TOKEN_PROGRAM_ID
        ),
        createTransferInstruction(
          new PublicKey(tokenYAccount.pubkey),
          tempTokenAccountKeypair.publicKey,
          publicKey,
          rawAmount,
          [],
          TOKEN_PROGRAM_ID
        ),
        SystemProgram.createAccount({
          fromPubkey: publicKey,
          newAccountPubkey: escrowAccountKeypair.publicKey,
          lamports: rentExemptionEscrow,
          space: ESCROW_ACCOUNT_DATA_LAYOUT.span,
          programId: ESCROW_PROGRAM_ID,
        }),
        new TransactionInstruction({
          programId: ESCROW_PROGRAM_ID,
          keys: [
            { pubkey: publicKey, isSigner: true, isWritable: false },
            { pubkey: tempTokenAccountKeypair.publicKey, isSigner: false, isWritable: true },
            { pubkey: associatedTokenAddress, isSigner: false, isWritable: false },
            { pubkey: escrowAccountKeypair.publicKey, isSigner: false, isWritable: true },
            { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
            { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
          ],
          data: Buffer.from(
            Uint8Array.of(0, ...new BN(rawAmount).toArray("le", 8))
          ),
        })
      );

      const transaction = new Transaction();
      instructions.forEach(ix => transaction.add(ix));
      
      transaction.feePayer = publicKey;
      transaction.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
      transaction.partialSign(tempTokenAccountKeypair, escrowAccountKeypair);

      const signedTx = await signTransaction(transaction);
      notify({ type: 'success', message: 'Please confirm the delegation...' });
      
      const txId = await connection.sendRawTransaction(signedTx.serialize(), {
        skipPreflight: false,
        preflightCommitment: "confirmed"
      });
      
      notify({ 
        type: 'success', 
        message: `Successfully delegated ${jupAmount} JUP to GovAI` 
      });

    } catch (error: any) {
      console.error('Delegation error:', error);
      notify({ type: 'error', message: `Failed to delegate: ${error.message}` });
    }
  };

  return (
    <div className="min-h-screen bg-[#0D1117]">
      <div className="container mx-auto px-6 py-12">
        <div className="mb-12">
          <h1 className="text-3xl font-bold mb-4">
            <span className="text-[#3DD2C0]">STAKE</span>
            <span className="text-white"> YOUR JUP WITH GOVAI</span>
          </h1>
          <p className="text-white/70">
            Stake your JUP with GovAI, the expert AI who deals with governance for you.
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-8 mb-12">
          {/* Staking Interface */}
          <div className="bg-[#1E2C3D] rounded-xl p-8 border border-[#3DD2C0]/10">
            <CountdownTimer />
            
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-white/60">govJUP Balance</div>
                  <div className="text-2xl text-white">{balanceX ?? '0.00'}</div>
                </div>
                <div className="text-right">
                  <div className="text-white/60">JUP Balance</div>
                  <div className="text-2xl text-white">{balanceY ?? '0.00'}</div>
                </div>
              </div>

              <div className="bg-[#2A3B4D] rounded-xl p-4">
                <input
                  type="number"
                  min="0"
                  max={MAX_STAKE_AMOUNT}
                  step="any"
                  value={stakeAmount}
                  onChange={(e) => handleStakeInput(e.target.value)}
                  className="w-full bg-transparent text-white text-lg focus:outline-none"
                  placeholder="0.00"
                  disabled={!isStakingWindowOpen()}
                />
                <div className="flex justify-between mt-2">
                  <span className="text-white/60 text-sm">JUP</span>
                  <span className="text-white/60 text-sm">Max: {MAX_STAKE_AMOUNT.toLocaleString()} JUP</span>
                </div>
              </div>

              <button
                onClick={handleInitializeEscrow}
                disabled={
                  !isStakingWindowOpen() ||
                  !publicKey ||
                  !balanceY ||
                  isNaN(parseFloat(stakeAmount)) ||
                  parseFloat(stakeAmount) <= 0 ||
                  parseFloat(stakeAmount) > Math.min(balanceY, MAX_STAKE_AMOUNT)
                }
                className={`w-full py-4 rounded-xl text-lg font-medium transition-all
                  ${!isStakingWindowOpen() || !publicKey || !balanceY || parseFloat(stakeAmount) > (balanceY || 0)
                    ? 'bg-[#2A3B4D] text-white/50 cursor-not-allowed'
                    : 'bg-[#3DD2C0] text-[#0D1117] hover:bg-[#2FC1AF]'}`}
              >
                {!isStakingWindowOpen() ? (
                  'Staking Window Closed'
                ) : !publicKey ? (
                  'Connect Wallet'
                ) : !balanceY ? (
                  'No JUP Balance'
                ) : parseFloat(stakeAmount) > (balanceY || 0) ? (
                  'Insufficient JUP Balance'
                ) : (
                  'STAKE YOUR JUP'
                )}
              </button>

              <div className="flex justify-between text-sm text-white/60 bg-[#2A3B4D] p-4 rounded-xl">
                <span>ASR + EARLY UNSTAKING FEE: 20%</span>
                <span>BASE APR: ≈20%</span>
              </div>
            </div>
          </div>

          {/* Info Section */}
          <div className="space-y-6">
            <div className="bg-[#1E2C3D] rounded-xl p-8 border border-[#3DD2C0]/10">
              <div className="space-y-4">
                <div className="flex items-start space-x-4">
                  <div className="w-2 h-2 bg-[#3DD2C0] rounded-full mt-2"></div>
                  <p className="text-white/70">Vote on your behalf, so you do not have to track proposals or spend time analyzing them.</p>
                </div>
                <div className="flex items-start space-x-4">
                  <div className="w-2 h-2 bg-[#3DD2C0] rounded-full mt-2"></div>
                  <p className="text-white/70">Collect all types of rewards from governance and staking activities.</p>
                </div>
                <div className="flex items-start space-x-4">
                  <div className="w-2 h-2 bg-[#3DD2C0] rounded-full mt-2"></div>
                  <p className="text-white/70">Distribute a share of the fees collected from the service and early redemptions to other stakers.</p>
                </div>
              </div>
            </div>

            <button
              onClick={() => router.push('/whitepaper')}
              className="w-full py-3 bg-[#2A3B4D] rounded-xl text-white/80 hover:text-white transition-all border border-[#3DD2C0]/10 hover:border-[#3DD2C0]/30"
            >
              WHITEPAPER
            </button>
          </div>
        </div>

        {/* FAQ Section */}
        <FAQs />
      </div>
    </div>
  );
}