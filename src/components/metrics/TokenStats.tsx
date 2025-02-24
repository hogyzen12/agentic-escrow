import React, { useState, useEffect } from 'react';
import { useConnection } from '@solana/wallet-adapter-react';
import { getAccount } from '@solana/spl-token';

import { 
  GOV_TOKEN,
  AGENT_ADDRESS, 
  STAKED_JUP,
  VAULT_JUP
} from '@/utils/constants';

interface TokenStatsState {
  totalSupply: number;   // total minted govJUP
  agentBalance: number;  // how much govJUP the agent holds
  circulating: number;   // minted - agentBalance
  stakedJup: number;     // total JUP in staked account
  vaultJup: number;      // total JUP in vault
}

interface StatCardProps {
  title: string;
  value: string;
  suffix?: string;
}

const StatCard: React.FC<StatCardProps> = ({ title, value, suffix }) => (
  <div className="bg-gray-800/50 rounded-xl p-6 border border-emerald-400/20">
    <div className="text-gray-400 text-sm mb-2">{title}</div>
    <div className="text-white text-2xl font-bold flex items-baseline space-x-2">
      <span>{value}</span>
      {suffix && <span className="text-emerald-400 text-sm">{suffix}</span>}
    </div>
  </div>
);

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
        // govJUP token supply
        const supply = await connection.getTokenSupply(GOV_TOKEN);
        const totalGovJupRaw = Number(supply.value.amount);

        // Agent's govJUP holdings
        let totalAgentBalanceRaw = 0;
        const agentAccounts = await connection.getTokenAccountsByOwner(AGENT_ADDRESS, {
          mint: GOV_TOKEN
        });
        if (agentAccounts.value.length > 0) {
          const balances = await Promise.all(
            agentAccounts.value.map((account) =>
              connection.getTokenAccountBalance(account.pubkey)
            )
          );
          totalAgentBalanceRaw = balances.reduce(
            (sum, b) => sum + Number(b.value.amount),
            0
          );
        }

        // Staked JUP
        const stakedBalance = await connection.getTokenAccountBalance(STAKED_JUP);
        // Vault JUP
        const vaultBalance = await connection.getTokenAccountBalance(VAULT_JUP);

        // Decimals
        const decimals = supply.value.decimals;

        // Circulating govJUP is minted - agent's holdings
        const circRaw = totalGovJupRaw - totalAgentBalanceRaw;

        setStats({
          totalSupply: totalGovJupRaw / 10 ** decimals,
          agentBalance: totalAgentBalanceRaw / 10 ** decimals,
          circulating: circRaw / 10 ** decimals,
          stakedJup: Number(stakedBalance.value.amount) / 1e6, 
          vaultJup: Number(vaultBalance.value.amount) / 1e6
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
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
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
      {/* We no longer display “Backing Ratio” here */}
    </div>
  );
};

export default TokenStats;
