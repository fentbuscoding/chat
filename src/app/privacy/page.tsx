import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy - TinChat',
  description: 'Learn how TinChat collects, uses, and protects your information.',
};

export default function PrivacyPage() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center bg-black text-white p-4 min-h-screen">
      <div className="max-w-2xl w-full text-center space-y-8">
        <h1 className="text-4xl font-bold">Privacy Policy</h1>
        <p className="text-sm text-gray-400">
          Last Updated: {new Date().toLocaleDateString()}
        </p>

        <div className="text-left bg-gray-900 p-6 sm:p-8 rounded-lg shadow-xl space-y-6">
          <p>
            TinChat ("we", "us", or "our") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, and safeguard your information when you use our website and services (the "Service"). By accessing or using TinChat, you agree to the terms outlined in this policy.
          </p>

          <section className="space-y-2">
            <h2 className="text-2xl font-semibold">1. Information We Collect</h2>
            <ul className="list-disc list-inside pl-4 space-y-1">
              <li>
                <strong>Interests (Optional):</strong> If you choose to provide interests, we use them only to match you with users who share similar interests. This information is not permanently linked to your identity and is discarded after your session.
              </li>
              <li>
                <strong>Usage Data:</strong> We automatically collect certain technical information, such as your IP address, browser type, device information, pages visited, and timestamps. This data helps us operate, secure, and improve the Service.
              </li>
              <li>
                <strong>Chat Content:</strong> Messages exchanged during a session are relayed through our servers to enable communication. We do not permanently store chat logs tied to identifiable users, except as required for moderation, safety, or legal compliance.
              </li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-2xl font-semibold">2. How We Use Your Information</h2>
            <ul className="list-disc list-inside pl-4 space-y-1">
              <li>To provide, operate, and maintain the Service</li>
              <li>To match users based on shared interests (if provided)</li>
              <li>To monitor and analyze usage for performance and security</li>
              <li>To detect, prevent, and address technical issues or abuse</li>
              <li>To enforce our Terms of Service and Community Guidelines</li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-2xl font-semibold">3. Information Sharing</h2>
            <p>
              We do <span className="font-bold">not</span> sell your personal information. We may disclose information if required by law, to comply with legal obligations, or to protect the rights, safety, and property of TinChat, our users, or the public.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-2xl font-semibold">4. Data Security</h2>
            <p>
              We use commercially reasonable measures to protect your data. However, no method of transmission or storage is 100% secure. We cannot guarantee absolute security, but we strive to safeguard your information to the best of our ability.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-2xl font-semibold">5. Cookies & Tracking Technologies</h2>
            <ul className="list-disc list-inside pl-4 space-y-1">
              <li>
                <strong>Theme Preferences:</strong> We use localStorage to remember your theme settings.
              </li>
              <li>
                <strong>Analytics:</strong> We use Firebase Analytics to collect anonymous usage data. This may involve cookies set by Google. Learn more at{' '}
                <a
                  href="https://policies.google.com/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:underline"
                >
                  policies.google.com/privacy
                </a>.
              </li>
            </ul>
            <p>
              You can set your browser to refuse cookies, but some features may not function properly if you do.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-2xl font-semibold">6. Children's Privacy</h2>
            <p>
              TinChat is not intended for children under 13. We do not knowingly collect personal information from children under 13. If you believe your child has provided us with personal data, please contact us so we can remove it.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-2xl font-semibold">7. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. Changes will be posted on this page with an updated date. Please review this policy periodically.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-2xl font-semibold">8. Contact Us</h2>
            <p>
              If you have questions or concerns about this Privacy Policy, please contact us at{' '}
              <a
                href="mailto:privacy@tinchat.online"
                className="text-blue-400 hover:underline"
              >
                privacy@tinchat.online
              </a>.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
