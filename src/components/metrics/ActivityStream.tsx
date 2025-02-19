import React, { useState, useEffect } from 'react';
import { useConnection } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import { IconArrowUpRight } from '@tabler/icons-react';
import { motion, AnimatePresence } from 'framer-motion';

import { 
  AGENT_ADDRESS,
  ESCROW_PROGRAM_ID,
} from '@/utils/constants';

// Define the transaction interface
interface Transaction {
  signature: string;
  timestamp: string;
  source: string;
  description: string;
  fee: number;
}

const ActivityStream = () => {
  const { connection } = useConnection();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchTransactions = async () => {
      try {
        setLoading(true);
        console.log('Fetching transaction signatures...');
        
        // Get signatures
        const signatures = await connection.getSignaturesForAddress(
          ESCROW_PROGRAM_ID,
          { limit: 10 }
        );
        
        console.log('Found signatures:', signatures.length);

        if (signatures.length === 0) {
          setTransactions([]);
          setLoading(false);
          return;
        }

        // Get transaction details
        const txs = await Promise.all(
          signatures.map(async (sig) => {
            try {
              const tx = await connection.getTransaction(sig.signature, {
                maxSupportedTransactionVersion: 0
              });
              
              if (!tx) return null;

              // Handle potentially null blockTime
              const timestamp = sig.blockTime 
                ? new Date(sig.blockTime * 1000).toLocaleString()
                : 'Unknown time';

              // Basic transaction info
              return {
                signature: sig.signature,
                timestamp,
                source: 'Escrow',
                description: 'Escrow Transaction',
                fee: tx.meta?.fee || 0
              };
            } catch (err) {
              console.error('Error fetching transaction:', sig.signature, err);
              return null;
            }
          })
        );

        // Filter out null transactions and type assert the result
        const validTxs = txs.filter((tx): tx is Transaction => tx !== null);
        console.log('Valid transactions:', validTxs.length);
        
        setTransactions(validTxs);
        setError(null);
      } catch (err) {
        console.error('Error in fetchTransactions:', err);
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    };

    fetchTransactions();
    const interval = setInterval(fetchTransactions, 10000);
    return () => clearInterval(interval);
  }, [connection]);

  if (error) {
    return (
      <div className="bg-gray-800/50 rounded-xl p-6 border border-emerald-400/20 mb-12">
        <h3 className="text-emerald-400 text-xl font-semibold mb-6">Live Activity</h3>
        <div className="text-red-400 text-center py-4">
          Error loading transactions: {error}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-800/50 rounded-xl p-6 border border-emerald-400/20 mb-12">
      <h3 className="text-emerald-400 text-xl font-semibold mb-6">Live Activity</h3>
      
      <div className="space-y-3">
        {loading && transactions.length === 0 ? (
          <div className="text-gray-400 text-center py-4 flex items-center justify-center space-x-2">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-emerald-400"></div>
            <span>Loading transactions...</span>
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
                className="bg-gray-700/30 rounded-lg p-4 flex items-center justify-between"
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
                      <span className="text-emerald-400">{tx.source}</span>
                      <span>•</span>
                      <span className="font-mono">{tx.signature.slice(0, 8)}...</span>
                    </div>
                  </div>
                </div>
                <div className="text-gray-400 text-sm">
                  {(tx.fee / Math.pow(10, 9)).toFixed(5)} SOL fee
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
};

export default ActivityStream;