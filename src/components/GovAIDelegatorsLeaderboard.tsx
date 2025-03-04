// components/GovAIDelegatorsLeaderboard.tsx
import { useConnection } from '@solana/wallet-adapter-react';
import { useGovAIDelegators } from '../hooks/useGovAIDelegators';

export function GovAIDelegatorsLeaderboard() {
  const { connection } = useConnection();
  const { delegators, totalStakedAmount, loading, error } = useGovAIDelegators(connection);

  if (loading) return <div className="text-white">Loading delegators...</div>;
  if (error) return <div className="text-red-500">Error: {error}</div>;

  return (
    <div className="bg-gray-800 p-6 rounded-lg shadow-lg text-white">
      <h2 className="text-2xl font-bold mb-4">GovAI Delegators Leaderboard</h2>
      <p className="text-lg mb-4">
        Total Delegated JUP: {totalStakedAmount.toLocaleString()} JUP
      </p>
      <ul className="space-y-4">
        {delegators.map((delegator, index) => (
          <li key={delegator.wallet} className="flex justify-between items-center">
            <span>
              {index + 1}. {delegator.wallet.slice(0, 6)}...{delegator.wallet.slice(-4)}
            </span>
            <span>{delegator.stakedAmount.toLocaleString()} JUP</span>
            <a
              href={`https://solscan.io/tx/${delegator.transaction}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-500 hover:underline"
            >
              View Tx
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}