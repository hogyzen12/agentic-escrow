'use client';
import { useState, useEffect, useCallback } from 'react';
import { PublicKey, Connection } from '@solana/web3.js';
import { BorshInstructionCoder } from '@project-serum/anchor';
import { Buffer } from 'buffer';
import * as bs58 from 'bs58';
import idlLockedVoter from '@/utils/idl.json'; // Locked Voter IDL
import idlGov from '@/utils/idl_gov.json'; // Governance IDL

// Constants
const LOCKED_VOTER_PROGRAM_ID = new PublicKey(
  'voTpe3tHQ7AjQHMapgSue2HJFAh2cGsdokqN3XqmVSj'
);
const BASE_KEY = new PublicKey('bJ1TRoFo2P6UHVwqdiipp6Qhp2HaaHpLowZ5LHet8Gm');
const GOV_AI_PUBKEY = new PublicKey('govAiNGS59yJfvqdmvYb7Lzk7wUHYygqiKR58Z1VCag');
const GOV_PROGRAM_ID = new PublicKey('GovaE4iu227srtG2s3tZzB4RmWBzw8sTwrCLZz7kN7rY');

// Define the Activity interface
interface Activity {
  timestamp: number; // Unix timestamp of the transaction
  signature: string; // Transaction signature
  actionType: string; // e.g., "setVoteDelegate", "castVote", "increaseLockedAmount"
  details: object; // Decoded instruction data
}

export function useDelegationStatus(publicKey: PublicKey | null, connection: Connection) {
  const [delegationStatus, setDelegationStatus] = useState({
    escrowAddress: null as string | null,
    currentDelegate: null as string | null,
    stakedAmount: null as number | null,
    lastUpdated: null as Date | null,
  });
  const [govAIActivity, setGovAIActivity] = useState<Activity[] | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    if (!publicKey) return;
    setLoading(true);
    try {
      // Derive escrow address
      const [lockerAddress] = await PublicKey.findProgramAddress(
        [Buffer.from('Locker'), BASE_KEY.toBuffer()],
        LOCKED_VOTER_PROGRAM_ID
      );
      const [escrowAddress] = await PublicKey.findProgramAddress(
        [Buffer.from('Escrow'), lockerAddress.toBuffer(), publicKey.toBuffer()],
        LOCKED_VOTER_PROGRAM_ID
      );

      // Check escrow account and staked amount
      const escrowAccount = await connection.getAccountInfo(escrowAddress);
      let stakedAmount = null;
      if (escrowAccount) {
        const tokenAccounts = await connection.getTokenAccountsByOwner(escrowAddress, {
          mint: new PublicKey('JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN'), // JUP token mint
        });
        if (tokenAccounts.value.length > 0) {
          const tokenAccountInfo = await connection.getTokenAccountBalance(
            tokenAccounts.value[0].pubkey
          );
          stakedAmount = tokenAccountInfo.value.uiAmount || 0;
        }
      }

      // Update delegation status
      setDelegationStatus({
        escrowAddress: escrowAccount ? escrowAddress.toString() : null,
        currentDelegate: escrowAccount ? GOV_AI_PUBKEY.toString() : null, // Adjust if delegate is dynamic
        stakedAmount,
        lastUpdated: new Date(),
      });

      // Fetch activity if escrow exists
      if (escrowAccount) {
        const activity = await fetchEscrowActivity(escrowAddress, connection);
        setGovAIActivity(activity);
      } else {
        setGovAIActivity([]);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      setGovAIActivity([]);
    } finally {
      setLoading(false);
    }
  }, [publicKey, connection]);

  // Fetch data once on mount
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Refetch function to call after delegation
  const refetch = useCallback(() => {
    fetchData();
  }, [fetchData]);

  const fetchEscrowActivity = async (
    escrowAddress: PublicKey,
    connection: Connection
  ): Promise<Activity[]> => {
    const sigs = await connection.getSignaturesForAddress(escrowAddress, { limit: 100 });
    const activityList: Activity[] = [];
    const lockedVoterCoder = new BorshInstructionCoder(idlLockedVoter as any);
    const govCoder = new BorshInstructionCoder(idlGov as any);

    for (const sigInfo of sigs) {
      const tx = await connection.getParsedTransaction(sigInfo.signature, {
        maxSupportedTransactionVersion: 0,
      });
      if (!tx || !tx.blockTime) continue;

      let primaryTag = 'Other Action';
      let primaryDetails = {};

      const instructions = tx.transaction.message.instructions;
      for (const ix of instructions) {
        if ('data' in ix) {
          const decodedData = Buffer.from(bs58.decode(ix.data));
          let decoded;
          if (ix.programId.equals(LOCKED_VOTER_PROGRAM_ID)) {
            decoded = lockedVoterCoder.decode(decodedData);
          } else if (ix.programId.equals(GOV_PROGRAM_ID)) {
            decoded = govCoder.decode(decodedData);
          }
          if (decoded) {
            primaryTag = decoded.name;
            primaryDetails = decoded.data;
            break;
          }
        }
      }

      if (primaryTag !== 'Other Action') {
        activityList.push({
          timestamp: tx.blockTime,
          signature: sigInfo.signature,
          actionType: primaryTag,
          details: primaryDetails,
        });
      }
    }

    return activityList.sort((a, b) => b.timestamp - a.timestamp);
  };

  return { ...delegationStatus, govAIActivity, loading, refetch };
}