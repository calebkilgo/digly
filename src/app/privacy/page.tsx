import type { Metadata } from "next";
import { CONTACT_EMAIL, LegalPage } from "@/components/LegalPage";

export const metadata: Metadata = { title: "Privacy policy · Digly" };

export default function Privacy() {
  return (
    <LegalPage title="Privacy policy">
      <p>
        Digly is a daily word game. This page explains what we collect when you play, why, and what you can do about it. The short version: we keep what the
        game needs to work, we don&apos;t sell your data, and we don&apos;t show ads.
      </p>

      <h2>What we collect</h2>
      <h3>When you play as a guest</h3>
      <ul>
        <li>
          <b>A random guest ID</b>, stored in a cookie (<code>digly_pid</code>). It isn&apos;t linked to your name or email. It lets the game keep your place
          and enforce one ranked try per level each day.
        </li>
        <li>
          <b>What you type during a dig</b>, both answers that matched and ones that didn&apos;t, plus your scores and timestamps.
        </li>
        <li>
          <b>Settings and a progress cache</b> (sound, music, streaks) in your browser&apos;s local storage. These stay on your device.
        </li>
        <li>
          <b>Your IP address</b>, used briefly to stop abuse with rate limits. We don&apos;t store it in our database. Our hosting provider keeps standard
          server logs for a short time.
        </li>
      </ul>
      <h3>When you make an account</h3>
      <ul>
        <li>
          <b>A username</b>, which is shown publicly on the leaderboard next to your score.
        </li>
        <li>
          <b>Your password</b>, stored only as a one-way scrypt hash. We can&apos;t see it.
        </li>
        <li>
          <b>An email address, if you add one.</b> It&apos;s optional and only used for password reset emails. It&apos;s never shown to other players.
        </li>
        <li>
          <b>A login session</b> in a cookie (<code>digly_sid</code>) that lasts up to 90 days. We store only a hash of it.
        </li>
      </ul>
      <h3>If you buy Digly Unlimited</h3>
      <ul>
        <li>
          <b>Payment</b> happens on Stripe&apos;s checkout page. Stripe collects your card details and email; we never see or store card numbers.
        </li>
        <li>
          <b>A purchase record</b> on our side: which account bought it, the amount, the date, and Stripe&apos;s reference IDs, so we can honor the
          purchase and handle refunds.
        </li>
      </ul>
      <h3>Usage and error tracking</h3>
      <ul>
        <li>
          <b>Usage events</b> through PostHog: page views and game events such as &quot;started a dig&quot;, &quot;finished a level&quot;, or &quot;made an
          account&quot;, with numbers like scores and find counts. These events never include the answers you typed. PostHog also records your browser,
          device type and approximate location from your IP. We don&apos;t record your screen, and we honor Do Not Track.
        </li>
        <li>
          <b>Error reports</b> through Sentry when something breaks, with technical details about your browser and what went wrong.
        </li>
      </ul>

      <h2>How we use it</h2>
      <ul>
        <li>To run the game: check answers, keep score, save progress, and show the leaderboard.</li>
        <li>
          To work out rarity. An answer&apos;s score comes from how many players found it on earlier days. This uses counts across all players, not anything
          about you personally.
        </li>
        <li>To improve the answer lists. We look at common answers that didn&apos;t match so we can add real ones we missed.</li>
        <li>To keep accounts secure and stop cheating and abuse.</li>
        <li>To send password reset emails you ask for. We don&apos;t send marketing email.</li>
        <li>To find and fix bugs and see which parts of the game people use.</li>
      </ul>
      <p>We don&apos;t sell or rent personal information, and we don&apos;t use it for advertising.</p>

      <h2>Who we share it with</h2>
      <p>Only the services that run Digly for us, and only what each one needs:</p>
      <ul>
        <li>
          <b>Vercel</b> hosts the site.
        </li>
        <li>
          <b>Supabase</b> stores the game database.
        </li>
        <li>
          <b>Resend</b> sends password reset emails.
        </li>
        <li>
          <b>Stripe</b> processes payments for Digly Unlimited.
        </li>
        <li>
          <b>PostHog</b> handles usage analytics.
        </li>
        <li>
          <b>Sentry</b> handles error reports.
        </li>
      </ul>
      <p>
        These services are mostly in the United States. We may also share information if the law requires it, or to protect players and the game from
        fraud or abuse.
      </p>

      <h2>How long we keep it</h2>
      <ul>
        <li>Account data is kept until you delete your account.</li>
        <li>Purchase records are kept as long as tax and accounting rules require, even after an account is deleted, but without your username.</li>
        <li>Guest game data is kept so rarity scores stay accurate. It isn&apos;t tied to your identity.</li>
        <li>Password reset links expire after one hour. Login sessions expire after 90 days.</li>
        <li>Analytics and error data are kept according to PostHog&apos;s and Sentry&apos;s retention settings, typically up to a year.</li>
      </ul>

      <h2>Your choices</h2>
      <ul>
        <li>
          <b>Delete your account</b> any time in Options. That removes your username, password, email, scores and history. It can&apos;t be undone.
        </li>
        <li>
          <b>Change or remove your email</b> in Options.
        </li>
        <li>
          <b>Clear your guest data</b> by clearing this site&apos;s cookies and local storage in your browser.
        </li>
        <li>
          <b>Turn on Do Not Track</b> in your browser to stop usage analytics.
        </li>
        <li>
          <b>Ask us</b> for a copy of your data, or to correct or delete it, at <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. Depending on where
          you live, you may have more rights under laws such as the GDPR or CCPA, and we&apos;ll honor them.
        </li>
      </ul>

      <h2>Children</h2>
      <p>
        Digly isn&apos;t aimed at children under 13, and we don&apos;t knowingly collect personal information from them. If you think a child under 13 has
        made an account, email us and we&apos;ll delete it.
      </p>

      <h2>Security</h2>
      <p>
        Passwords and login tokens are hashed. The database can only be reached by our server, and all traffic is encrypted with HTTPS. No system is
        perfectly secure, so please use a password you don&apos;t use anywhere else.
      </p>

      <h2>Changes</h2>
      <p>
        If we change this policy, we&apos;ll update the date at the top. For big changes, we&apos;ll put a notice in the game.
      </p>

      <h2>Contact</h2>
      <p>
        Questions or requests: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>
    </LegalPage>
  );
}
