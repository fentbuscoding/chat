import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Rules - TinChat',
  description: 'Community guidelines and rules for using TinChat.',
};

export default function RulesPage() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center bg-black text-white p-4 min-h-screen">
      <div className="max-w-2xl w-full text-center space-y-8">
        <h1 className="text-4xl font-bold">Community Guidelines</h1>
        <p className="text-lg text-gray-300">
          Welcome to TinChat! To keep our community safe, friendly, and enjoyable for everyone, please follow these guidelines:
        </p>
        <div className="text-left bg-gray-900 p-6 sm:p-8 rounded-lg shadow-xl space-y-6">
          <section className="space-y-2">
            <h2 className="text-2xl font-semibold border-b border-gray-700 pb-2">1. Be Respectful</h2>
            <p>
              Treat all users with kindness and respect. Harassment, bullying, hate speech, discrimination, or threats of any kind are strictly prohibited.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-2xl font-semibold border-b border-gray-700 pb-2">2. No Illegal Content or Activities</h2>
            <p>
              Do not share, promote, or engage in illegal content or activities, including but not limited to child exploitation, illegal drug use, or copyright infringement.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-2xl font-semibold border-b border-gray-700 pb-2">3. Protect Personal Information</h2>
            <p>
              Never share your own or anyone else’s personal information (such as real names, addresses, phone numbers, emails, social media, or financial details). Protect your privacy and the privacy of others.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-2xl font-semibold border-b border-gray-700 pb-2">4. No Impersonation</h2>
            <p>
              Do not impersonate other users, public figures, or TinChat staff. Misrepresentation is not allowed.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-2xl font-semibold border-b border-gray-700 pb-2">5. Age Requirements</h2>
            <p>
              You must be at least 18 years old to use TinChat. Users aged 13–17 may only use the service with explicit parental or guardian consent, and their guardian must agree to these rules and our Terms of Service.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-2xl font-semibold border-b border-gray-700 pb-2">6. No Spamming or Malicious Content</h2>
            <p>
              Spamming, advertising, or sharing malicious links (such as phishing or malware) is not permitted.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-2xl font-semibold border-b border-gray-700 pb-2">7. Moderation & Enforcement</h2>
            <p>
              TinChat reserves the right to monitor and moderate all content and user activity. Violations may result in warnings, temporary suspensions, or permanent bans without prior notice.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-2xl font-semibold border-b border-gray-700 pb-2">8. Reporting Issues</h2>
            <p>
              If you encounter rule violations or unsafe behavior, please report it to our team at{' '}
              <a
                href="mailto:support@tinchat.online"
                className="text-blue-400 hover:underline"
              >
                support@tinchat.online
              </a>.
            </p>
          </section>

          <p className="text-sm italic mt-8 text-gray-400">
            These guidelines may be updated at any time. By using TinChat, you agree to follow these rules and help us maintain a positive community.
          </p>
        </div>
      </div>
    </div>
  );
}
