import React, { useState, useEffect } from 'react';
import { useConnection } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import { getAccount } from '@solana/spl-token';

import { 
  GOV_TOKEN,
  AGENT_ADDRESS, 
  STAKED_JUP,
  VAULT_JUP,
  TOKEN_Y_MINT 
} from '@/utils/constants';

interface TokenStatsState {
  totalSupply: number;
  agentBalance: number;
  circulating: number;
  stakedJup: number;
  vaultJup: number;
}

interface StatCardProps {
  title: string;
  value: string;
  suffix: string;
}

const TokenStats = () => {
  const { connection } = useConnection();
  const [stats, setStats] = useState<TokenStatsState>({
    totalSupply: 0,
    agentBalance: 0,
    circulating: 0,
    stakedJup: 0,
    vaultJup: 0
  });

  useEffect(() => {
    const fetchTokenStats = async () => {
      try {
        // Get govJUP token supply
        const supply = await connection.getTokenSupply(GOV_TOKEN);
        
        // Get agent's token account
        const agentAccounts = await connection.getTokenAccountsByOwner(AGENT_ADDRESS, {
          mint: GOV_TOKEN
        });
        
        // Calculate total agent balance
        let totalAgentBalance = 0;
        if (agentAccounts.value.length > 0) {
          const balancePromises = agentAccounts.value.map(account => 
            connection.getTokenAccountBalance(account.pubkey)
          );
          const balances = await Promise.all(balancePromises);
          totalAgentBalance = balances.reduce((sum, balance) => 
            sum + Number(balance.value.amount), 0
          );
        }

        // Get staked JUP balance
        const stakedBalance = await connection.getTokenAccountBalance(STAKED_JUP);
        
        // Get vault JUP balance
        const vaultBalance = await connection.getTokenAccountBalance(VAULT_JUP);

        // Calculate circulating supply
        const circulating = Number(supply.value.amount) - totalAgentBalance;

        setStats({
          totalSupply: Number(supply.value.amount) / Math.pow(10, supply.value.decimals),
          agentBalance: totalAgentBalance / Math.pow(10, supply.value.decimals),
          circulating: circulating / Math.pow(10, supply.value.decimals),
          stakedJup: Number(stakedBalance.value.amount) / Math.pow(10, 6), // JUP has 6 decimals
          vaultJup: Number(vaultBalance.value.amount) / Math.pow(10, 6)
        });
      } catch (error) {
        console.error('Error fetching token stats:', error);
      }
    };

    fetchTokenStats();
    const interval = setInterval(fetchTokenStats, 30000);
    return () => clearInterval(interval);
  }, [connection]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-6 mb-12">
      <StatCard
        title="Total govJUP Supply"
        value={stats.totalSupply.toLocaleString(undefined, { maximumFractionDigits: 2 })}
        suffix="govJUP"
      />
      <StatCard
        title="Agent Holdings"
        value={stats.agentBalance.toLocaleString(undefined, { maximumFractionDigits: 2 })}
        suffix="govJUP"
      />
      <StatCard
        title="Circulating Supply"
        value={stats.circulating.toLocaleString(undefined, { maximumFractionDigits: 2 })}
        suffix="govJUP"
      />
      <StatCard
        title="Total JUP Staked"
        value={stats.stakedJup.toLocaleString(undefined, { maximumFractionDigits: 2 })}
        suffix="JUP"
      />
      <StatCard
        title="Available in Vault"
        value={stats.vaultJup.toLocaleString(undefined, { maximumFractionDigits: 2 })}
        suffix="JUP"
      />
    </div>
  );
};

const StatCard: React.FC<StatCardProps> = ({ title, value, suffix }) => (
  <div className="bg-gray-800/50 rounded-xl p-6 border border-emerald-400/20">
    <div className="text-gray-400 text-sm mb-2">{title}</div>
    <div className="text-white text-2xl font-bold flex items-baseline space-x-2">
      <span>{value}</span>
      <span className="text-emerald-400 text-sm">{suffix}</span>
    </div>
  </div>
);

export default TokenStats;