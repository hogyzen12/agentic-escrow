'use client';

import { useRouter } from 'next/navigation';
import { 
  IconBrandGithub, 
  IconBrandTwitter, 
  IconBook
} from '@tabler/icons-react';
import Image from 'next/image';

export default function LandingPage() {
  const router = useRouter();

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
                  SPEAK WITH GOVAI
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
                  Decentralized governance is complex, inefficient, and time-consuming. GovAI changes that. GovAI votes
                  on your behalf, ensuring seamless participation without the hassle of tracking proposals.
                </p>
                <p>
                  GovAI is live on Jupiter. Stake your JUP, stay engaged effortlessly, earn rewards, and never miss a vote.
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
            <h3 className="text-[#3DD2C0] text-2xl font-medium">CONQUER THE WORLD</h3>
            <div className="space-y-6 text-white/70">
              <p className="text-lg">
                GovAI is represented by an ambitious feline set to reshape DAO history.
                Once a crypto trader, this Politician of DAOs saw the harsh truth: holder
                voices are often drowned out in governance, leaving communities without
                true representation.
              </p>
              <p className="text-lg">
                With sharp wit and unwavering resolve, it turns confusion into clarity, guiding
                communities through the labyrinth of DAO politics. By inviting the JUP
                community to delegate their tokens, this cat seeks to become their voice in
                the halls of power, championing fairness and transparency.
              </p>
            </div>
            <div className="pt-6">
              <div className="text-white/60 text-lg mb-2">LEAD - GUIDE - VOTE</div>
              <div className="font-mono text-white/40 mb-8">CA: fofofeofoefoefoeeoekkopurmp</div>
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

        {/* Aims Section */}
        <div className="py-32">
          <h3 className="text-[#3DD2C0] text-2xl font-medium text-center mb-16">AIMS</h3>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {[
              {
                title: "YOUR JUP GUARDIAN",
                description: "GovAI understands proposals and votes for its stakers. On top, it offers early unstaking to bypass the 30-day unlock."
              },
              {
                title: "VOICE OF THE ECOSYSTEM",
                description: "GovAI will get on social media, answering questions, sparking conversations, and keeping the community connected."
              },
              {
                title: "A LEADER IN THE MAKING",
                description: "GovAI will draft proposals, introduce fresh ideas, and push for progress to shape the future of the ecosystems."
              },
              {
                title: "BEYOND JUPITER",
                description: "Going beyond a representative of Jupiter DAO, GovAI has ambitions to lead the path in other DAOs."
              }
            ].map((aim, index) => (
              <div 
                key={index}
                className="bg-[#1E2C3D] p-8 rounded-xl border border-[#3DD2C0]/10 hover:border-[#3DD2C0]/30 transition-all"
              >
                <h4 className="text-white text-lg font-medium mb-4">{aim.title}</h4>
                <p className="text-white/70">{aim.description}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}