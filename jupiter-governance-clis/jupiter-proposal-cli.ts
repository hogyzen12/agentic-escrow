import { PublicKey, Connection, Keypair } from '@solana/web3.js';
import * as anchor from "@project-serum/anchor";
import { Buffer } from 'buffer';
import fs from 'fs';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

interface ProposalInfo {
  address: string;
  index: number;
  state: string;
  proposer: string;
  createdAt: string;
  activatedAt: string | null;
  votingEndsAt: string | null;
  title: string | null;
  descriptionLink: string | null;
  voteCounts: string[];
  quorumVotes: string;
}

class JupiterProposalCLI {
  static GOVERNANCE_PROGRAM_ID = new PublicKey("GovaE4iu227srtG2s3tZzB4RmWBzw8sTwrCLZz7kN7rY");
  static GOVERNOR = new PublicKey("EZjEbaSd1KrTUKHNGhyHj42PxnoK742aGaNNqb9Rcpgu");
  static RPC_URL = "https://delicate-side-reel.solana-mainnet.quiknode.pro/b5bdab46540fe358dd8cd93ec94c0a480bd11369/";

  connection: Connection;
  program: anchor.Program;
  wallet: Keypair;
  provider: anchor.AnchorProvider;

  constructor(walletPath: string) {
    this.connection = new Connection(JupiterProposalCLI.RPC_URL, "confirmed");
    
    // Load wallet
    const keypairData = new Uint8Array(JSON.parse(fs.readFileSync(walletPath, 'utf-8')));
    this.wallet = Keypair.fromSecretKey(keypairData);
    
    // Setup provider
    this.provider = new anchor.AnchorProvider(
      this.connection,
      new anchor.Wallet(this.wallet),
      { commitment: "confirmed" }
    );

    // Load IDL
    const idl = JSON.parse(fs.readFileSync('idl_gov.json', 'utf-8'));
    this.program = new anchor.Program(idl, JupiterProposalCLI.GOVERNANCE_PROGRAM_ID, this.provider);
  }

  async findProposalAddress(index: number): Promise<[PublicKey, number]> {
    return PublicKey.findProgramAddress(
      [
        Buffer.from("Proposal"),
        JupiterProposalCLI.GOVERNOR.toBuffer(),
        new anchor.BN(index).toArrayLike(Buffer, "le", 8)
      ],
      JupiterProposalCLI.GOVERNANCE_PROGRAM_ID
    );
  }

  async findProposalMetaAddress(proposal: PublicKey): Promise<[PublicKey, number]> {
    return PublicKey.findProgramAddress(
      [
        Buffer.from("ProposalMeta"),
        proposal.toBuffer()
      ],
      JupiterProposalCLI.GOVERNANCE_PROGRAM_ID
    );
  }

  async getProposalCount(): Promise<number> {
    try {
      const governorAccount: any = await this.program.account.governor.fetch(
        JupiterProposalCLI.GOVERNOR
      );

      if (governorAccount && 
          governorAccount.proposalCount && 
          typeof governorAccount.proposalCount.toNumber === 'function') {
        return governorAccount.proposalCount.toNumber();
      }
      throw new Error("Could not get proposal count");
    } catch (error) {
      console.error("Error getting proposal count:", error);
      throw error;
    }
  }

  getProposalState(proposal: any): string {
    const now = Math.floor(Date.now() / 1000);
    
    const toNumber = (bn: any): number => {
      return (bn && typeof bn.toNumber === 'function') ? bn.toNumber() : 0;
    };

    const canceledAt = toNumber(proposal?.canceledAt);
    const queuedAt = toNumber(proposal?.queuedAt);
    const votingEnds = toNumber(proposal?.votingEndsAt);
    const activated = toNumber(proposal?.activatedAt);

    if (canceledAt > 0) return 'Canceled';
    if (queuedAt > 0) return 'Queued';
    if (activated === 0) return 'Draft';
    if (activated > 0 && votingEnds > now) return 'Active';
    
    if (votingEnds <= now) {
      try {
        let totalVotes = new anchor.BN(0);
        if (proposal?.optionVotes && Array.isArray(proposal.optionVotes)) {
          totalVotes = proposal.optionVotes.reduce((acc: anchor.BN, vote: any) => {
            if (vote && typeof vote.toNumber === 'function') {
              return acc.add(vote);
            }
            return acc;
          }, new anchor.BN(0));
        }

        const quorum = proposal?.quorumVotes || new anchor.BN(0);
        return totalVotes.gte(quorum) ? 'Succeeded' : 'Defeated';
      } catch (e) {
        return 'Unknown';
      }
    }

    return 'Draft';
  }

  async getActiveProposals(): Promise<ProposalInfo[]> {
    try {
      const proposalCount = await this.getProposalCount();
      const proposals: ProposalInfo[] = [];

      for (let i = 0; i < proposalCount; i++) {
        try {
          const [proposalAddress] = await this.findProposalAddress(i);
          const data = await this.program.account.proposal.fetch(proposalAddress);
          
          // Try to get proposal metadata
          let meta = null;
          try {
            const [metaAddress] = await this.findProposalMetaAddress(proposalAddress);
            meta = await this.program.account.proposalMeta.fetch(metaAddress);
          } catch {
            // Meta might not exist
          }

          const toTimestamp = (bn: any): string | null => {
            const num = bn && typeof bn.toNumber === 'function' ? bn.toNumber() : 0;
            return num > 0 ? new Date(num * 1000).toLocaleString() : null;
          };

          const title = typeof meta?.title === 'string' ? meta.title : null;
          const description = typeof meta?.descriptionLink === 'string' ? meta.descriptionLink : null;

          proposals.push({
            address: proposalAddress.toString(),
            index: i,
            state: this.getProposalState(data),
            proposer: data?.proposer?.toString() || 'unknown',
            createdAt: toTimestamp(data?.createdAt) || 'unknown',
            activatedAt: toTimestamp(data?.activatedAt),
            votingEndsAt: toTimestamp(data?.votingEndsAt),
            title,
            descriptionLink: description,
            voteCounts: Array.isArray(data?.optionVotes) 
              ? data.optionVotes.map(v => v?.toString() || '0')
              : [],
            quorumVotes: data?.quorumVotes?.toString() || '0'
          });
        } catch (e) {
          console.log(`Error fetching proposal ${i}:`, e);
        }
      }

      return proposals;
    } catch (error) {
      console.error("Error getting proposals:", error);
      throw error;
    }
  }
}

async function main() {
  const parser = yargs(hideBin(process.argv))
    .command('proposals', 'List all proposals', (yargs) => {
      return yargs
        .option('state', {
          alias: 's',
          type: 'string',
          choices: ['all', 'active', 'draft', 'succeeded', 'defeated', 'queued', 'canceled'],
          default: 'all',
          description: 'Filter proposals by state'
        })
        .option('active', {
          alias: 'a',
          type: 'boolean',
          description: 'Show only active proposals',
          default: false
        })
        .option('json', {
          alias: 'j',
          type: 'boolean',
          description: 'Output in JSON format',
          default: false
        })
        .option('output', {
          alias: 'o',
          type: 'string',
          description: 'Save JSON output to file',
          default: ''
        });
    })
    .command('help', 'Display help information')
    .example('$0 proposals', 'List all proposals')
    .example('$0 proposals -s active', 'List only active proposals')
    .example('$0 proposals -a', 'Quick way to show active proposals')
    .example('$0 proposals --state succeeded', 'List succeeded proposals')
    .example('$0 proposals -j', 'Output proposals in JSON format')
    .example('$0 proposals -j -o proposals.json', 'Save proposals to JSON file')
    .epilogue('For more information, visit https://www.jupresear.ch/')
    .demandCommand(1, 'You must specify a command: proposals or help')
    .option('wallet', {
      alias: 'w',
      type: 'string',
      description: 'Path to wallet keypair file',
      required: true
    });

  const argv = await parser.parse();
  const command = argv._[0] as string;
  const walletPath = argv.wallet as string;

  const cli = new JupiterProposalCLI(walletPath);

  try {
    switch (command) {
      case 'help': {
        yargs.showHelp();
        break;
      }

      case 'proposals': {
        const state = argv.active ? 'active' : (argv.state as string);
        //console.log("\nFetching proposals...");
        const proposals = await cli.getActiveProposals();
        
        const filtered = state === 'all' 
          ? proposals 
          : proposals.filter(p => p.state.toLowerCase() === state.toLowerCase());

        if (argv.json || argv.output) {
          const jsonOutput = {
            timestamp: new Date().toISOString(),
            filter: {
              state: state,
              total: filtered.length
            },
            proposals: filtered.map(p => ({
              ...p,
              voteCounts: p.voteCounts.map(v => BigInt(v).toString()),
              quorumVotes: BigInt(p.quorumVotes).toString(),
              metadata: {
                href: p.descriptionLink,
                title: p.title
              }
            }))
          };

          // Output to file if specified
          if (argv.output && typeof argv.output === 'string') {
            fs.writeFileSync(
              argv.output,
              JSON.stringify(jsonOutput, null, 2),
              'utf-8'
            );
            console.log(`\nJSON output saved to ${argv.output}`);
          } else {
            // Output to console
            console.log(JSON.stringify(jsonOutput, null, 2));
          }
          return;
        }

        // Human readable output
        console.log("\nProposals:");
        filtered.forEach((p, i) => {
          console.log(`\n${i + 1}. Proposal ${p.index}`);
          console.log(`   Address: ${p.address}`);
          console.log(`   State: ${p.state}`);
          console.log(`   Title: ${p.title || 'No title'}`);
          if (p.state === 'Active') {
            console.log(`   Voting ends: ${p.votingEndsAt}`);
          }
          console.log(`   Current votes: ${p.voteCounts}`);
          console.log(`   Quorum required: ${p.quorumVotes}`);
          if (p.descriptionLink) {
            console.log(`   Description: ${p.descriptionLink}`);
          }
        });

        if (filtered.length === 0) {
          console.log(`\nNo ${state} proposals found.`);
        }
        break;
      }

      default: {
        console.error('Unknown command:', command);
        process.exit(1);
      }
    }
  } catch (err) {
    console.error("\nError:", err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error("\nError:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
}