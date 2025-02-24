'use client';

import { useConnection } from '@solana/wallet-adapter-react';
import { useState, useEffect } from 'react';
import { PublicKey } from '@solana/web3.js';
import { getAccount } from '@solana/spl-token';
import * as anchor from '@project-serum/anchor';
import {
  IconArrowUpRight,
  IconChartPie,
  IconWallet,
  IconLock
} from '@tabler/icons-react';
import TokenStats from '@/components/metrics/TokenStats';
import ActivityStream from '@/components/metrics/ActivityStream';
import { useInterval } from '@/hooks/useInterval';
import {
  STAKED_JUP,
  VAULT_JUP,
  GOV_TOKEN,
  ESCROW_PROGRAM_ID,
  AGENT_ADDRESS
} from '@/utils/constants';
import idl from '@/utils/jupiter_staking_idl.json';

interface PendingUnstake {
  address: string;
  amount: number;
  submittedAt: number;
  unlockTime: number;
}

interface StatsCardProps {
  title: string;
  value: string | number;
  suffix?: string;
  subtitle?: string;
  icon?: React.ReactNode;
}

const StatsCard: React.FC<StatsCardProps> = ({
  title,
  value,
  suffix,
  subtitle,
  icon
}) => (
  <div className="bg-[#1E2C3D] rounded-xl p-6">
    <div className="flex items-start justify-between mb-2">
      <div className="text-white/60 text-sm">{title}</div>
      {icon && <div className="text-[#3DD2C0]">{icon}</div>}
    </div>
    <div className="flex items-baseline gap-2">
      <div className="text-2xl font-semibold text-white">{value}</div>
      {suffix && <div className="text-[#3DD2C0] text-sm">{suffix}</div>}
    </div>
    {subtitle && <div className="text-white/40 text-sm mt-2">{subtitle}</div>}
  </div>
);

// Helper: convert seconds into human-readable time remaining.
function formatTimeRemaining(seconds: number): string {
  if (seconds <= 0) return 'Unlocked';
  const days = Math.floor(seconds / (24 * 3600));
  const hours = Math.floor((seconds % (24 * 3600)) / 3600);
  return days > 0
    ? `${days} day${days !== 1 ? 's' : ''}`
    : `${hours} hour${hours !== 1 ? 's' : ''}`;
}

export default function FeedPage() {
  const { connection } = useConnection();
  const [stats, setStats] = useState({
    totalValue: 0,       // Total Value Locked (USD approximation)
    totalJupStaked: 0,   // Staked JUP
    vaultJup: 0,         // JUP in the vault
    delegatedGovJup: 0   // Total minted govJUP
  });
  const [pendingUnstakes, setPendingUnstakes] = useState<PendingUnstake[]>([]);
  const [agentHoldings, setAgentHoldings] = useState(0);
  const [circulatingGovJup, setCirculatingGovJup] = useState(0);

  // State to collect debug logs.
  const [debugLogs, setDebugLogs] = useState<string[]>([]);
  const [showDebug, setShowDebug] = useState<boolean>(false);

  // Helper function to add a debug log.
  const addDebugLog = (msg: string) => {
    setDebugLogs(prev => [...prev, msg]);
    console.debug(msg);
  };

  const fetchStats = async () => {
    try {
      // 1) Get govJUP supply.
      const govTokenSupply = await connection.getTokenSupply(GOV_TOKEN);
      const totalGovJupRaw =
        Number(govTokenSupply.value.amount) / 10 ** govTokenSupply.value.decimals;

      // 2) Get Agent’s total govJUP holdings.
      let totalAgentBalance = 0;
      const agentAccounts = await connection.getTokenAccountsByOwner(AGENT_ADDRESS, {
        mint: GOV_TOKEN
      });
      if (agentAccounts.value.length > 0) {
        const balances = await Promise.all(
          agentAccounts.value.map((a) => connection.getTokenAccountBalance(a.pubkey))
        );
        totalAgentBalance = balances.reduce((sum, b) => sum + Number(b.value.amount), 0);
        totalAgentBalance /= 10 ** govTokenSupply.value.decimals;
      }

      // "Circulating" = total minted - agent holdings.
      const circ = totalGovJupRaw - totalAgentBalance;

      // 3) Get JUP staked & vault balances.
      const [stakedAccount, vaultAccount] = await Promise.all([
        getAccount(connection, STAKED_JUP),
        getAccount(connection, VAULT_JUP)
      ]);
      const stakedBalance = Number(stakedAccount.amount) / 1e6;
      const vaultBalance = Number(vaultAccount.amount) / 1e6;

      setStats({
        totalValue: stakedBalance,
        totalJupStaked: stakedBalance,
        vaultJup: vaultBalance,
        delegatedGovJup: totalGovJupRaw
      });
      setAgentHoldings(totalAgentBalance);
      setCirculatingGovJup(circ);
      addDebugLog(`Stats fetched: staked=${stakedBalance}, vault=${vaultBalance}, totalGovJup=${totalGovJupRaw}`);
    } catch (error) {
      addDebugLog(`Error fetching stats: ${error}`);
    }
  };


  // Compute Return on Delegation: (Total JUP Staked / Circulating govJUP) - 1.
  let returnOnDelegation = 0;
  if (circulatingGovJup > 0) {
    returnOnDelegation = stats.totalJupStaked / circulatingGovJup - 1;
  }

  return (
    <div className="min-h-screen bg-[#0D1117]">
      <div className="container mx-auto px-6 py-12">
        {/* Title */}
        <div className="mb-12">
          <h1 className="text-3xl font-bold mb-4">
            <span className="text-[#3DD2C0]">GOVAI</span>
            <span className="text-white"> FEED</span>
          </h1>
          <p className="text-white/70">
            Real-time metrics and activity from the GovAI ecosystem
          </p>
        </div>

        {/* Top row stats */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
          <StatsCard
            title="Total Value Locked"
            value={`$${stats.totalValue.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}`}
            subtitle="Based on current JUP price"
            icon={<IconChartPie size={24} />}
          />
          <StatsCard
            title="Total JUP Staked"
            value={stats.totalJupStaked.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
            suffix="JUP"
            subtitle="Currently earning rewards"
            icon={<IconWallet size={24} />}
          />
          <StatsCard
            title="Available in Vault"
            value={stats.vaultJup.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
            suffix="JUP"
            subtitle="For early unstaking"
            icon={<IconLock size={24} />}
          />
          <StatsCard
            title="Pending Unstakes"
            value={pendingUnstakes.length}
            subtitle="Processing in 30-day window"
            icon={<IconArrowUpRight size={24} />}
          />
        </div>

        {/* Expanded Return on Delegation */}
        <div className="grid gap-6 mb-12">
          <div className="bg-[#1E2C3D] rounded-xl p-6">
            <div className="flex justify-between items-center mb-2">
              <div className="text-white/60 text-sm">Return on Delegation</div>
              {circulatingGovJup > 0 ? (
                <div className="text-[#3DD2C0] text-sm font-semibold">
                  {(returnOnDelegation * 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%
                </div>
              ) : (
                <div className="text-white text-sm">No delegation data</div>
              )}
            </div>
            {circulatingGovJup > 0 && (
              <>
                <div className="w-full bg-gray-800 rounded-full h-2.5 mb-4">
                  <div
                    className="bg-gradient-to-r from-green-400 to-blue-500 h-2.5 rounded-full"
                    style={{ width: `${Math.min(100, (returnOnDelegation + 1) * 100)}%` }}
                  ></div>
                </div>
                <div className="text-white text-sm">
                  <span className="font-medium">Delegation Efficiency: </span>
                  {returnOnDelegation >= 0
                    ? 'Staked tokens are earning above the baseline!'
                    : 'Staked tokens are below the expected 1:1 backing.'}
                </div>
              </>
            )}
            <div className="text-white/40 text-xs mt-2">
              Calculated as (Total JUP Staked / Circulating govJUP) - 1
            </div>
          </div>
        </div>

        {/* Slimmed-down Token Stats */}
        <div className="mb-12">
          <TokenStats />
        </div>

        {/* Detailed Pending Unstakes */}
        {pendingUnstakes.length > 0 && (
          <div className="mb-12 bg-[#1E2C3D] rounded-xl p-6">
            <h2 className="text-white/60 text-sm mb-4">Pending Unstakes (detailed)</h2>
            <div className="space-y-4">
              {pendingUnstakes.map((unstake) => {
                const nowSec = Math.floor(Date.now() / 1000);
                const timeRemainingSec = unstake.unlockTime - nowSec;
                const timeRemainingStr = formatTimeRemaining(timeRemainingSec);
                const unlockDate = new Date(unstake.unlockTime * 1000);
                const unlockDateString = unlockDate.toLocaleString(undefined, {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit'
                });
                return (
                  <div key={unstake.address} className="bg-[#2A3B4D] rounded-lg p-4">
                    <div className="text-white font-medium">
                      {unstake.amount.toFixed(6)} JUP
                    </div>
                    <div className="text-white/40 text-sm mt-1">
                      Unlock date: {unlockDateString}
                    </div>
                    <div className="text-white/40 text-sm mt-1">
                      Time remaining: {timeRemainingStr}
                    </div>
                    <div className="text-white/40 text-sm mt-1">
                      ID: {unstake.address}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Live Activity Stream */}
        <ActivityStream />

        {/* Debug Panel Toggle */}
        <div className="mt-8">
          <button
            className="px-4 py-2 bg-gray-700 text-white rounded"
            onClick={() => setShowDebug(!showDebug)}
          >
            {showDebug ? 'Hide Debug Logs' : 'Show Debug Logs'}
          </button>
          {showDebug && (
            <div className="mt-4 p-4 bg-black text-green-300 text-xs rounded max-h-96 overflow-y-auto">
              {debugLogs.map((log, idx) => (
                <div key={idx}>{log}</div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
