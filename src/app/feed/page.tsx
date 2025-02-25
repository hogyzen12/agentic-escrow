'use client';

import { useConnection } from '@solana/wallet-adapter-react';
import { useState, useEffect, useCallback } from 'react';
import { PublicKey } from '@solana/web3.js';
import { getAccount } from '@solana/spl-token';
import {
  IconChartPie,
  IconWallet,
  IconLock
} from '@tabler/icons-react';
import TokenStats from '@/components/metrics/TokenStats';
import ActivityStream from '@/components/metrics/ActivityStream';
import {
  STAKED_JUP,
  VAULT_JUP
} from '@/utils/constants';

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
    totalValue: 0,       // TVL in USD
    totalJupStaked: 0,   // JUP staked
    vaultJup: 0,         // JUP in vault (for instant unstaking)
  });
  const [pendingUnstakes, setPendingUnstakes] = useState<PendingUnstake[]>([]);

  // Debug logs
  const [debugLogs, setDebugLogs] = useState<string[]>([]);
  const [showDebug, setShowDebug] = useState<boolean>(false);

  const addDebugLog = (msg: string) => {
    setDebugLogs((prev) => [...prev, msg]);
    console.debug(msg);
  };

  /**
   * fetchStats
   * Fetches the current JUP price from jup.ag and the staked/vault balances.
   */
  const fetchStats = useCallback(async () => {
    try {
      if (!connection) {
        addDebugLog('No valid connection yet.');
        return;
      }

      // 1) Fetch the current JUP price
      const priceRes = await fetch(
        'https://api.jup.ag/price/v2?ids=JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN,So11111111111111111111111111111111111111112'
      );
      const priceJson = await priceRes.json();

      // If the JUP price is missing, fallback to 0
      const jupPriceStr = priceJson.data?.['JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN']?.price;
      const jupPrice = jupPriceStr ? parseFloat(jupPriceStr) : 0;

      // 2) Attempt to get staked JUP & vault JUP
      // If these token accounts do not exist on the network you're connected to, 
      // getAccount() will throw an error or return 0.
      let stakedBalance = 0;
      let vaultBalance = 0;

      try {
        const stakedAccount = await getAccount(connection, STAKED_JUP);
        stakedBalance = Number(stakedAccount.amount) / 1e6;
      } catch (err) {
        addDebugLog(`Could not find STAKED_JUP account: ${err}`);
      }

      try {
        const vaultAccount = await getAccount(connection, VAULT_JUP);
        vaultBalance = Number(vaultAccount.amount) / 1e6;
      } catch (err) {
        addDebugLog(`Could not find VAULT_JUP account: ${err}`);
      }

      // 3) Compute TVL = stakedBalance * jupPrice
      const tvl = stakedBalance * jupPrice;

      setStats({
        totalValue: tvl,
        totalJupStaked: stakedBalance,
        vaultJup: vaultBalance
      });

      addDebugLog(
        `Stats fetched -> staked=${stakedBalance}, vault=${vaultBalance}, jupPrice=${jupPrice}, TVL=${tvl}`
      );
    } catch (error) {
      addDebugLog(`Error fetching stats: ${error}`);
    }
  }, [connection]);

  // Run fetchStats on component mount (and whenever connection changes)
  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

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

        {/* Top row stats (3 columns) */}
        <div className="grid md:grid-cols-3 lg:grid-cols-3 gap-6 mb-12">
          <StatsCard
            title="Total Value Locked"
            value={`$${stats.totalValue.toLocaleString(undefined, {
              minimumFractionDigits: 3,
              maximumFractionDigits: 3
            })}`}
            subtitle="Based on current JUP price"
            icon={<IconChartPie size={24} />}
          />
          <StatsCard
            title="Total JUP Staked"
            value={stats.totalJupStaked.toLocaleString(undefined, {
              minimumFractionDigits: 3,
              maximumFractionDigits: 3
            })}
            suffix="JUP"
            subtitle="Currently earning rewards"
            icon={<IconWallet size={24} />}
          />
          <StatsCard
            title="Available for Instant Unstaking"
            value={stats.vaultJup.toLocaleString(undefined, {
              minimumFractionDigits: 3,
              maximumFractionDigits: 3
            })}
            suffix="JUP"
            subtitle="Vault reserves"
            icon={<IconLock size={24} />}
          />
        </div>

        {/* Slimmed-down Token Stats */}
        <div className="mb-12">
          <TokenStats />
        </div>

        {/* Detailed Pending Unstakes (if any) */}
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
