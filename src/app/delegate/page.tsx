'use client';

import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { useState, useEffect, useCallback } from 'react';
import TokenStats from '@/components/metrics/TokenStats';
import {
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  Keypair
} from '@solana/web3.js';
import { useRouter } from 'next/navigation';
import BN from 'bn.js';
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
import { IconQuestionMark } from '@tabler/icons-react';

import { TOKEN_X_MINT, TOKEN_Y_MINT, ESCROW_PROGRAM_ID, STAKED_JUP } from '@/utils/constants';
import { notify } from '../components/ui/notify';
import { useGetTokenAccounts, useTokenBalance } from '@/hooks/use-token-accounts';
import { ESCROW_ACCOUNT_DATA_LAYOUT } from '@/utils/escrow';
import { useInterval } from '@/hooks/useInterval';

// Staking window end date - February 20th, 2024 at midnight UTC
const STAKING_END_DATE = new Date('2025-02-28T00:00:00Z');

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
    <div className="text-center p-2 bg-gray-700 rounded-lg mb-4">
      <span className="text-emerald-400 font-semibold">Staking Window Closes In: </span>
      <span className="text-white">{timeLeft}</span>
    </div>
  );
}

export default function DelegatePage() {
  const router = useRouter();
  const { connection } = useConnection();
  const { publicKey, signTransaction } = useWallet();
  const [swapAmount, setSwapAmount] = useState<string>("");
  const [selectedFaq, setSelectedFaq] = useState<number | null>(null);
  const [totalStaked, setTotalStaked] = useState<number | null>(null);

  const faqs = [
    {
      question: "What exactly does the GovAI bot do?",
      answer: "GovAI is a governance-focused AI Agent designed to facilitate JUP staking, delegation, and voting participation. The AI Agent stakes and votes on behalf of the users and decentralizes the rewards for them."
    },
    {
      question: "How does staking with the AI Agent work?",
      answer: "Users stake their JUP tokens with GovAI and receive govJUP representing their delegated JUP. The AI Agent votes on behalf of users and ensures their influence in governance while they earn ASR rewards."
    },
    {
      question: "What is the staking window?",
      answer: "Users can stake only during the 'staking window,' which opens after ASR rewards become claimable and closes before the next vote. This ensures all participants JUP contributes equally to the same set of votes."
    },
    {
      question: "Can I unstake my JUP early, and are there any fees?",
      answer: "Yes, users can unstake their JUP early by withdrawing from the vault, but a fee applies. Early unstaking incurs a maximum fee of 20%, while waiting for 30 days reduces this fee to 0.1%. If the vault is depleted, users must wait the full 30-day period."
    },
    { question: "What happens if the vault runs out of funds?", 
      answer: 'If too many users withdraw early, the vault may be depleted. In this case, users have two options:\n- Wait for the vault to be refilled (though this is not guaranteed)\n- Undergo the standard 30-day unstaking period to retrieve their funds' 
    }
  ];

  // Get token accounts for the connected wallet
  const { data: tokenAccounts, refetch: refetchTokenAccounts } = useGetTokenAccounts({
    address: publicKey,
  });

  // Find token accounts
  const tokenXAccount = tokenAccounts?.find(
    (account) => account.account.data.parsed.info.mint === TOKEN_X_MINT.toString()
  );
  const tokenYAccount = tokenAccounts?.find(
    (account) => account.account.data.parsed.info.mint === TOKEN_Y_MINT.toString()
  );

  // Get token balances with refetch capability
  const { data: balanceX, refetch: refetchBalanceX } = useTokenBalance({
    tokenAccount: tokenXAccount ? new PublicKey(tokenXAccount.pubkey) : null,
  });
  const { data: balanceY, refetch: refetchBalanceY } = useTokenBalance({
    tokenAccount: tokenYAccount ? new PublicKey(tokenYAccount.pubkey) : null,
  });

  // Fetch total staked JUP
  const fetchTotalStaked = useCallback(async () => {
    try {
      const stakedTokenAccount = await getAssociatedTokenAddress(
        TOKEN_Y_MINT,
        STAKED_JUP,
        true
      );
      
      const accountInfo = await getAccount(connection, STAKED_JUP);
      const balance = Number(accountInfo.amount);
      setTotalStaked(balance / Math.pow(10, 6)); // Assuming 9 decimals for JUP
    } catch (error) {
      console.error('Error fetching total staked:', error);
      setTotalStaked(0);
    }
  }, [connection]); // include connection if used inside

  // Refresh data every 15 seconds
  useInterval(() => {
    refetchTokenAccounts();
    refetchBalanceX();
    refetchBalanceY();
    fetchTotalStaked();
  }, 15000);

  // Initial fetch
  useEffect(() => {
    fetchTotalStaked();
  }, [fetchTotalStaked]);

  const handleInitializeEscrow = async () => {
    if (!publicKey || !signTransaction || !tokenYAccount) {
      notify({ 
        type: 'error', 
        message: 'Please connect your wallet and ensure you have a JUP token account' 
      });
      return;
    }

    const DECIMALS = 6;
    const jupAmount = parseFloat(swapAmount);
    if (isNaN(jupAmount) || jupAmount <= 0) {
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
      
      notify({ type: 'success', message: 'Processing delegation...' });
      
      const confirmation = await connection.confirmTransaction(txId, 'confirmed');
      if (confirmation.value.err) {
        throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
      }

      notify({ 
        type: 'success', 
        message: `Successfully delegated ${jupAmount} JUP to GovAI` 
      });

    } catch (error: any) {
      console.error('Delegation error:', error);
      notify({ type: 'error', message: `Failed to delegate: ${error.message}` });
    }
  };

  const isStakingWindowOpen = () => {
    return new Date() < STAKING_END_DATE;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 py-12 px-4">
      <div className="container mx-auto max-w-6xl">
        <div className="mb-12">
          <h1 className="text-3xl font-bold text-white mb-2">
            <span className="text-emerald-400">STAKE</span> YOUR JUP WITH GOVAI
          </h1>
          <p className="text-gray-400">
            Stake your JUP with GovAI, the expert AI who deals with governance for you.
          </p>
          
          {/* Total Staked Display */}
          <div className="mt-6 bg-gray-800/50 rounded-xl p-4 border border-emerald-400/20">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-emerald-400 text-lg">Total JUP Staked with GovAI</h3>
                <p className="text-gray-400 text-sm">Trusted by the community</p>
              </div>
              <div className="text-right">
                <span className="text-2xl font-bold text-white">
                  {totalStaked ? totalStaked.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '0.00'}
                </span>
                <span className="text-gray-400 ml-2">JUP</span>
              </div>
            </div>
            <div className="mt-2 bg-gray-700/50 rounded-full h-2">
              <div 
                className="bg-emerald-400 h-2 rounded-full transition-all duration-1000"
                style={{ width: `${Math.min((totalStaked || 0) / 1000000 * 100, 100)}%` }}
              ></div>
            </div>
          </div>
        </div>

        {/* Token Statistics */}
        <TokenStats />  

        <div className="grid lg:grid-cols-2 gap-8">
          {/* Left Column - Info and Benefits */}
          <div className="space-y-6">
            <div className="text-white space-y-4 bg-gray-800/50 p-6 rounded-xl border border-emerald-400/20">
              <div className="flex items-start space-x-2">
                <div className="w-2 h-2 bg-emerald-400 rounded-full mt-2 animate-pulse"></div>
                <p>Vote on your behalf, so you do not have to track proposals or spend time analyzing them.</p>
              </div>
              <div className="flex items-start space-x-2">
                <div className="w-2 h-2 bg-emerald-400 rounded-full mt-2 animate-pulse"></div>
                <p>Collect all types of rewards from governance and staking activities.</p>
              </div>
              <div className="flex items-start space-x-2">
                <div className="w-2 h-2 bg-emerald-400 rounded-full mt-2 animate-pulse"></div>
                <p>Distribute a share of the fees collected from the service and early redemptions to other stakers.</p>
              </div>
            </div>

            <button
              onClick={() => router.push('/whitepaper')}
              className="btn btn-outline text-white hover:bg-gray-700 w-full md:w-auto border-emerald-400/50 hover:border-emerald-400"
            >
              WHITEPAPER
            </button>

            {/* FAQ Section */}
            <div className="mt-8">
              <h2 className="text-white text-xl font-bold mb-4">FAQ</h2>
              <div className="space-y-4">
                {faqs.map((faq, index) => (
                  <div 
                    key={index} 
                    className="bg-gray-800/50 rounded-lg p-4 border border-emerald-400/20 hover:border-emerald-400/40 transition-all"
                  >
                    <button
                      className="flex justify-between items-center w-full text-white"
                      onClick={() => setSelectedFaq(selectedFaq === index ? null : index)}
                    >
                      <span className="text-left">{faq.question}</span>
                      <IconQuestionMark className={`w-5 h-5 transform transition-transform ${
                        selectedFaq === index ? 'rotate-180' : ''
                      }`} />
                    </button>
                    {selectedFaq === index && (
                      <p className="mt-4 text-gray-400">{faq.answer}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right Column - Staking Interface */}
          <div className="bg-gray-800/80 rounded-xl p-6 h-fit border border-emerald-400/20">
            <CountdownTimer />
            
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <div>
                  <div className="text-gray-400">govJUP Balance</div>
                  <div className="text-2xl text-white">{balanceX ?? '0.00'}</div>
                </div>
                <div className="text-right">
                  <div className="text-gray-400">JUP Balance</div>
                  <div className="text-2xl text-white">{balanceY ?? '0.00'}</div>
                </div>
              </div>

              <div className="form-control">
                <div className="flex items-center space-x-2 bg-gray-700/50 rounded-lg p-4 border border-emerald-400/20">
                  <input 
                    type="number"
                    min="0"
                    step="any"
                    value={swapAmount}
                    onChange={(e) => setSwapAmount(e.target.value)}
                    className="bg-transparent text-white text-lg w-full focus:outline-none"
                    placeholder="0.00"
                    disabled={!isStakingWindowOpen()}
                  />
                  <span className="text-white">JUP</span>
                </div>
              </div>

              <button 
                className={`btn btn-lg w-full bg-emerald-500 hover:bg-emerald-600 border-none text-lg
                  animate-pulse hover:animate-none transform transition-transform hover:scale-105
                  ${!isStakingWindowOpen() ? 'opacity-50 cursor-not-allowed' : ''}`}
                onClick={handleInitializeEscrow}
                disabled={
                  !isStakingWindowOpen() ||
                  !publicKey ||
                  !balanceY ||
                  isNaN(parseFloat(swapAmount)) ||
                  parseFloat(swapAmount) <= 0 ||
                  parseFloat(swapAmount) > (balanceY || 0)
                }
              >
                {!isStakingWindowOpen() ? (
                  'Staking Window Closed'
                ) : !publicKey ? (
                  'Connect Wallet'
                ) : !balanceY ? (
                  'No JUP Balance'
                ) : parseFloat(swapAmount) > (balanceY || 0) ? (
                  'Insufficient JUP Balance'
                ) : (
                  'STAKE YOUR JUP'
                )}
              </button>

              <div className="flex justify-between text-sm text-gray-400 bg-gray-700/30 p-3 rounded-lg">
                <span>ASR + EARLY UNSTAKING FEE: 20%</span>
                <span>BASE APR: ≈20%</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}