'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useConnection } from '@solana/wallet-adapter-react';
import { IconArrowUpRight } from '@tabler/icons-react';
import { motion, AnimatePresence } from 'framer-motion';
import { AGENT_ADDRESS } from '@/utils/constants';

interface TransactionItem {
  signature: string;
  timestamp: string;
  fee: number;
  description: string;
}

const ActivityStream = () => {
  const { connection } = useConnection();
  const [transactions, setTransactions] = useState<TransactionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const txCache = useRef<Map<string, TransactionItem>>(new Map());

  const fetchTransactions = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const sigInfos = await connection.getSignaturesForAddress(AGENT_ADDRESS, { limit: 50 });
      console.log('Fetched signatures for agent:', sigInfos.length);

      const txItems: TransactionItem[] = [];

      for (const sigInfo of sigInfos) {
        const signature = sigInfo.signature;
        // Use cached tx if available.
        if (txCache.current.has(signature)) {
          txItems.push(txCache.current.get(signature)!);
          continue;
        }

        try {
          const tx = await connection.getTransaction(signature, { maxSupportedTransactionVersion: 0 });
          if (!tx || !tx.meta) continue;
          const timestamp = sigInfo.blockTime 
            ? new Date(sigInfo.blockTime * 1000).toLocaleString() 
            : 'Unknown time';
          const fee = tx.meta.fee || 0;
          // Parse log messages to decide a description.
          let description = 'Transaction';
          if (tx.meta.logMessages) {
            if (tx.meta.logMessages.some(msg => msg.includes("Instruction: OpenPartialUnstaking"))) {
              description = 'Open Partial Unstaking';
            } else if (tx.meta.logMessages.some(msg => msg.includes("Instruction: withdrawPartialUnstaking"))) {
              description = 'Withdraw Partial Unstaking';
            }
            // Add more cases here if needed.
          }
          const txItem: TransactionItem = {
            signature,
            timestamp,
            fee,
            description,
          };
          txCache.current.set(signature, txItem);
          txItems.push(txItem);
        } catch (txErr) {
          console.error('Error fetching transaction for signature:', signature, txErr);
        }
      }
      setTransactions(txItems);
    } catch (err) {
      // ... error handling
    } finally {
      setLoading(false);
    }
  }, [connection]);

  useEffect(() => {
    fetchTransactions();
    const interval = setInterval(fetchTransactions, 15000);
    return () => clearInterval(interval);
  }, [fetchTransactions]);

  return (
    <div className="bg-gray-800/50 rounded-xl p-6 border border-emerald-400/20 mb-12">
      <h3 className="text-emerald-400 text-xl font-semibold mb-6">Live Activity</h3>
      
      {loading && transactions.length === 0 ? (
        <div className="text-gray-400 text-center py-4 flex items-center justify-center space-x-2">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-emerald-400"></div>
          <span>Loading transactions...</span>
        </div>
      ) : error ? (
        <div className="text-red-400 text-center py-4">
          Error loading transactions: {error}
        </div>
      ) : transactions.length === 0 ? (
        <div className="text-gray-400 text-center py-4">
          No recent transactions found
        </div>
      ) : (
        <AnimatePresence>
          {transactions.map((tx) => (
            <motion.div 
              key={tx.signature}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
              className="bg-gray-700/30 rounded-lg p-4 flex items-center justify-between mb-2"
            >
              <div className="flex items-center space-x-4">
                <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="text-white font-mono text-sm">
                      {tx.description}
                    </span>
                    <a 
                      href={`https://solscan.io/tx/${tx.signature}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-emerald-400 hover:text-emerald-300"
                    >
                      <IconArrowUpRight size={16} stroke={1.5} />
                    </a>
                  </div>
                  <div className="text-gray-400 text-xs flex items-center space-x-2">
                    <span>{tx.timestamp}</span>
                    <span>•</span>
                    <span className="font-mono">{tx.signature.slice(0, 8)}...</span>
                  </div>
                </div>
              </div>
              <div className="text-gray-400 text-sm">
                {(tx.fee / 1e9).toFixed(5)} SOL fee
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      )}
    </div>
  );
};

export default ActivityStream;
