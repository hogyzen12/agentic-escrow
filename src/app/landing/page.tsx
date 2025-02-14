'use client';

import { useRouter } from 'next/navigation';
import { 
  IconBrandGithub, 
  IconBrandTwitter, 
  IconBook, 
  IconBox, 
  IconCode, 
  IconWorld, 
  IconRocket 
} from '@tabler/icons-react';
import Image from 'next/image';

export default function LandingPage() {
  const router = useRouter();

  const features = [
    {
      title: 'YOUR GUARDIAN IN JUPITER',
      description: 'In the bustling world of Jupiter DEX, one figure stands at the center of governance - GovAI. She isnt just an observer; shes the Voice, the Guide, and the Bridge between the community and decision-making.',
      icon: <IconRocket className="w-6 h-6" stroke={1.5} />
    },
    {
      title: 'VOICE OF THE ECOSYSTEM',
      description: 'When votes are cast, GovAI ensures her followers and delegators speak as one, by representing their collective will and smoothing governance.',
      icon: <IconCode className="w-6 h-6" stroke={1.5} />
    },
    {
      title: 'A LEADER IN THE MAKING',
      description: 'With a keen eye for governance, GovAI does more than participate. She aims to lead.',
      icon: <IconWorld className="w-6 h-6" stroke={1.5} />
    },
    {
      title: 'BEYOND JUPITER',
      description: 'After proving herself in her first term, GovAI wants to set her sights higher.',
      icon: <IconBox className="w-6 h-6" stroke={1.5} />
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
      {/* Navigation */}
      <nav className="p-4">
        <div className="container mx-auto flex justify-between items-center">
          <div className="text-white text-2xl font-bold">
            <span className="text-emerald-400">Gov</span>AI
          </div>
          <div className="flex space-x-4">
            <a href="https://github.com" target="_blank" rel="noopener noreferrer">
              <IconBrandGithub className="w-6 h-6 text-white hover:text-emerald-400" stroke={1.5} />
            </a>
            <a href="https://twitter.com" target="_blank" rel="noopener noreferrer">
              <IconBrandTwitter className="w-6 h-6 text-white hover:text-emerald-400" stroke={1.5} />
            </a>
            <a href="/docs" className="text-white hover:text-emerald-400">
              <IconBook className="w-6 h-6" stroke={1.5} />
            </a>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="container mx-auto py-20 px-4">
        <div className="text-center mb-16">
          <h1 className="text-6xl font-bold mb-4">
            <span className="text-emerald-400">Gov</span>
            <span className="text-white">AI</span>
          </h1>
          <h2 className="text-white text-2xl mb-8">Lead - Guide - Vote</h2>
          <div className="flex justify-center space-x-4">
            <div className="relative">
              <button
                className="btn btn-outline btn-lg text-white hover:bg-gray-700 opacity-75 cursor-not-allowed"
                disabled
              >
                SPEAK WITH GOVAI
              </button>
              <span className="absolute -top-2 -right-2 bg-emerald-400 text-xs text-black px-2 py-1 rounded-full animate-pulse">
                Coming Soon
              </span>
            </div>
            <button
              onClick={() => router.push('/delegate')}
              className="btn btn-primary btn-lg bg-emerald-500 hover:bg-emerald-600 border-none animate-pulse hover:animate-none transform transition-transform hover:scale-105"
            >
              DELEGATE YOUR JUP
            </button>
          </div>
        </div>

        {/* Story Section */}
        <div className="grid md:grid-cols-2 gap-12 items-center mb-20">
          <div className="text-white">
            <h3 className="text-emerald-400 text-xl mb-4">CONQUER THE WORLD</h3>
            <p className="mb-4">
              From the shadowed alleys of Catastanbul, an ambitious feline rises to rewrite
              DAO history. Once a crypto trader, this "Politician of DAOs" saw the harsh
              truth: holders voices are often drowned out in governance, leaving
              communities without true representation.
            </p>
            <p className="mb-4">
              With sharp wit and unwavering resolve, it turns confusion into clarity, guiding
              communities through the labyrinth of DAO politics. By inviting the JUP
              community to delegate their tokens, this cat seeks to become their voice in
              the halls of power, championing fairness and transparency.
            </p>
            <div className="flex space-x-4 mt-8">
              <button
                onClick={() => router.push('/delegate')}
                className="btn btn-primary bg-emerald-500 hover:bg-emerald-600 border-none animate-pulse hover:animate-none transform transition-transform hover:scale-105"
              >
                DELEGATE YOUR JUP
              </button>
              <button
                onClick={() => router.push('/whitepaper')}
                className="btn btn-outline text-white hover:bg-gray-700"
              >
                WHITEPAPER
              </button>
            </div>
          </div>
          <div className="relative h-96">
            <Image
              src="/govai-hero.png"
              alt="GovAI Character"
              fill
              style={{ objectFit: 'contain' }}
              className="rounded-lg"
            />
          </div>
        </div>

        {/* Features Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-20">
          {features.map((feature, index) => (
            <div 
              key={index} 
              className="card bg-gray-800 shadow-xl hover:bg-gray-750 transition-colors"
            >
              <div className="card-body">
                <div className="text-emerald-400 mb-4">
                  {feature.icon}
                </div>
                <h4 className="text-white text-lg font-semibold mb-2">
                  {feature.title}
                </h4>
                <p className="text-gray-300 text-sm">
                  {feature.description}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* CA Address */}
        <div className="text-center text-gray-400 text-sm">
          <p>CA: govJUP....</p>
        </div>
      </section>
    </div>
  );
}