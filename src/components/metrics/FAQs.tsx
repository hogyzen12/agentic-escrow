import React, { useState } from 'react';
import { IconChevronDown } from '@tabler/icons-react';

// FAQ data type
interface FAQ {
  question: string;
  answer: string | string[];
}

// Component props type
interface FAQsProps {
  className?: string;
}

const FAQs: React.FC<FAQsProps> = ({ className = '' }) => {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const faqs: FAQ[] = [
    {
      question: "1.What exactly does the GovAI do?",
      answer: "GovAI is a governance-focused AI Agent designed to facilitate JUP staking, delegation, and voting participation. The AI Agent stakes and votes on behalf of the users and accumulates the rewards for them."
    },
    {
      question: "2.How does staking with the AI Agent work?",
      answer: "Users stake their JUP tokens with GovAI and receive govJUP, representing their delegated JUP. The AI Agent votes on behalf of users and ensures their influence in governance while they earn ASR rewards."
    },
    {
      question: "3.What is the staking window?",
      answer: "Users can stake only during the \"staking window,\" which opens after ASR rewards become claimable and closes before the next vote. This ensures all participants JUP contributes equally to the same set of votes."
    },
    {
      question: "4.Can I unstake my JUP early, and are there any fees?",
      answer: "Yes, users can unstake their JUP early by withdrawing from the vault, but a fee applies. Early unstaking incurs a maximum fee of 30%, while waiting for 30 days reduces this fee to 0.1%. If the vault is depleted, users must wait the full 30-day period."
    },
    {
      question: "5.What happens if the vault runs out of funds?",
      answer: [
        "If too many users withdraw early, the vault may be depleted. In this case, users have two options:",
        "• Wait for the vault to be refilled (though this is not guaranteed).",
        "• Undergo the standard 30-day unstaking period to retrieve their JUP."
      ]
    },
    {
      question: "6.How does the AI Agent decide how to vote on proposals?",
      answer: "The AI Agent analyses each proposal based on its impact on Jupiter's ecosystem, governance, and tokenomics. It prioritizes fair representation, strategic governance, transparency and decides for the best interest of its community."
    },
    {
      question: "7.What rewards do I earn for staking my JUP?",
      answer: "By voting, the AI Agent earns ASR rewards in tokens and JUP. Once claimable, all rewards are converted to JUP. Users receive govJUP in their wallets, representing their share of the rewards in the global JUP pool. Additionally, stakers receive a portion of the fees from early unstakers."
    },
    {
      question: "8.What are the fees?",
      answer: "GovAI charges a 0.1% base fee for unstaking. Early unstaking incurs a variable fee based on withdrawal speed, with a maximum of 20% for immediate redemption. Half of the collected fees are distributed to stakers."
    },
    {
      question: "9.What happens in the case of early unstaking?",
      answer: "Users who redeem their JUP early must pay the fees outlined in section 7, which are deducted from their unstaked amount. They also forfeit any potential rewards and fees they would have been eligible for in the next ASR rewards distribution."
    }
  ];

  return (
    <div className={`bg-[#1E2C3D] rounded-xl p-6 ${className}`}>
      <h2 className="text-[#3DD2C0] text-xl font-semibold mb-6">FAQ</h2>
      <div className="space-y-4">
        {faqs.map((faq, index) => (
          <div 
            key={index}
            className="border border-[#3DD2C0]/10 rounded-lg overflow-hidden transition-all duration-200"
          >
            <button
              className="w-full px-6 py-4 text-left flex justify-between items-center hover:bg-[#2A3B4D] transition-colors"
              onClick={() => setOpenIndex(openIndex === index ? null : index)}
            >
              <span className="text-white/90 text-sm">{faq.question}</span>
              <IconChevronDown 
                className={`w-5 h-5 text-[#3DD2C0] transition-transform duration-200 ${
                  openIndex === index ? 'rotate-180' : ''
                }`}
              />
            </button>
            {openIndex === index && (
              <div className="px-6 py-4 text-white/70 text-sm border-t border-[#3DD2C0]/10 bg-[#2A3B4D]/50">
                {Array.isArray(faq.answer) ? (
                  <div className="space-y-2">
                    {faq.answer.map((line, i) => (
                      <p key={i}>{line}</p>
                    ))}
                  </div>
                ) : (
                  <p>{faq.answer}</p>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default FAQs;