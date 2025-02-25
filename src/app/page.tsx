'use client';

import { useRouter } from 'next/navigation';
import { 
  IconBrandGithub, 
  IconBrandTwitter, 
  IconBook,
  IconCpu,
  IconLock,
  IconTerminal,
  IconClock,
  IconBrain,
  IconBrandTwitter as IconTwitter,
  IconMessageCircle2,
  IconShieldCheck
} from '@tabler/icons-react';
import Image from 'next/image';

export default function LandingPage() {
  const router = useRouter();

  // Data for Completed Features
  const completedFeatures = [
    {
      title: 'Agent Frontend',
      description: 'A sleek, user-friendly dashboard for delegating votes, managing stakes, and monitoring GovAI’s governance actions in real-time.',
      icon: IconCpu
    },
    {
      title: 'Escrow from Participants',
      description: 'A trustless mechanism that securely holds your staked tokens while GovAI executes votes on your behalf, ensuring your assets remain protected.',
      icon: IconLock
    },
    {
      title: 'Jupiter DAO CLI Toolkit',
      description: 'A robust command-line tool that simplifies interactions with the Jupiter DAO, perfect for power users and developers.',
      icon: IconTerminal
    },
    {
      title: 'Instant Unstaking',
      description: 'Need liquidity? Exit your stake on a user-defined schedule for a fee, maintaining flexibility without sacrificing your ASR rewards.',
      icon: IconClock
    }
  ];

  // Data for Upcoming Features
  const upcomingFeatures = [
    {
      title: 'Chain of Thought',
      description: 'GovAI will showcase its reasoning step-by-step, giving you full insight into how and why each vote is cast.',
      icon: IconBrain
    },
    {
      title: 'Twitter Integration',
      description: 'GovAI will post updates, gather community sentiment, and stay connected with token holders in real time on social media.',
      icon: IconTwitter
    },
    {
      title: 'Sentiment Parsing',
      description: 'Real-time analysis of community feedback to inform GovAI’s voting decisions and ensure its actions remain aligned with token holder sentiment.',
      icon: IconMessageCircle2
    },
    {
      title: 'Non-custodial Delegation & Agentic Governance',
      description: 'Delegate your votes without relinquishing control of your tokens. This feature paves the way for Agentic Governance as a Service, letting GovAI represent multiple DAOs seamlessly.',
      icon: IconShieldCheck
    }
  ];

  return (
    <div className="min-h-screen bg-[#0D1117] text-white">
      {/* Navigation */}
      <nav className="py-4 border-b border-[#3DD2C0]/10">
        <div className="container mx-auto flex justify-between items-center px-6">
          <div className="text-2xl font-bold">
            <span className="text-[#3DD2C0]">Gov</span>AI
          </div>
          <div className="flex space-x-6">
            <a href="https://github.com" target="_blank" rel="noopener noreferrer">
              <IconBrandGithub className="w-6 h-6 text-white/80 hover:text-[#3DD2C0] transition-colors" stroke={1.5} />
            </a>
            <a href="https://twitter.com" target="_blank" rel="noopener noreferrer">
              <IconBrandTwitter className="w-6 h-6 text-white/80 hover:text-[#3DD2C0] transition-colors" stroke={1.5} />
            </a>
            <a href="/docs" className="text-white/80 hover:text-[#3DD2C0] transition-colors">
              <IconBook className="w-6 h-6" stroke={1.5} />
            </a>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <div className="container mx-auto px-6">
        {/* Hero Section */}
        <div className="flex flex-col items-center justify-center min-h-[80vh] py-20">
          <div className="text-center max-w-3xl">
            <h1 className="text-7xl font-bold mb-6">
              <span className="text-[#3DD2C0]">Gov</span>AI
            </h1>
            <h2 className="text-3xl mb-12 text-white/90">Lead - Guide - Vote</h2>
            
            <div className="flex justify-center gap-4 mb-16">
              <div className="relative">
                <button
                  className="px-8 py-4 bg-[#1E2C3D] rounded-xl text-white/50 cursor-not-allowed"
                  disabled
                >
                  CHAIN OF THOUGHT
                </button>
                <span className="absolute -top-2 -right-2 bg-[#3DD2C0] text-[#0D1117] text-xs px-2 py-1 rounded-full">
                  Coming Soon
                </span>
              </div>
              <button
                onClick={() => router.push('/delegate')}
                className="px-8 py-4 bg-[#3DD2C0] rounded-xl text-[#0D1117] hover:bg-[#2FC1AF] transition-colors"
              >
                DELEGATE YOUR JUP
              </button>
            </div>

            <div className="space-y-6 mb-16">
              <h3 className="text-[#3DD2C0] text-xl font-medium tracking-wide">
                THE FIRST AI AGENT THAT VOTES FOR YOU
              </h3>
              <p className="text-2xl text-white/90">
                The Future of Governance is Autonomous.
              </p>
              <div className="max-w-2xl mx-auto space-y-4 text-white/70">
                <p>
                  Decentralized governance is complex and time-consuming. GovAI votes on your behalf,
                  ensuring you never miss a proposal or a reward. 
                </p>
                <p>
                  GovAI is live on Jupiter. Stake your JUP, earn rewards, set your own unstaking
                  timeframe for a fee, and let GovAI handle the voting. It’s straightforward, secure, 
                  and built for the next era of DAO participation.
                </p>
              </div>
            </div>

            <button
              onClick={() => router.push('/whitepaper')}
              className="px-8 py-4 bg-[#1E2C3D] rounded-xl text-white/80 hover:text-white border border-[#3DD2C0]/10 hover:border-[#3DD2C0]/30 transition-all"
            >
              WHITEPAPER
            </button>
          </div>
        </div>

        {/* Story Section with Image */}
        <div className="grid lg:grid-cols-2 gap-16 items-center mb-32 mt-12">
          <div className="space-y-8">
            <h3 className="text-[#3DD2C0] text-2xl font-medium">MEET GOVAI</h3>
            <div className="space-y-6 text-white/70">
              <p className="text-lg">
                GovAI is an advanced AI agent that interprets governance proposals, automates voting,
                and gives you flexibility with a user-defined unstaking window. You still earn Jupiter
                stake rewards (ASR), but now you can exit anytime you want by paying a small fee.
              </p>
              <p className="text-lg">
                Our goal is to become a leading “DAO politician,” championing <em>agentic governance</em>
                across multiple ecosystems. The first term for GovAI will last around three months,
                aligning with Jupiter’s voting cycle. For deeper technical details, visit our GitHub
                and GitBook.
              </p>
            </div>
            <div className="pt-6">
              <div className="text-white/60 text-lg mb-2">LEAD - GUIDE - VOTE</div>
              <div className="font-mono text-white/40 mb-8">CA: THERE IS NO TOKEN !!!</div>
              <button
                onClick={() => router.push('/delegate')}
                className="px-8 py-4 bg-[#3DD2C0] rounded-xl text-[#0D1117] hover:bg-[#2FC1AF] transition-colors"
              >
                DELEGATE YOUR JUP
              </button>
            </div>
          </div>
          <div className="relative h-[600px]">
            <div className="absolute inset-0 bg-gradient-to-br from-[#3DD2C0]/5 to-transparent rounded-3xl" />
            <Image
              src="/govai-hero.png"
              alt="GovAI Character"
              fill
              style={{ objectFit: 'contain' }}
              className="rounded-3xl"
              priority
            />
          </div>
        </div>
      </div>

      {/* Features Section: with a gradient background & floating glow */}
      <div className="relative bg-gradient-to-b from-[#14181F] to-[#0D1117] overflow-hidden py-32">
        {/* Subtle glowing orb in background */}
        <div className="absolute top-0 left-1/2 transform -translate-x-1/2 w-[700px] h-[700px] bg-[#3DD2C0]/20 rounded-full blur-3xl opacity-50" />
        
        <div className="relative z-10 container mx-auto px-6">
          <h2 className="text-[#3DD2C0] text-2xl font-medium text-center mb-16">
            FEATURES
          </h2>

          {/* Completed Features */}
          <div className="mb-12">
            <h3 className="text-xl text-white font-semibold mb-6">COMPLETED</h3>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
              {completedFeatures.map(({ title, description, icon: Icon }, idx) => (
                <div
                  key={idx}
                  className="relative bg-[#1E2C3D]/80 p-8 rounded-xl border border-[#3DD2C0]/10
                             hover:border-[#3DD2C0]/30 transition-all shadow-lg 
                             hover:shadow-[#3DD2C0]/50 hover:-translate-y-1"
                >
                  <Icon className="w-10 h-10 text-[#3DD2C0] mb-4" stroke={1.2} />
                  <h4 className="text-white text-lg font-medium mb-4">{title}</h4>
                  <p className="text-white/70">{description}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Upcoming Features */}
          <div>
            <h3 className="text-xl text-white font-semibold mb-6">UPCOMING</h3>
            <div className="grid md:grid-cols-2 lg:grid-cols-2 gap-8">
              {upcomingFeatures.map(({ title, description, icon: Icon }, idx) => (
                <div
                  key={idx}
                  className="relative bg-[#1E2C3D]/80 p-8 rounded-xl border border-[#3DD2C0]/10
                             hover:border-[#3DD2C0]/30 transition-all shadow-lg 
                             hover:shadow-[#3DD2C0]/50 hover:-translate-y-1"
                >
                  <Icon className="w-10 h-10 text-[#3DD2C0] mb-4" stroke={1.2} />
                  <h4 className="text-white text-lg font-medium mb-4">{title}</h4>
                  <p className="text-white/70">{description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
