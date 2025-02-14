import { useQuery } from '@tanstack/react-query';
import { useConnection } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from '@solana/spl-token';

export function useGetTokenAccounts({ address }: { address: PublicKey | null }) {
  const { connection } = useConnection();

  return useQuery({
    queryKey: ['get-token-accounts', { endpoint: connection.rpcEndpoint, address }],
    queryFn: async () => {
      if (!address) return [];
      
      const [tokenAccounts, token2022Accounts] = await Promise.all([
        connection.getParsedTokenAccountsByOwner(address, {
          programId: TOKEN_PROGRAM_ID,
        }),
        connection.getParsedTokenAccountsByOwner(address, {
          programId: TOKEN_2022_PROGRAM_ID,
        }),
      ]);
      
      return [...tokenAccounts.value, ...token2022Accounts.value];
    },
    enabled: !!address,
  });
}

export function useTokenBalance({ tokenAccount }: { tokenAccount: PublicKey | null }) {
  const { connection } = useConnection();

  return useQuery({
    queryKey: ['token-balance', { endpoint: connection.rpcEndpoint, tokenAccount }],
    queryFn: async () => {
      if (!tokenAccount) return null;
      const balance = await connection.getTokenAccountBalance(tokenAccount);
      return balance.value.uiAmount;
    },
    enabled: !!tokenAccount,
  });
}