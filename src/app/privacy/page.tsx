import type { Metadata } from "next";
import { CONTACT_EMAIL, LegalPage } from "@/components/LegalPage";

export const metadata: Metadata = { title: "Privacy policy · Digly" };

export default function Privacy() {
  return (
    <LegalPage title="Privacy policy">
      <p>
        Digly is a daily word game. This page explains what we collect when you play, why we collect it, and what you can do about it. The short version: we
        keep what the game needs to work and what helps us improve it. We don&apos;t sell your data, we don&apos;t show ads, and we don&apos;t use ad
        trackers.
      </p>

      <h2>What we collect</h2>
      <h3>When you play as a guest</h3>
      <ul>
        <li>
          <b>A random guest ID</b> in a cookie (<code>digly_pid</code>). It isn&apos;t linked to your name or email. It keeps your place in a dig and enforces
          one ranked try per level each day.
        </li>
        <li>
          <b>What you type during a dig</b>, answers that matched and ones that didn&apos;t, plus your scores and times.
        </li>
        <li>
          <b>Settings and a progress cache</b> (sound, music, streaks, your analytics choice) in your browser&apos;s local storage. These stay on your device.
        </li>
        <li>
          <b>Your IP address</b>, used briefly to stop abuse with rate limits and to tell whether you&apos;re in a country where we must ask before running
          analytics. We don&apos;t store it in our database. Our hosting provider keeps standard server logs for a short time.
        </li>
        <li>
          <b>Prompt ideas</b> you send with Suggest a prompt.
        </li>
      </ul>
      <h3>When you make an account</h3>
      <ul>
        <li>
          <b>A username</b>, shown publicly on the leaderboard next to your score.
        </li>
        <li>
          <b>An email address.</b> It&apos;s required so you can reset your password, and we send one email to confirm it&apos;s yours. It&apos;s never shown
          to other players.
        </li>
        <li>
          <b>Your password</b>, if you use one, stored only as a one-way scrypt hash. We can&apos;t see it.
        </li>
        <li>
          <b>If you sign in with Google</b>, Google sends us your Google account ID and email address. We don&apos;t get your Google password, contacts, or
          anything else.
        </li>
        <li>
          <b>A login session</b> in a cookie (<code>digly_sid</code>) that lasts up to 90 days. We store only a hash of it.
        </li>
        <li>
          <b>Your game history</b>: which digs you played, your scores, and which topics you tend to do well in, worked out from those scores. This is what
          lets your streaks, stats and Vault follow you to another device.
        </li>
        <li>
          <b>Your choice about news emails</b>, and when you made it.
        </li>
      </ul>
      <h3>If you buy Digly Unlimited</h3>
      <ul>
        <li>
          <b>Payment</b> happens on Stripe&apos;s checkout page. Stripe collects your card details and email. We never see or store card numbers.
        </li>
        <li>
          <b>A purchase record</b> on our side: which account bought it, the amount, the date, and Stripe&apos;s reference IDs, so we can honor the purchase
          and handle refunds.
        </li>
      </ul>
      <h3>Usage stats and error reports</h3>
      <ul>
        <li>
          <b>Usage stats</b> through PostHog: pages and screens opened, and game events such as &quot;started a level&quot;, &quot;finished a level&quot;,
          &quot;left during a level&quot; or &quot;made an account&quot;, with numbers like scores, find counts and which prompt was played. These never include
          the answers you typed. PostHog also records your browser, device type and approximate location from your IP. We don&apos;t record your screen and
          don&apos;t use PostHog for advertising.
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
        <li>To improve the prompts and answer lists, for example by adding real answers people typed that we missed, and by seeing which topics players enjoy.</li>
        <li>To keep accounts secure and stop cheating and abuse.</li>
        <li>To send the emails you need: confirming your email address and password resets.</li>
        <li>To send news about Digly, only if you tick the box for it. That box starts unticked.</li>
        <li>To find and fix bugs and see which parts of the game people use.</li>
      </ul>
      <p>
        <b>We don&apos;t sell or rent personal information, we don&apos;t share it for advertising, and there are no ad trackers on Digly.</b>
      </p>

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
          <b>Resend</b> sends our emails.
        </li>
        <li>
          <b>Google</b>, only if you choose to sign in with it.
        </li>
        <li>
          <b>Stripe</b> processes payments for Digly Unlimited.
        </li>
        <li>
          <b>PostHog</b> handles usage stats.
        </li>
        <li>
          <b>Sentry</b> handles error reports.
        </li>
      </ul>
      <p>
        These services are mostly in the United States. We may also share information if the law requires it, or to protect players and the game from fraud
        or abuse.
      </p>

      <h2>How long we keep it</h2>
      <ul>
        <li>Account data is kept until you delete your account.</li>
        <li>Purchase records are kept as long as tax and accounting rules require, even after an account is deleted, but without your username.</li>
        <li>Guest game data is kept so rarity scores stay accurate. It isn&apos;t tied to your identity.</li>
        <li>Password reset links expire after one hour, email confirmation links after three days, and login sessions after 90 days.</li>
        <li>Usage stats and error reports are kept according to PostHog&apos;s and Sentry&apos;s retention settings, typically up to a year.</li>
      </ul>

      <h2>Your choices</h2>
      <ul>
        <li>
          <b>Delete your account</b> any time in Options. That removes your username, email, password, Google link, scores and history from our database,
          and asks PostHog to delete your usage stats too. It can&apos;t be undone.
        </li>
        <li>
          <b>Change your email</b> or <b>turn news emails on or off</b> in Options. Every news email also has an unsubscribe link.
        </li>
        <li>
          <b>Turn usage stats off</b> in Options. In the EU, the EEA, the UK and Switzerland we ask before turning them on.
        </li>
        <li>
          <b>Global Privacy Control and Do Not Track.</b> If your browser sends either signal, usage stats stay off.
        </li>
        <li>
          <b>Clear your guest data</b> by clearing this site&apos;s cookies and local storage in your browser.
        </li>
        <li>
          <b>Ask us</b> for a copy of your data, or to correct or delete it, at <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. We answer within 30
          days. Depending on where you live, you may have more rights under laws such as the GDPR, UK GDPR or CCPA, and we&apos;ll honor them. You can also
          complain to your local data protection authority.
        </li>
      </ul>

      <h2>Children</h2>
      <p>
        Digly is not meant for children under 13, and we don&apos;t knowingly collect personal information from anyone under 13. We don&apos;t ask for your age.
        If we learn that an account belongs to a child under 13, we delete it and its data. If you think a child under 13 has made an account, email{" "}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> and we&apos;ll delete it.
      </p>

      <h2>Security</h2>
      <p>
        Passwords and login tokens are hashed. The database can only be reached by our server, and all traffic is encrypted with HTTPS. No system is perfectly
        secure, so please use a password you don&apos;t use anywhere else.
      </p>

      <h2>Changes</h2>
      <p>If we change this policy, we&apos;ll update the date at the top. For big changes, we&apos;ll put a notice in the game.</p>

      <h2>Contact</h2>
      <p>
        Questions or requests: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>
    </LegalPage>
  );
}
