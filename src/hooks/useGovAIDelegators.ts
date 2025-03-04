import { useState, useEffect } from 'react';
import { Connection, PublicKey, ParsedInstruction, PartiallyDecodedInstruction } from '@solana/web3.js';
import { getAssociatedTokenAddress } from '@solana/spl-token';
import { BorshInstructionCoder } from '@project-serum/anchor';
import * as bs58 from 'bs58';
import idlLockedVoter from '@/utils/idl.json'; // Your Locked Voter IDL file

// Constants from your CLI script
const MARKER_ADDRESS = new PublicKey("D1GtsVdat3oLR7E9nEWmKKnEwzvBfNah4pUDhDmgQYMw");
const GOV_AI_PUBKEY = new PublicKey("govAiNGS59yJfvqdmvYb7Lzk7wUHYygqiKR58Z1VCag");
const LOCKED_VOTER_PROGRAM_ID = new PublicKey("voTpe3tHQ7AjQHMapgSue2HJFAh2cGsdokqN3XqmVSj");
const JUP_MINT = new PublicKey("JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN");
const UNTIL_SIGNATURE = "27objd9nHkNkFAcBmCiGR7b7jJPeMUzxie7miDtE5BoFxFv23QBCLafumHkxGsZwsszDHbMhoSaUMMBwK82woGqR";

interface DelegatorData {
  wallet: string;
  stakedAmount: number;
  timestamp: number;
  transaction: string;
  escrow: string;
  ata: string;
}

export function useGovAIDelegators(connection: Connection) {
  const [delegators, setDelegators] = useState<DelegatorData[]>([]);
  const [totalStakedAmount, setTotalStakedAmount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchDelegators = async () => {
      setLoading(true);
      setError(null);
      try {
        // Fetch transaction signatures
        const signatures = await connection.getSignaturesForAddress(MARKER_ADDRESS, {
          until: UNTIL_SIGNATURE,
          limit: 1000,
        });

        const delegatorMap = new Map<string, DelegatorData>();
        const instructionCoder = new BorshInstructionCoder(idlLockedVoter as any);

        for (const sigInfo of signatures) {
          const tx = await connection.getParsedTransaction(sigInfo.signature, {
            maxSupportedTransactionVersion: 0,
            commitment: 'confirmed',
          });
          if (!tx || !tx.blockTime) continue;

          let hasMarkerTransfer = false;
          let delegatorWallet: PublicKey | null = null;
          let escrowAddress: PublicKey | null = null;

          const instructions = tx.transaction.message.instructions;
          for (const ix of instructions) {
            // Check for marker transfer
            if ('parsed' in ix && ix.parsed.type === "transfer") {
              const transferInfo = ix.parsed.info;
              if (
                transferInfo.destination === MARKER_ADDRESS.toString() &&
                transferInfo.lamports === 42000000
              ) {
                hasMarkerTransfer = true;
                delegatorWallet = new PublicKey(transferInfo.source);
              }
            }

            // Decode Locked Voter instructions
            if (ix.programId.equals(LOCKED_VOTER_PROGRAM_ID)) {
              if ('data' in ix) {
                const data = Buffer.from(bs58.decode(ix.data));
                const decodedIx = instructionCoder.decode(data);
                if (decodedIx && decodedIx.name === "setVoteDelegate") {
                  const newDelegateBytes = (decodedIx.data as { newDelegate: Buffer }).newDelegate;
                  if (newDelegateBytes && new PublicKey(newDelegateBytes).equals(GOV_AI_PUBKEY)) {
                    escrowAddress = new PublicKey(ix.accounts[0]); // Escrow account
                    delegatorWallet = new PublicKey(ix.accounts[1]); // Escrow owner
                  }
                }
              }
            }
          }

          if (hasMarkerTransfer && escrowAddress && delegatorWallet) {
            const ata = await getAssociatedTokenAddress(JUP_MINT, escrowAddress, true);
            const tokenAccountInfo = await connection.getTokenAccountBalance(ata);
            const stakedAmount = tokenAccountInfo.value.uiAmount || 0;
            const timestamp = tx.blockTime;
            const delegatorKey = delegatorWallet.toString();

            const existing = delegatorMap.get(delegatorKey);
            if (!existing || existing.timestamp < timestamp) {
              delegatorMap.set(delegatorKey, {
                wallet: delegatorKey,
                stakedAmount,
                timestamp,
                transaction: sigInfo.signature,
                escrow: escrowAddress.toString(),
                ata: ata.toString(),
              });
            }
          }
        }

        // Sort delegators by staked amount (highest to lowest)
        const delegatorList = Array.from(delegatorMap.values()).sort(
          (a, b) => b.stakedAmount - a.stakedAmount
        );
        const total = delegatorList.reduce((sum, d) => sum + d.stakedAmount, 0);

        setDelegators(delegatorList);
        setTotalStakedAmount(total);
      } catch (err) {
        setError('Failed to fetch delegators');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchDelegators();
  }, [connection]);

  return { delegators, totalStakedAmount, loading, error };
}