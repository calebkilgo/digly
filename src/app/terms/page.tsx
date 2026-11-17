import type { Metadata } from "next";
import { CONTACT_EMAIL, LegalPage } from "@/components/LegalPage";

export const metadata: Metadata = { title: "Terms of use · Digly" };

export default function Terms() {
  return (
    <LegalPage title="Terms of use">
      <p>
        These terms apply when you use Digly (&quot;Digly&quot;, &quot;we&quot;, &quot;us&quot;). By playing, you agree to them. If you don&apos;t agree,
        please don&apos;t use Digly.
      </p>

      <h2>Playing</h2>
      <ul>
        <li>Digly is free to play. You can play as a guest without an account.</li>
        <li>
          Each player gets one ranked try at each level per day. Practice runs never count toward the leaderboard.
        </li>
        <li>
          Scores, rarity values and answer lists can change as we fix mistakes and as more people play. We may correct or remove scores that came from a bug
          or from cheating.
        </li>
      </ul>

      <h2>Accounts</h2>
      <ul>
        <li>You need to be at least 13 to make an account.</li>
        <li>Each account is for one person. Keep your password private. You&apos;re responsible for what happens on your account.</li>
        <li>
          Usernames are public. Don&apos;t pick one that is offensive, hateful, sexual, impersonates someone, or includes someone else&apos;s personal
          information. We may rename or remove accounts that break this rule.
        </li>
        <li>You can delete your account any time in Options.</li>
      </ul>

      <h2>Fair play</h2>
      <p>Please don&apos;t:</p>
      <ul>
        <li>use bots, scripts or tools that type or submit answers for you;</li>
        <li>try to get answer lists or rarity values out of the game or its servers;</li>
        <li>make multiple accounts to get extra ranked tries or to manipulate the leaderboard;</li>
        <li>overload, probe or attack the service, or get around rate limits or security; or</li>
        <li>use Digly for anything illegal.</li>
      </ul>
      <p>We may suspend or delete accounts that break these rules, and remove their scores.</p>

      <h2>Paid features</h2>
      <p>
        Digly may offer paid extras later, such as the archive of past digs. Those will come with their own prices and terms, shown before you pay.
      </p>

      <h2>Our content</h2>
      <p>
        The game, its art, music, code and name belong to Digly. You can share your results and screenshots freely. Please don&apos;t copy the game or
        republish its answer lists and rarity data. Some answer lists start from public sources and are then curated and scored by us.
      </p>

      <h2>No guarantees</h2>
      <p>
        Digly is provided &quot;as is&quot;. We work to keep it running and correct, but we don&apos;t promise it will always be available, error-free, or
        that every valid answer is accepted. To the extent the law allows, we aren&apos;t liable for indirect or consequential losses from using Digly. For
        a free game, our total liability is limited to US$50.
      </p>

      <h2>Changes and ending</h2>
      <p>
        We may update these terms. If we do, we&apos;ll change the date at the top, and continuing to play means you accept the new version. We may change
        or stop the game at any time. You can stop using it whenever you like.
      </p>

      <h2>Law</h2>
      <p>These terms are governed by the laws of the State of Alabama, USA, apart from conflict-of-law rules.</p>

      <h2>Contact</h2>
      <p>
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
      </p>
    </LegalPage>
  );
}
